// scaffold.ts — 羊毛 pi 扩展脚手架：registerProvider 封装 + 生命周期接线。
//
// 瘦身后职责（设计 D6/D7——模型目录收敛进 models.json 条目，单源）：
// 本脚手架只承担 pi 契约的静态接线（ProviderConfig 组装、streamSimple 事件流纪律、
// oauth 钩子族）。provider 注册不声明 models（声明会替换 models.json 条目目录）——
// 模型目录唯一数据源 = models.json 羊毛条目的 models 数组（插件经 providers.write
// 写入，pi composer applyExtension 按条目构造目录），扩展不再定义 refreshModels：
// 零上游拉取、零宿主缓存写入（pi models-store.json 不再有羊毛 persist）。上游目录的
// 拉取与写回只发生在插件侧（plugin-wool-<family> 的 refreshCatalog 编排）。
//
// 管理命令（wool-<family>）随借道通道退役：管理动作已迁插件进程（plugin-wool-<family>），
// 本脚手架不再注册 manageHandlers（管理命令协议文件已删除）。
//
// 生命周期形态：defineWoolExtension 返回 pi ExtensionFactory（extension-conventions
// 「扩展入口：export default function xxxExtension(pi)」）。
//
// 凭据通道：streamSimple 签名不带 ctx，pi 也不向其传 resolved api key（provider-composer
// 原样透传 options）。公开解析通道 = ExtensionContext.modelRegistry.getApiKeyAndHeaders
// （ModelRegistry 公开方法，请求时鉴权语义）——脚手架经首个 session_start 捕获 ctx 后，
// 家族 stream 在请求时拿到 { apiKey, headers, baseUrl }。

// pi 宿主注入清单只支持 pi-ai 根/compat/oauth/providers/all 四入口（virtual-modules.js），
// utils/transcript 深路径在真机 pi 加载下不可解析（单测环境被 repo node_modules 掩盖）——
// getCurrentSystemPrompt/getCurrentTools 根入口有等价导出，改根 import
import { getCurrentSystemPrompt, getCurrentTools } from "@earendil-works/pi-ai";
import type {
	ExtensionAPI,
	ExtensionFactory,
	ProviderConfig,
} from "@earendil-works/pi-coding-agent";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type {
	Api,
	Message,
	Model,
	SimpleStreamOptions,
	Tool,
	TranscriptContext,
} from "@earendil-works/pi-ai";

import { WOOL_CREDENTIALS_MISSING_MESSAGE } from "./credentials-contract.ts";
import type { WoolStreamDriverContext, WoolStreamOutcome } from "./stream-adapter.ts";
import { createAssistantStream } from "./stream-adapter.ts";
import type { WoolFamilyId } from "./types.ts";
import { woolProviderId } from "./types.ts";

/** 凭据解析失败（getApiKeyAndHeaders ok:false）时家族 stream 收到的形态。 */
export type WoolResolvedAuth =
	| { ok: true; apiKey?: string; headers?: Record<string, string | null>; baseUrl?: string }
	| { ok: false; error: string };

/** 凭据缺失统一错误文案的再出口（定义在 credentials-contract.ts——插件侧子路径也要用，
 * 那里不能经本文件引入 pi 值依赖）。 */
export { WOOL_CREDENTIALS_MISSING_MESSAGE } from "./credentials-contract.ts";

/**
 * 请求时凭据解析（D2 双通道优先级，请求管线事实锚：pi model-runtime prepareRequest
 * 把 models.json 羊毛 provider 条目 apiKey 经 `providerOptions.apiKey ?? resolution.auth.apiKey`
 * 合并进 streamSimple options）：
 * ① options.apiKey —— taiji 插件经 providers.write 写入 models.json 的主通道，在场即采信
 *   （跳过 registry 解析，不做 oauth 刷新尝试）；
 * ② registry oauth 钩子凭据 —— 独立 pi 用户 TUI /login 形态，过期自动刷新。
 * ② 解析 ok:false（刷新链失败等）保留原错误（比统一消息更可诊断）；ok 但无 apiKey
 * （wool 家族 authHeader 缺省下 pi 对未配置 provider 的回包形态）→ 统一「凭据未配置」。
 */
async function resolveRequestAuth(
	resolveViaRegistry: (model: Model<Api>) => Promise<WoolResolvedAuth>,
	model: Model<Api>,
	requestApiKey: string | undefined,
): Promise<WoolResolvedAuth> {
	if (typeof requestApiKey === "string" && requestApiKey.length > 0) {
		return { ok: true, apiKey: requestApiKey };
	}
	const resolved = await resolveViaRegistry(model);
	if (!resolved.ok) {
		return resolved;
	}
	if (typeof resolved.apiKey === "string" && resolved.apiKey.length > 0) {
		return resolved;
	}
	return { ok: false, error: WOOL_CREDENTIALS_MISSING_MESSAGE };
}

