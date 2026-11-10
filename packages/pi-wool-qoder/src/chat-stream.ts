// chat-stream.ts — streamSimple 协议翻译（Qoder SSE 信封 → pi 标准事件流）。
//
// 链路：组装请求体（chat-body）→ qoderEncode → COSY 签名头 → globalThis.fetch（D1
// 约束：统一走包装层）→ SSE 信封解包（参考实现 iter_inner_sse 同规则）→ 内层 OpenAI
// chunk 事件翻译（driver 发射；事件流纪律由 wool-shared createAssistantStream 骨架
// 承担）。start 事件在首个信封确认非排队通知后发出（请求建立失败与排队预算耗尽都
// 发生在 start 之前，骨架直接以 error 终态）；上游免费档排队（403 isQueued 信封）
// 按 retryAfterSeconds 轮询重发，总预算 QUEUE_TOTAL_BUDGET_MS 封顶。

import type { SseEvent, WoolStreamDriverContext, WoolStreamOutcome } from "@zhushanwen/pi-wool-shared";
import { parseSseStream, WoolStreamAdapterError } from "@zhushanwen/pi-wool-shared";
import type { JsonObject, Message, Tool } from "@earendil-works/pi-ai";

import type { QoderAuthStore, QoderModelMeta } from "@zhushanwen/pi-wool-shared/qoder";
import { CHAT_PATH, GATEWAY_BASE_URL, qoderEncode } from "@zhushanwen/pi-wool-shared/qoder";

import { buildQoderBody, lastUserPrompt } from "./chat-body.ts";

/** 信封/HTTP 层语义常量（错误分类与截断口径）。 */
const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
/** 错误消息内上游响应摘录的最大长度（防长错误文本刷屏）。 */
const ERROR_DETAIL_LENGTH = 300;
/** 上游排队轮询总预算（毫秒）：真机实测 auto 档 ~7 分钟排到；预算内未排到即报
 * 可操作错误，不做无限等待。 */
const QUEUE_TOTAL_BUDGET_MS = 10 * 60 * 1000;
/** 排队通知缺省重试间隔（秒）：通知载荷无可读数值时的兜底。 */
const QUEUE_RETRY_DEFAULT_SECONDS = 60;
/** 重试间隔下限（毫秒）：上游给出 0/极小值时防紧密重试环。 */
const QUEUE_RETRY_FLOOR_MS = 1000;
/** 排队等待期的 abort 检查粒度（毫秒）。 */
const QUEUE_DELAY_SLICE_MS = 250;

/** 内层 OpenAI chunk 的工具调用增量形态。 */
type UpstreamToolCallDelta = {
	index?: number;
	id?: string;
	type?: string;
	function?: { name?: string; arguments?: string };
};

type UpstreamDelta = {
	content?: string | { type?: string; text?: string }[];
	reasoning_content?: string;
	tool_calls?: UpstreamToolCallDelta[];
};

type UpstreamChunk = {
	id?: string;
	choices?: { delta?: UpstreamDelta; finish_reason?: string }[];
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		total_tokens?: number;
		prompt_cache_hit_tokens?: number;
		prompt_tokens_details?: { cached_tokens?: number };
		completion_tokens_details?: { reasoning_tokens?: number };
	};
};

/** 信封形态（上游 SSE data 行：{headers, body, statusCodeValue}；body 为内层 chunk
 * JSON 字符串或 "[DONE]"）。 */
type OuterEnvelope = {
	statusCodeValue?: number | string;
	body?: unknown;
};

function parseJsonObject(line: string): Record<string, unknown> | undefined {
	try {
		const parsed: unknown = JSON.parse(line);
		if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
	} catch {
		// 非 JSON 行（计时元数据等）按忽略处理——上游 event:finish 行不带 data 载荷。
		return undefined;
	}
	return undefined;
}

