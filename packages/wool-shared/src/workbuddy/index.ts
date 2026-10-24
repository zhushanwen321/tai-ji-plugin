// index.ts — WorkBuddy 家族共享内核公共面（管理模块：OAuth 流程 / 状态查询 /
// 额度与签到查询 / 模型目录拉取；设计 D6 三层结构的共享内核层）。
//
// 消费方：
// - plugin-wool-workbuddy（taiji 插件进程：授权 / 状态 / 刷新目录 / 签到编排）；
// - pi-wool-workbuddy（pi 会话进程：oauth 钩子与 streamSimple 协议翻译）。
// 本包（家族子路径）零 pi 值依赖：pi-ai 只作类型导入，pi 运行时对象一律经调用方注入。

export {
	ARGUMENTS_DETAIL_MAX_CHARS,
	AUTH_STATE_PATH,
	AUTH_TOKEN_PATH,
	CALLBACK_HOST,
	CALLBACK_PATH,
	CHAT_PATH,
	CHECKIN_ALREADY_CODE,
	CHECKIN_PATH,
	CHECKIN_STATUS_PATH,
	DEFAULT_TOKEN_TTL_MS,
	ERROR_DETAIL_MAX_CHARS,
	GET_RESOURCE_PATH,
	HTTP_OK,
	LOGIN_ACCOUNT_PATH,
	LOGIN_PENDING_CODE,
	MODELS_PATH,
	MS_PER_SECOND,
	OAUTH_PLATFORM,
	REFRESH_PATH,
	WORKBUDDY_REALMS,
	isWorkbuddyRealm,
	type WorkbuddyRealm,
	type WorkbuddyRealmConfig,
} from "./constants.ts";

export { isRecord } from "./guards.ts";

export {
	conversationIdFor,
	deriveDeviceId,
	machineIdFor,
	newRequestId,
	sessionIdFor,
	traceHeaders,
	uuid7,
} from "./fingerprint.ts";

export {
	buildBillingHeaders,
	buildChatHeaders,
	buildOAuthStateHeaders,
	buildRefreshHeaders,
	realmConfig,
	type WorkbuddyAuthContext,
} from "./headers.ts";

export { decodeJwtClaims, expiresFromToken, uidFromToken, type WorkbuddyJwtClaims } from "./jwt.ts";

export {
	executeCheckin,
	fetchCheckinStatus,
	fetchQuota,
	type CheckinResult,
	type CheckinStatus,
	type QuotaSummary,
} from "./checkin.ts";

export {
	WORKBUDDY_FAMILY_ID,
	authContextFromToken,
	workbuddyAccountStatus,
} from "./account.ts";

export {
	fetchWorkbuddyModels,
	indexSnapshot,
	loadWorkbuddySnapshot,
	parseModelIds,
	workbuddySnapshotPath,
	type FetchModelsOptions,
	type WorkbuddySnapshotModels,
} from "./models.ts";

export {
	asWorkbuddyCredential,
	asWorkbuddyCredentials,
	buildWoolAuthorizeNotice,
	exchangeToken,
	runWorkbuddyAuthorization,
	startAuthState,
	toWoolAcquireData,
	toWorkbuddyCredentials,
	workbuddyApiKey,
	workbuddyLogin,
	workbuddyRefresh,
	type TokenExchangeResult,
	type WorkbuddyCredentials,
} from "./oauth.ts";

export {
	startWoolAuthCallbackServer,
	type CallbackDoneResult,
	type WoolAuthCallbackOptions,
	type WoolAuthCallbackServer,
	type WoolCallbackOutcome,
} from "./callback-server.ts";
