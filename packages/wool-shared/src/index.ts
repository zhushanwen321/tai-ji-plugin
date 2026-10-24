// index.ts — @zhushanwen/pi-wool-shared 公共面（共享内核：下游 pi 扩展三家 + taiji 插件
// 三家 + 家族管理模块的契约出口）。
//
// 瘦身后分层（设计 D6）：管理模块（凭据提取解密 / OAuth 流程 / 状态查询 / 额度查询 /
// 模型目录拉取 / 签到）下沉 src/<family>/，由 taiji 插件（plugin-wool-<family>）消费；
// pi 扩展协议翻译件（scaffold / stream-adapter / sse）由 pi-wool-<family> 消费。

// 家族基础词表
export { isWoolFamilyId, woolProviderId, WOOL_FAMILY_IDS, type WoolCredentialsSource, type WoolFamilyId } from "./types.ts";

// 凭据获取契约（extract / authorize 响应形状）
export type { WoolCredentialAcquireData } from "./credentials-contract.ts";

// 账号状态协议
export {
	isWoolAccountStatus,
	woolLoggedOutStatus,
	WoolAccountStatusSchema,
	WoolCheckinSchema,
	WoolQuotaSchema,
	type WoolAccountStatus,
} from "./account-status.ts";

// 模型目录快照承载（WorkBuddy 元数据表）
export {
	isValidSnapshot,
	readSnapshotFile,
	type WoolCatalogSnapshot,
} from "./model-catalog.ts";

// SSE 解析与 streamSimple 事件流骨架（pi 扩展协议翻译件）
export { parseSseStream, readSseEvents, sseBodyFromChunks, sseDataChunk, type SseEvent } from "./sse.ts";

export {
	createAssistantStream,
	WoolStreamAdapterError,
	type WoolStreamDriverContext,
	type WoolStreamOutcome,
} from "./stream-adapter.ts";

// pi 扩展脚手架（静态清单形态——目录唯一数据源 = models.json 条目）
export {
	defineWoolExtension,
	WOOL_CREDENTIALS_MISSING_MESSAGE,
	type WoolFamilyExtensionDefinition,
	type WoolResolvedAuth,
	type WoolStreamImplementation,
	type WoolStreamRequest,
} from "./scaffold.ts";

// 每日签到设置契约与提醒时点（插件进程共用件）
export {
	DAILY_CHECKIN_REMINDER_HOUR,
	msUntilNextDailyCheckin,
	readCheckinSettings,
	WOOL_CHECKIN_SETTINGS_KEY,
	type WoolCheckinSettings,
} from "./checkin-settings.ts";

// taiji 插件装配骨架（plugin-wool-<family> 消费）
export {
	createWoolPlugin,
	WOOL_EVENT_CHANNEL_STATUS,
	type WoolAuthorizeIo,
	type WoolPluginDefinition,
} from "./plugin/plugin-kit.ts";

export {
	buildDetailTree,
	buildExtractTree,
	buildOAuthTree,
	buildPatTree,
	PAT_INPUT_COMPONENT_ID,
	type WoolAuthorizePhase,
	type WoolDetailTreeState,
	type WoolExtractTreeState,
	type WoolOAuthTreeState,
} from "./plugin/gui.ts";

export {
	requireHostApi,
	woolCredentialKey,
	type WoolGuiComponent,
	type WoolPluginContext,
	type WoolPluginHostApi,
	type WoolPluginUiEvent,
	type WoolProviderWriteParams,
	type WoolResolvedCredential,
} from "./plugin/host-contract.ts";

// 插件命名空间推导与绑定校验（宿主 SSOT 的本仓镜像件；plugin-wool-<family> 单测与
// manifest 声明一致性断言消费）
export {
	deriveNamespace,
	NAMESPACE_MISMATCH,
	validateNamespaceBinding,
	type NamespaceBindingResult,
} from "./plugin/namespace.ts";

// ── 家族管理模块（插件与 pi 扩展共用的下沉件）──
//
// 三家共用大量同义符号（MODELS_PATH / CHAT_PATH 等常量同名不同值），根 barrel 不做
// `export *`——按家族子路径导出（package.json exports 的 `./qoder` / `./trae` /
// `./workbuddy`），消费方 `import { ... } from "@zhushanwen/pi-wool-shared/<family>"`。