/** 家族协议翻译的输入：pi 标准请求要素 + 发射上下文。 */
export interface WoolStreamRequest { // oe-exempt:20261022:framework:家族 stream 入参契约——pi-wool-trae / pi-wool-workbuddy index.ts 按名导入，pi-wool-qoder index.ts 结构子集消费
	model: Model<Api>;
	/** 回放后的系统提示词（含后续 system 消息增量）。 */
	systemPrompt: string;
	/** 回放后的工具声明集。 */
	tools: Tool[];
	/** 完整 transcript（家族自行取末条 user 消息等）。 */
	messages: Message[];
	/** 请求时凭据（D2 优先级：options.apiKey（models.json 羊毛条目）> registry oauth 钩子；
	 * 双缺 = ok:false + 统一「凭据未配置」错误——家族直抛给用户）。 */
	resolvedAuth: WoolResolvedAuth;
	/** 事件发射与仪表钩子透传上下文（骨架提供）。 */
	driver: WoolStreamDriverContext;
}

/** 家族 streamSimple 实装：翻译协议、发事件，终态返回 outcome（异常由骨架转 error/abort）。 */
export type WoolStreamImplementation = (request: WoolStreamRequest) => Promise<WoolStreamOutcome>;

export interface WoolFamilyExtensionDefinition { // oe-exempt:20261022:framework:defineWoolExtension SDK 定义项契约——qoder/trae/workbuddy 三家 index.ts 构造消费 + scaffold.test.ts 按名引用
	familyId: WoolFamilyId;
	/** UI 显示名（provider 注册名固定为 wool-<familyId>）。 */
	displayName: string;
	/**
	 * 自定义 api id。pi composer 硬校验：注册 streamSimple 必须带 api
	 * （provider-composer.js validateExtensionProvider：「"api" is required when
	 * registering streamSimple」），且 streamSimple 仅对 model.api === 此值的模型分发。
	 */
	api: string;
	/** 上游 API 基址（家族上游根 URL；composer 硬校验项——静态 provider 必填）。 */
	baseUrl?: string;
	/** true = pi 自动加 Authorization: Bearer 头。默认 false（三家令牌走自定义头/签名）。 */
	authHeader?: boolean;
	/** 家族协议翻译实装（必填）。 */
	stream: WoolStreamImplementation;
	/** pi oauth 钩子族（login/refreshToken/getApiKey）；ide-extract 家族把提取包装为 login。 */
	oauth?: ProviderConfig["oauth"];
}

/**
 * 组装家族扩展 factory。用法：
 * `export default defineWoolExtension({ familyId: "echo", ... })`。
 */
export function defineWoolExtension(definition: WoolFamilyExtensionDefinition): ExtensionFactory {
	const providerId = woolProviderId(definition.familyId);

	return (pi: ExtensionAPI): void => {
		// streamSimple 执行期的凭据解析器：经 session_start 捕获 ctx.modelRegistry
		//（ExtensionContext 上的公开 registry facade）。turn 执行时 session_start
		// 必已跑过；未捕获即执行 streamSimple 属生命周期 bug，fail-fast 拒绝发请求。
		let authResolver: ((model: Model<Api>) => Promise<WoolResolvedAuth>) | undefined;
		pi.on("session_start", (_event, ctx) => {
			const registry: ModelRegistry = ctx.modelRegistry;
			authResolver = async (model) => {
				const resolved = await registry.getApiKeyAndHeaders(model);
				if (resolved.ok) {
					return { ok: true, apiKey: resolved.apiKey, headers: resolved.headers, baseUrl: resolved.baseUrl };
				}
				return { ok: false, error: resolved.error };
			};
		});

		pi.registerProvider(providerId, {
			name: definition.displayName,
			baseUrl: definition.baseUrl,
			authHeader: definition.authHeader,
			api: definition.api,
			// 目录唯一数据源 = models.json 羊毛条目的 models 数组（D7 单源：扩展零上游拉取、
			// 零 persist 写入）。**不得声明 models**（含空数组）：pi composer 的 applyExtension
			// 在 config.models 为 undefined 时保留 models.json 条目构造的目录，声明空数组会
			// 把目录替换为空表（0 模型）。
			...(definition.oauth !== undefined ? { oauth: definition.oauth } : {}),
			streamSimple: (model: Model<Api>, context: TranscriptContext, options?: SimpleStreamOptions) => {
				if (authResolver === undefined) {
					throw new Error(`Wool provider ${providerId}: streamSimple ran before session_start captured the model registry.`);
				}
				const resolveAuth = authResolver;
				// 流取消信号：SimpleStreamOptions 继承 ProviderRequestOptions.signal（pi 传入）。
				const signal = options?.signal ?? new AbortController().signal;
				return createAssistantStream({
					model,
					signal,
					options,
					drive: (driver) =>
						resolveRequestAuth(resolveAuth, model, options?.apiKey).then((resolvedAuth) =>
							definition.stream({
								model,
								systemPrompt: getCurrentSystemPrompt(context.messages),
								tools: getCurrentTools(context.messages),
								messages: context.messages,
								resolvedAuth,
								driver,
							}),
						),
				});
			},
		});
	};
}
