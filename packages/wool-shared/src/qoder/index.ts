// index.ts — Qoder 家族共享内核公共面（管理模块：凭据提取解密 / OAuth 流程 /
// 状态查询 / 额度查询 / 模型目录拉取；设计 D6 三层结构的共享内核层）。
//
// 消费方：
// - plugin-wool-qoder（taiji 插件进程：提取 / PAT 次级入口 / 状态 / 刷新目录）；
// - pi-wool-qoder（pi 会话进程：oauth 钩子与 streamSimple 协议翻译）。
// 本包（家族子路径）零 pi 值依赖：pi-ai 只作类型导入，pi 运行时对象一律经调用方注入。

export {
	AES_BLOCK_BYTES,
	APP_DATA_DIRNAME,
	AUTH_FILE_BASENAME,
	CHAT_PATH,
	COSY_USER_AGENT,
	COSY_VERSION,
	DEFAULT_CONTEXT_WINDOW,
	GATEWAY_BASE_URL,
	KEYCHAIN_ACCOUNT_CN,
	KEYCHAIN_SERVICE_CN,
	MODELS_PATH,
	NON_CHAT_MODEL_KEYS,
	NON_CHAT_MODEL_PREFIXES,
	NON_CHAT_MODEL_SUFFIXES,
	OPENAPI_BASE_URL,
	OPENAPI_USER_AGENT,
	OS_CRYPT_MAGIC,
	PATH_DEVICE_TOKEN_REFRESH,
	PATH_QUOTA_USAGE,
	PATH_USERINFO,
	QODER_CUSTOM_ALPHABET,
	QODER_PAD,
	SAFE_STORAGE_ITERATIONS,
	SAFE_STORAGE_IV,
	SAFE_STORAGE_KEY_LEN,
	SAFE_STORAGE_SALT,
	SERVER_PUBLIC_PEM,
	SNAPSHOT_FALLBACK_MODELS,
	STRUCTURED_TOOL_HISTORY_PREFIXES,
} from "./constants.ts";

export { compactJson, jsonSortedCompact, qoderDecode, qoderEncode } from "./encode.ts";

export {
	CosySession,
	DEFAULT_USER_TYPE,
	aesCbcEncrypt,
	deriveId,
	deriveMachineHostname,
	deriveMachineToken,
	deriveMachineType,
	rsaWrapSessionKey,
	signatureDigest,
	type CosyIdentity,
} from "./cosy.ts";

export {
	QoderAuthStore,
	readCredentialState,
	toCosyIdentity,
	toOAuthCredential,
	type QoderCredentialState,
} from "./credentials.ts";

export {
	decryptSafeStorageBlob,
	defaultAuthFilePath,
	detectCredentialFile,
	extractCredentials,
	parseAuthPayload,
	type KeychainReader,
	type QoderAuthPayload,
} from "./keychain-extract.ts";

export {
	fetchQuotaUsage,
	fetchUserinfo,
	openapiHeaders,
	refreshDeviceToken,
	type QoderDeviceTokenRefresh,
	type QoderQuotaSummary,
	type QoderUserinfo,
} from "./openapi.ts";

export {
	QODER_API_ID,
	fetchModelCatalog,
	isChatModelKey,
	lookupModelMeta,
	toModelMeta,
	toPiModel,
	type UpstreamCatalogEntry,
} from "./models-fetch.ts";

export {
	adoptRequestApiKey,
	credentialStateToAcquireData,
	extractToAcquireData,
	extractToCredentialState,
	login,
	makeGetApiKey,
	patToCredentialState,
	refreshToken,
	type LoginInteraction,
} from "./auth.ts";

export type { QoderModelMeta } from "./types.ts";