function envelopeStatus(envelope: OuterEnvelope): number | undefined {
	const status = envelope.statusCodeValue;
	if (typeof status === "number") {
		return status;
	}
	if (typeof status === "string" && status.length > 0) {
		const parsed = Number(status);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}

/** 上游排队通知（免费档饱和时网关以 SSE 信封投递：statusCodeValue 403 + isQueued 载荷，
 * 实测含 queueType "p4" / waitTime / retryAfterSeconds；模型在队列排到前拒绝服务）。 */
type QueueNotice = { retryAfterSeconds: number; detail: string };

/** 排队信封判定：仅认 statusCodeValue 403 + body 载荷 isQueued === true。其余非 200
 * 信封（凭据被拒、内容风控等）维持流内抛错路径——排队判定不得吞掉它们。body 兼容
 * 字符串（正常信封形态：内层 JSON 字符串）与对象两种形态；入参 undefined（无信封）
 * 一律非排队。 */
function queueNoticeFrom(envelope: Record<string, unknown> | undefined): QueueNotice | undefined {
	if (envelope === undefined || envelopeStatus(envelope as OuterEnvelope) !== HTTP_FORBIDDEN) {
		return undefined;
	}
	let payload: Record<string, unknown> | undefined;
	if (typeof envelope.body === "string") {
		payload = parseJsonObject(envelope.body);
	} else if (typeof envelope.body === "object" && envelope.body !== null && !Array.isArray(envelope.body)) {
		payload = envelope.body as Record<string, unknown>;
	}
	if (payload === undefined || payload.isQueued !== true) {
		return undefined;
	}
	const retryAfterSeconds =
		typeof payload.retryAfterSeconds === "number" && Number.isFinite(payload.retryAfterSeconds)
			? payload.retryAfterSeconds
			: typeof payload.waitTime === "number" && Number.isFinite(payload.waitTime)
				? payload.waitTime
				: QUEUE_RETRY_DEFAULT_SECONDS;
	return { retryAfterSeconds, detail: JSON.stringify(envelope).slice(0, ERROR_DETAIL_LENGTH) };
}

/** 取流的首个 JSON 信封事件（跳过计时元数据等非 JSON 行）；流耗尽返回 undefined。 */
async function nextJsonEnvelope(events: AsyncGenerator<SseEvent>): Promise<SseEvent | undefined> {
	for (;;) {
		const step = await events.next();
		if (step.done) {
			return undefined;
		}
		if (parseJsonObject(step.value.data) !== undefined) {
			return step.value;
		}
	}
}

/** 可中断等待（abort 检查粒度 QUEUE_DELAY_SLICE_MS；aborted 时与流内中断同口径抛 "aborted"）。 */
async function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
	const deadline = Date.now() + ms;
	for (;;) {
		if (signal.aborted) {
			throw new Error("aborted");
		}
		const remaining = deadline - Date.now();
		if (remaining <= 0) {
			return;
		}
		await new Promise<void>((resolve) => setTimeout(resolve, Math.min(QUEUE_DELAY_SLICE_MS, remaining)));
	}
}

/** 工具调用增量聚合器（hub aggregate_stream 口径：按 index 分组，id/name/arguments
 * 增量拼接）。流终态产出完整调用列表。 */
class ToolCallAggregator {
	private readonly calls = new Map<number, { id: string; name: string; arguments: string }>();

	absorb(deltas: UpstreamToolCallDelta[] | undefined): void {
		if (deltas === undefined) {
			return;
		}
		for (const delta of deltas) {
			const index = typeof delta.index === "number" ? delta.index : this.calls.size;
			const entry = this.calls.get(index) ?? { id: "", name: "", arguments: "" };
			if (typeof delta.id === "string" && delta.id.length > 0) {
				entry.id = delta.id;
			}
			if (typeof delta.function?.name === "string" && delta.function.name.length > 0) {
				entry.name += delta.function.name;
			}
			if (typeof delta.function?.arguments === "string") {
				entry.arguments += delta.function.arguments;
			}
			this.calls.set(index, entry);
		}
	}

	/** 终态产出：arguments 必须解析为对象（pi 协议要求 toolcall_end 时参数为有效
	 * 已解析输入）；解析失败抛错转 error 终态，不静默产出残缺调用。
	 * JSON.parse 的产物在值层面必然是合法 JSON 值——对象形态经 guard 后断言为
	 * JsonObject（运行时已排除 null/数组/原始值）。 */
	settle(): { id: string; name: string; arguments: JsonObject }[] {
		return [...this.calls.entries()]
			.sort(([a], [b]) => a - b)
			.filter(([, call]) => call.name.length > 0)
			.map(([, call]) => {
				let parsed: unknown;
				try {
					parsed = call.arguments.trim().length === 0 ? {} : JSON.parse(call.arguments);
				} catch (error) {
					throw new WoolStreamAdapterError(
						`qoder: tool call "${call.name}" has unparseable arguments: ${error instanceof Error ? error.message : String(error)}`,
					);
				}
				if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
					throw new WoolStreamAdapterError(`qoder: tool call "${call.name}" arguments are not a JSON object`);
				}
				return { id: call.id, name: call.name, arguments: parsed as JsonObject };
			});
	}
}

