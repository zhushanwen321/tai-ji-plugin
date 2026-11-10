// stream.ts — Trae SOLO 通道 streamSimple 协议翻译（D1）。
//
// 请求侧（pi transcript → Trae messages）：
// - system prompt 首条注入（含 <toolcall_protocol> 工具协议——SOLO 免费通道的工具
//   调用是文本协议，原生 tool_calls 参数加密通道属 TRAE Work，设计非目标）；
// - assistant toolCall → <toolcall>{"name","params"}</toolcall> 文本；
// - toolResult → user 角色 <tool_result for="id"> 文本（对照开源
//   prepareOpenAIMessagesForTrae 实测形态）。
// 响应侧（Trae SSE → pi 事件流，经 wool-shared 骨架发射）：
// - metadata/timing_cost/extra_info = 观测事件，经 onProviderStreamEvent 透传不进内容流；
// - output.response → text 增量；output.reasoning_content → thinking 增量；
//   output.tool_calls（原生形态）→ toolCall；
// - 文本工具协议标签 → toolCall（文本协议兜底；双方言容忍：<toolcall> JSON 教学
//   方言 + <tool_call> Qwen XML 训练方言——Qwen 系模型常无视教学直出训练方言，
//   2026-11 真机实测 mimo-v2.6-flash；带跨增量缓冲的状态机）；
// - token_usage → usage 记账（input/output/cacheRead/cacheWrite）；
// - done.finish_reason → stopReason（tool_calls → toolUse / length → length）；
// - error 事件（限流/登录态失效等业务错误的真实形态 = HTTP 200 + SSE error 事件，
//   2026-10-21 真机实测）→ 抛错转 error 终态（不静默吞成空回复）；
// - abort 信号贯穿读取循环（骨架转 aborted 终态）。

import { parseSseStream } from "@zhushanwen/pi-wool-shared";
import type { JsonObject, Message, Tool } from "@earendil-works/pi-ai";

import {
	CHAT_ENDPOINT,
	TRAE_GATEWAY_CN,
	buildStreamHeaders,
	describeUpstreamError,
	type TraeAuthInputs,
	type TraeFetch,
} from "@zhushanwen/pi-wool-shared/trae";
import type { WoolStreamDriverContext, WoolStreamOutcome } from "@zhushanwen/pi-wool-shared";

/** 上游 token_usage 事件载荷。 */
type TraeTokenUsagePayload = {
	prompt_tokens?: number;
	completion_tokens?: number;
	total_tokens?: number;
	cache_creation_input_tokens?: number;
	cache_read_input_tokens?: number;
	reasoning_tokens?: number;
};

/** 上游事件 data 的宽松解码。 */
function parseJsonPayload(data: string): unknown {
	try {
		return JSON.parse(data);
	} catch {
		return undefined;
	}
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

/** JSON 值递归判别（JsonObject 收窄守卫——断言前置运行时检查）。 */
function isJsonValue(value: unknown): boolean {
	if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		return true;
	}
	if (Array.isArray(value)) {
		return value.every(isJsonValue);
	}
	if (typeof value === "object") {
		return Object.values(value).every(isJsonValue);
	}
	return false;
}

/** unknown → JsonObject 收窄（工具参数装载用；非法形态返回 undefined）。 */
function asJsonObject(value: unknown): JsonObject | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value) || !isJsonValue(value)) {
		return undefined;
	}
	return value as JsonObject;
}

/** 上游错误码（JSON body 的 code 字段；1001 等——见 protocol 错误语义表）。 */
export function readUpstreamErrorCode(payload: unknown): number | undefined { // oe-exempt:20261022:wip:上游错误码读取辅助——错误语义表接线提交后消费，暂零引用（30 天复检）
	const record = asRecord(payload);
	if (record === undefined) {
		return undefined;
	}
	const code = record.code;
	if (typeof code === "number") {
		return code;
	}
	if (typeof code === "string" && /^\d+$/.test(code)) {
		return Number(code);
	}
	return undefined;
}

/** 1001 = 登录态失效（上游语义；调用方映射为重提取指引）。 */
export const TRAE_CODE_RELOGIN = 1001;

/** 工具协议块中工具参数预览的最大字段数（提示词紧凑性，非协议约束）。 */
const TOOL_PARAMS_PREVIEW_LIMIT = 8;

