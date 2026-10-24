// index.ts — Trae 家族共享内核公共面（管理模块：凭据提取解密 / OAuth 流程 /
// 状态查询 / 模型目录拉取；设计 D6 三层结构的共享内核层）。
//
// 消费方：
// - plugin-wool-trae（taiji 插件进程：授权 / 提取 / 状态 / 刷新目录）；
// - pi-wool-trae（pi 会话进程：oauth 钩子与 streamSimple 协议翻译）。
// 本包（家族子路径）零 pi 值依赖：pi-ai 只作类型导入，pi 运行时对象一律经调用方注入。

export {
	TraeContainerError,
	TRAE_EXTRACT_RECOVERY_HINT,
	decryptContainer,
	detectTraeLoginState,
	extractTraeLogin,
	storageJsonPath,
	type TraeStoredLogin,
} from "./byte-crypto.ts";

export {
	CATALOG_ENDPOINT,
	CHAT_ENDPOINT,
	REFRESH_ENDPOINT,
	SOLO_FUNCTION,
	TRAE_ERROR_SEMANTICS,
	TRAE_GATEWAY_CN,
	X_APP_ID,
	X_IDE_VERSION,
	X_IDE_VERSION_CODE,
	buildCommonHeaders,
	buildStreamHeaders,
	describeUpstreamError,
	type TraeAuthInputs,
} from "./protocol.ts";

export { TraeCatalogError, fetchTraeCatalog, type TraeFetch, type TraeModel } from "./catalog.ts";

export {
	TRAE_API_ID,
	authFromCredential,
	decodeKeyBundle,
	encodeKeyBundle,
	expiresEpochMs,
	getTraeApiKey,
	loginByExtraction,
	parseKeyBundle,
	readTraeBundle,
	refreshViaExchangeToken,
	resolveTraeAuth,
	traeExtractToAcquireData,
} from "./auth.ts";