function contentText(content: UpstreamDelta["content"]): string {
	if (typeof content === "string") {
		return content;
	}
	if (Array.isArray(content)) {
		return content.map((part) => (typeof part?.text === "string" ? part.text : "")).join("");
	}
	return "";
}

/** streamSimple drive 实装（scaffold WoolStreamImplementation 签名）。 */
export function createQoderDrive(options: {
	authStore: QoderAuthStore;
	/** fetch 注入点（测试 mock；生产 = globalThis.fetch）。 */
	fetchImpl?: typeof globalThis.fetch;
	/** 模型元数据反查（id → 目录 meta；缺省 = 快照内置）。 */
	lookupModelMeta?: (modelId: string) => QoderModelMeta | undefined;
}) {
	const fetchImpl = options.fetchImpl ?? globalThis.fetch;
	return async function drive(input: {
		model: { id: string };
		systemPrompt: string;
		messages: Message[];
		tools: Tool[];
		driver: WoolStreamDriverContext;
		maxTokens?: number;
	}): Promise<WoolStreamOutcome> {
		const { driver } = input;
		const state = options.authStore.current();
		if (state === undefined) {
			throw new Error("qoder: no credentials; run the provider login (extract) first");
		}
		const session = options.authStore.session();
		if (session === undefined) {
			throw new Error("qoder: credential has no user id; re-run the provider login");
		}
		const meta = options.lookupModelMeta?.(input.model.id) ?? {
			key: input.model.id,
			displayName: input.model.id,
			isVl: false,
			isReasoning: false,
			maxInputTokens: 0,
		};

		const { body, bodyText, modelKey } = buildQoderBody({
			systemPrompt: input.systemPrompt,
			messages: input.messages,
			tools: input.tools,
			modelMeta: meta,
			userIdentity: { userType: state.userType },
			prompt: lastUserPrompt(input.messages),
			maxTokens: input.maxTokens,
		});
		// 仪表钩子：pi 内建 provider 同款——请求发出前交给 onPayload（可替换）。
		const finalBody = (await driver.onPayload(body)) as Record<string, unknown> | undefined;
		const payloadText = finalBody === undefined ? bodyText : JSON.stringify(finalBody);
		const encodedBody = qoderEncode(new Uint8Array(Buffer.from(payloadText, "utf8")));

		const url = `${GATEWAY_BASE_URL}${CHAT_PATH}`;
		// 排队轮询环：每轮重新签名发请求（COSY 头含时戳，不可复用首轮头）。排队
		// 通知必须在 driver.open() 之前消化——骨架 open() 只许调用一次（发 start），
		// 重试轮不得再发；预算耗尽报可操作错误，不做无限等待。
		const queueDeadline = Date.now() + QUEUE_TOTAL_BUDGET_MS;
		let queueRetries = 0;
		for (;;) {
			const response = await fetchImpl(url, {
				method: "POST",
				headers: session.headers(encodedBody, url, modelKey, true),
				body: encodedBody,
				signal: driver.signal,
			});
			await driver.onResponse({ status: response.status, headers: Object.fromEntries(response.headers.entries()) });
			if (!response.ok) {
				const detail = (await response.text()).slice(0, ERROR_DETAIL_LENGTH);
				// 401/403 = 凭据被拒（token 失效/风控），消息指向重新登录恢复动作。
				const rejected = response.status === HTTP_UNAUTHORIZED || response.status === HTTP_FORBIDDEN;
				const hint = rejected ? " (credential rejected; re-login the provider)" : "";
				throw new Error(`qoder chat upstream HTTP ${response.status}${hint}: ${detail}`);
			}
			if (response.body === null) {
				throw new Error("qoder chat upstream returned an empty body");
			}

			// 窥探首个 JSON 信封（跳过计时元数据行）：排队通知则等待后重发整请求；
			// 否则进入正常消费——窥探持有的事件经 pending 槽交回主循环处理。
			const events = parseSseStream(response.body, driver.signal);
			const head = await nextJsonEnvelope(events);
			const queue = head === undefined ? undefined : queueNoticeFrom(parseJsonObject(head.data));
			if (queue !== undefined) {
				await events.return(undefined);
				await response.body.cancel();
				const waitMs = Math.max(queue.retryAfterSeconds * 1000, QUEUE_RETRY_FLOOR_MS);
				if (Date.now() + waitMs > queueDeadline) {
					throw new Error(
						`qoder chat upstream queue not drained within ${Math.round(QUEUE_TOTAL_BUDGET_MS / 1000)}s ` +
							`after ${queueRetries} retries (last notice: ${queue.detail}); ` +
							"retry later or switch model",
					);
				}
				await abortableDelay(waitMs, driver.signal);
				queueRetries += 1;
				continue;
			}

			driver.open();

			const aggregator = new ToolCallAggregator();
			const usage: WoolStreamOutcome["usage"] = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
			let stopReason: WoolStreamOutcome["stopReason"] = "stop";
			let responseId: string | undefined;
			let sawFinish = false;

			let pending: SseEvent | undefined = head;
			for (;;) {
				let event: SseEvent;
				if (pending !== undefined) {
					event = pending;
					pending = undefined;
				} else {
					const step = await events.next();
					if (step.done) {
						break;
					}
					event = step.value;
				}
				if (driver.signal.aborted) {
					throw new Error("aborted");
				}
				const envelope = parseJsonObject(event.data);
				if (envelope === undefined) {
					continue;
				}
				await driver.onProviderStreamEvent(envelope);
				const status = envelopeStatus(envelope);
				if (status !== undefined && status !== HTTP_OK) {
					const detail = typeof envelope.body === "string" ? envelope.body : JSON.stringify(envelope);
					throw new Error(`qoder chat upstream envelope status ${status}: ${detail.slice(0, ERROR_DETAIL_LENGTH)}`);
				}
				if (envelope.body === "[DONE]") {
					break;
				}
				if (typeof envelope.body !== "string") {
					continue;
				}
				const chunk = parseJsonObject(envelope.body) as UpstreamChunk | undefined;
				if (chunk === undefined) {
					continue;
				}
				if (typeof chunk.id === "string" && chunk.id.length > 0) {
					responseId = chunk.id;
				}
				// usage: null 是上游中间 chunk 的合法形态（!== undefined 挡不住 null）
				if (chunk.usage !== undefined && chunk.usage !== null) {
					usage.input = chunk.usage.prompt_tokens ?? usage.input;
					usage.output = chunk.usage.completion_tokens ?? usage.output;
					usage.cacheRead =
						chunk.usage.prompt_cache_hit_tokens ?? chunk.usage.prompt_tokens_details?.cached_tokens ?? usage.cacheRead;
				}
				for (const choice of chunk.choices ?? []) {
					const delta = choice.delta ?? {};
					const text = contentText(delta.content);
					if (text.length > 0) {
						driver.text(text);
					}
					if (typeof delta.reasoning_content === "string" && delta.reasoning_content.length > 0) {
						driver.thinking(delta.reasoning_content);
					}
					aggregator.absorb(delta.tool_calls);
					if (choice.finish_reason === "length") {
						stopReason = "length";
						sawFinish = true;
					} else if (choice.finish_reason === "tool_calls") {
						stopReason = "toolUse";
						sawFinish = true;
					} else if (choice.finish_reason === "stop") {
						stopReason = "stop";
						sawFinish = true;
					}
				}
			}

			for (const call of aggregator.settle()) {
				driver.toolCall({ id: call.id, name: call.name, arguments: call.arguments });
			}
			if (!sawFinish) {
				// 上游断流未给 finish_reason：按 stop 终态收尾（内容已完整透传；
				// 显式留痕避免静默吞掉异常断流形态——usage 为零即是观测信号）。
				stopReason = "stop";
			}
			return { usage, stopReason, ...(responseId !== undefined ? { responseId } : {}) };
		}
	};
}