/** pi 工具声明 → <toolcall_protocol> 注入块（紧凑一行式，对照开源实测形态）。 */
function toolProtocolPrompt(tools: readonly Tool[]): string {
	if (tools.length === 0) {
		return "";
	}
	const lines = tools.map((tool) => {
		const properties = asRecord(asRecord(tool.parameters)?.properties);
		const params = properties !== undefined ? Object.keys(properties).slice(0, TOOL_PARAMS_PREVIEW_LIMIT).join(",") : "";
		return params.length > 0 ? `${tool.name}(${params})` : tool.name;
	});
	return [
		"",
		"<toolcall_protocol>",
		"When you need a tool, output ONLY this XML block (valid JSON inside):",
		'<toolcall>{"name":"ToolName","params":{"arg":"value"}}</toolcall>',
		"Rules:",
		'- JSON must have "name" and "params"',
		"- Use EXACT tool names from the list (case-sensitive)",
		"- Do not wrap toolcall in markdown fences",
		"- After <tool_result>, continue until the user question is answered",
		`Tools (${lines.length}): ${lines.join(", ")}`,
		"</toolcall_protocol>",
		"",
	].join("\n");
}

/** pi 消息 content 的文本抽取（text 拼接；image 首版不透传——Trae 图像格式未验证）。 */
function contentText(parts: readonly unknown[]): string {
	const out: string[] = [];
	for (const part of parts) {
		const record = asRecord(part);
		if (record !== undefined && record.type === "text" && typeof record.text === "string") {
			out.push(record.text);
		}
	}
	return out.join("");
}

/**
 * assistant 消息 → Trae 文本（text + <toolcall> 标记；thinking 不回传上游）。
 * 历史回写固定用 <toolcall> JSON 方言（有意的不对称）：协议教学在 system prompt
 * （toolProtocolPrompt），响应侧对 <tool_call> Qwen 方言只做解析容忍、不回写——
 * 模型见到的协议形态保持单一，避免上下文里两种方言互相污染放大跑偏。
 */
function assistantText(message: Message): string {
	const record = asRecord(message);
	if (record === undefined) {
		return "";
	}
	const parts = Array.isArray(record.content) ? record.content : [];
	let text = "";
	for (const part of parts) {
		const partRecord = asRecord(part);
		if (partRecord === undefined) {
			continue;
		}
		if (partRecord.type === "text" && typeof partRecord.text === "string") {
			text += partRecord.text;
		} else if (partRecord.type === "toolCall") {
			const args = partRecord.arguments;
			text += `<toolcall>${JSON.stringify({ name: partRecord.name, params: args ?? {} })}</toolcall>`;
		}
	}
	return text;
}

/** pi transcript → Trae 请求 messages（系统提示 + 消息翻译）。 */
export function buildTraeMessages(systemPrompt: string, tools: readonly Tool[], messages: readonly Message[]): Array<{ role: string; content: Array<{ type: "text"; text: string }> }> {
	const trae: Array<{ role: string; content: Array<{ type: "text"; text: string }> }> = [];
	const systemText = `${systemPrompt}${toolProtocolPrompt(tools)}`;
	if (systemText.trim().length > 0) {
		trae.push({ role: "system", content: [{ type: "text", text: systemText }] });
	}
	for (const message of messages) {
		if (message.role === "system") {
			const text = typeof message.content === "string" ? message.content : contentText(message.content);
			if (text.length > 0) {
				trae.push({ role: "system", content: [{ type: "text", text }] });
			}
			continue;
		}
		if (message.role === "user") {
			const text = typeof message.content === "string" ? message.content : contentText(message.content);
			trae.push({ role: "user", content: [{ type: "text", text }] });
			continue;
		}
		if (message.role === "assistant") {
			const text = assistantText(message);
			if (text.length > 0) {
				trae.push({ role: "assistant", content: [{ type: "text", text }] });
			}
			continue;
		}
		if (message.role === "toolResult") {
			const body = contentText(message.content) || (message.isError ? "(tool error)" : "(empty result)");
			trae.push({
				role: "user",
				content: [{ type: "text", text: `<tool_result for="${message.toolCallId}">\n${body}\n</tool_result>` }],
			});
		}
	}
	return trae;
}

/** 宽容解析上游 tool_call 条目（name/params 多形态）。 */
function normalizeToolCall(raw: unknown, index: number): { id: string; name: string; arguments: JsonObject } | undefined {
	const record = asRecord(raw);
	if (record === undefined) {
		return undefined;
	}
	const fn = asRecord(record.function);
	const name = record.name ?? record.tool_name ?? fn?.name;
	if (typeof name !== "string" || name.length === 0) {
		return undefined;
	}
	const rawArgs = record.params ?? record.arguments ?? record.input ?? fn?.arguments;
	let args: JsonObject = {};
	if (typeof rawArgs === "string" && rawArgs.length > 0) {
		args = asJsonObject(parseJsonPayload(rawArgs)) ?? {};
	} else {
		args = asJsonObject(rawArgs) ?? {};
	}
	const id = typeof record.id === "string" && record.id.length > 0 ? record.id : `call_trae_${index}_${Date.now()}`;
	return { id, name, arguments: args };
}

/**
 * 文本工具协议方言表（响应侧解析容忍）：JSON 方言 = <toolcall_protocol> 教学形态；
 * Qwen XML 方言 = Qwen 系模型无视教学时直出的训练方言（真机实测形态：
 * <tool_call><function=bash><parameter=command>…</parameter></function></tool_call>）。
 * 两个开标签互不为子串（第 6 字符 c 与 _ 分歧），完整文本扫描可安全 indexOf 共存。
 */
const TOOLCALL_DIALECTS = [
	{ open: "<toolcall>", close: "</toolcall>", parse: parseJsonToolcallBody },
	{ open: "<tool_call>", close: "</tool_call>", parse: parseQwenToolcallBody },
] as const;

/** 文本流中的工具协议标签提取器（流式发射 + 跨增量缓冲状态机，双方言）。 */
class TextToolcallSplitter {
	private buffered = "";
	private collecting = false;

	/** 尾部开标签前缀嫌疑长度（防跨增量截断扣留；取最长命中，无命中为 0）。 */
	private openTagPrefixTailLength(): number {
		const maxKeep = Math.max(...TOOLCALL_DIALECTS.map((dialect) => dialect.open.length)) - 1;
		for (let k = Math.min(this.buffered.length, maxKeep); k >= 1; k--) {
			const tail = this.buffered.slice(-k);
			if (TOOLCALL_DIALECTS.some((dialect) => dialect.open.startsWith(tail))) {
				return k;
			}
		}
		return 0;
	}

	/** 喂入增量，返回可立即发射的文本（进入工具收集态后返回空串）。 */
	push(delta: string): string {
		this.buffered += delta;
		if (this.collecting) {
			return "";
		}
		if (TOOLCALL_DIALECTS.some((dialect) => this.buffered.includes(dialect.open))) {
			this.collecting = true;
			return "";
		}
		// 保留尾部防跨块截断的开标签前缀嫌疑（"<tool" 为两方言标签公共前缀；
		// 只扣真正的前缀嫌疑尾巴，裸 "<tool" 随后续增量到齐后原样发射不丢字）
		const keep = this.openTagPrefixTailLength();
		const emitLength = this.buffered.length - keep;
		if (emitLength <= 0) {
			return "";
		}
		const emit = this.buffered.slice(0, emitLength);
		this.buffered = this.buffered.slice(emitLength);
		return emit;
	}

	/** 流结束：返回全部剩余文本（含 toolcall 标记；调用方做提取）。 */
	flush(): string {
		const rest = this.buffered;
		this.buffered = "";
		return rest;
	}
}

/** JSON 方言块体解析：{"name":"…","params":{…}}（<toolcall_protocol> 教学形态）。 */
function parseJsonToolcallBody(body: string): { name: string; params: JsonObject } | undefined {
	const record = asRecord(parseJsonPayload(body));
	const name = record !== undefined && typeof record.name === "string" ? record.name : undefined;
	if (name === undefined) {
		return undefined;
	}
	return { name, params: asJsonObject(record?.params) ?? {} };
}

/**
 * Qwen XML 方言块体解析：<function=NAME><parameter=KEY>VALUE</parameter>…</function>。
 * VALUE 按原始文本原样取值（含换行/特殊字符不处理）——XML 实体转义（&lt;/&amp; 等）
 * 是否出现未实测（2026-11 真机样本未见转义），先不反转义；真机确认转义形态后再补。
 * VALUE 内含 "</parameter>" 字面量时非贪婪匹配会在首个闭合截断——合法输出不含该
 * 字面量，属可接受边界。函数名与参数键按标识符匹配（[^>\s]+），头缺失判坏块。
 */
function parseQwenToolcallBody(body: string): { name: string; params: JsonObject } | undefined {
	const header = body.match(/^\s*<function=([^>\s]+)>/);
	if (header === null) {
		return undefined;
	}
	const functionBodyStart = header[0].length;
	const functionEnd = body.indexOf("</function>", functionBodyStart);
	// </function> 缺失时宽容取到块尾（函数名在位仍可消费；闭合缺失仅 </tool_call> 层面裁决）
	const functionBody =
		functionEnd === -1 ? body.slice(functionBodyStart) : body.slice(functionBodyStart, functionEnd);
	const params: JsonObject = {};
	const parameterPattern = /<parameter=([^>\s]+)>([\s\S]*?)<\/parameter>/g;
	for (;;) {
		const match = parameterPattern.exec(functionBody);
		if (match === null) {
			break;
		}
		params[match[1]] = match[2];
	}
	return { name: header[1], params };
}

/** 从完整文本提取工具协议标记（双方言）与其余文本。 */
export function extractToolcallsFromText(
	text: string,
): { remainingText: string; calls: Array<{ name: string; params: JsonObject }> } {
	const calls: Array<{ name: string; params: JsonObject }> = [];
	const remaining: string[] = [];
	let cursor = 0;
	for (;;) {
		// 两方言开标签取最早出现者（同一文本可混合出现，按位置保序提取）
		let hit: { dialect: (typeof TOOLCALL_DIALECTS)[number]; start: number } | undefined;
		for (const dialect of TOOLCALL_DIALECTS) {
			const at = text.indexOf(dialect.open, cursor);
			if (at !== -1 && (hit === undefined || at < hit.start)) {
				hit = { dialect, start: at };
			}
		}
		if (hit === undefined) {
			remaining.push(text.slice(cursor));
			break;
		}
		remaining.push(text.slice(cursor, hit.start));
		const bodyStart = hit.start + hit.dialect.open.length;
		const end = text.indexOf(hit.dialect.close, bodyStart);
		if (end === -1) {
			// 未闭合标记：原文保留（模型输出截断形态，不当工具消费）
			remaining.push(text.slice(hit.start));
			break;
		}
		const call = hit.dialect.parse(text.slice(bodyStart, end));
		if (call === undefined) {
			// 结构解析失败：块原文保留（不当工具消费、不静默吞——方言跑偏对用户可见）
			remaining.push(text.slice(hit.start, end + hit.dialect.close.length));
		} else {
			calls.push(call);
		}
		cursor = end + hit.dialect.close.length;
	}
	return { remainingText: remaining.join(""), calls };
}

/** drive 阶段的消费输入（scaffold 组装的请求要素）。 */
export type TraeDriveInput = {
	auth: TraeAuthInputs;
	systemPrompt: string;
	tools: readonly Tool[];
	messages: readonly Message[];
	driver: WoolStreamDriverContext;
	fetchImpl?: TraeFetch;
};

/** SSE 事件映射主循环：返回终态 outcome（异常上抛由骨架转 error/abort 终态）。 */
export async function driveTraeStream(input: TraeDriveInput): Promise<WoolStreamOutcome> {
	const { auth, driver } = input;
	const fetchImpl = input.fetchImpl ?? globalThis.fetch;
	const body = {
		messages: buildTraeMessages(input.systemPrompt, input.tools, input.messages),
		function: "solo_work_lite",
		stream: true,
		// config_name = pi 模型 id（目录条目 config_name 实测即对话通道的模型选择键；
		// 不带 agent_type/device_id/ide_version——实测带这些字段上游报 4023 "model is unknown"）。
		config_name: driver.model.id,
		model: driver.model.id,
	};
	const response = await fetchImpl(`${TRAE_GATEWAY_CN}${CHAT_ENDPOINT}`, {
		method: "POST",
		headers: buildStreamHeaders(auth),
		body: JSON.stringify(body),
		signal: driver.signal,
	});
	await driver.onResponse({ status: response.status, headers: Object.fromEntries(response.headers.entries()) });
	if (!response.ok) {
		const bodyText = await response.text().catch(() => "");
		throw new Error(describeUpstreamError(bodyText) || `HTTP ${response.status}`);
	}
	if (response.body === null) {
		throw new Error("upstream returned empty body");
	}

	await driver.onPayload(body);

	driver.open();

	const usage: WoolStreamOutcome["usage"] = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
	let finishReason: string | undefined;
	let sawTerminalDone = false;
	const splitter = new TextToolcallSplitter();
	const pendingCalls: Array<{ id: string; name: string; arguments: JsonObject }> = [];

	for await (const event of parseSseStream(response.body, driver.signal)) {
		const dataPayload = parseJsonPayload(event.data);
		const eventType = event.event ?? "message";
		await driver.onProviderStreamEvent({ type: eventType, data: dataPayload ?? event.data });

		if (eventType === "output") {
			const output = asRecord(dataPayload);
			if (output === undefined) {
				continue;
			}
			const responseText = typeof output.response === "string" ? output.response : "";
			if (responseText.length > 0) {
				const emit = splitter.push(responseText);
				if (emit.length > 0) {
					driver.text(emit);
				}
			}
			const reasoning = typeof output.reasoning_content === "string" ? output.reasoning_content : "";
			if (reasoning.length > 0) {
				driver.thinking(reasoning);
			}
			if (output.tool_calls !== null && output.tool_calls !== undefined) {
				if (!Array.isArray(output.tool_calls)) {
					continue;
				}
				for (const [index, raw] of output.tool_calls.entries()) {
					const call = normalizeToolCall(raw, index);
					if (call !== undefined) {
						pendingCalls.push(call);
					}
				}
			}
			continue;
		}
		if (eventType === "token_usage") {
			const usagePayload = asRecord(dataPayload) as TraeTokenUsagePayload | undefined;
			if (usagePayload !== undefined) {
				usage.input = typeof usagePayload.prompt_tokens === "number" ? usagePayload.prompt_tokens : 0;
				usage.output = typeof usagePayload.completion_tokens === "number" ? usagePayload.completion_tokens : 0;
				usage.cacheRead =
					typeof usagePayload.cache_read_input_tokens === "number" ? usagePayload.cache_read_input_tokens : 0;
				usage.cacheWrite =
					typeof usagePayload.cache_creation_input_tokens === "number" ? usagePayload.cache_creation_input_tokens : 0;
			}
			continue;
		}
		if (eventType === "error") {
			// 业务错误经 SSE 事件流到达（HTTP 仍 200——实测形态），抛错由骨架转 error 终态
			throw new Error(describeUpstreamError(event.data));
		}
		if (eventType === "done") {
			const donePayload = asRecord(dataPayload);
			finishReason = typeof donePayload?.finish_reason === "string" ? donePayload.finish_reason : "stop";
			sawTerminalDone = true;
			continue;
		}
		// metadata / timing_cost / extra_info / 默认：观测事件，已在 onProviderStreamEvent 透传
	}

	// 文本收尾：flush 残留；toolcall 收集态下提取标记内工具调用与标记外文本
	const tail = splitter.flush();
	const { remainingText, calls } = extractToolcallsFromText(tail);
	if (remainingText.length > 0) {
		driver.text(remainingText);
	}
	// 原生 tool_calls 优先，文本协议兜底（两层合并去重：同名同参的文本形态跳过）
	const nativeNames = new Set(pendingCalls.map((call) => call.name));
	for (const [index, call] of calls.entries()) {
		if (nativeNames.has(call.name)) {
			continue;
		}
		pendingCalls.push({ id: `call_trae_text_${index}`, name: call.name, arguments: call.params });
	}
	for (const call of pendingCalls) {
		driver.toolCall(call);
	}

	if (!sawTerminalDone) {
		// 上游断流无 done：显式报错（不静默当成功——骨架语义 error 终态）
		throw new Error("upstream stream ended without a done event");
	}
	const stopReason: WoolStreamOutcome["stopReason"] =
		finishReason === "tool_calls" || pendingCalls.length > 0 ? "toolUse" : finishReason === "length" ? "length" : "stop";
	return { usage, stopReason };
}
