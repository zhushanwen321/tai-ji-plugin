// index.ts — 插件侧共享面（taiji 插件进程可消费的全部件；设计 D6「共享内核」的
// 运行位置约束：插件进程内无 pi 运行时，本子路径的 import 闭包必须零 pi 值依赖）。
//
// 根 barrel（"."）另含 pi 扩展侧件（scaffold / stream-adapter / sse），它们对
// @earendil-works/pi-ai 有值依赖——插件包一律走本子路径
// （`@zhushanwen/pi-wool-shared/plugin`）与家族子路径（`/qoder` `/trae`
// `/workbuddy`），不 import 根 barrel。

export { isWoolFamilyId, woolProviderId, WOOL_FAMILY_IDS, type WoolCredentialsSource, type WoolFamilyId } from "../types.ts";

export type { WoolCredentialAcquireData } from "../credentials-contract.ts";

export {
	isWoolAccountStatus,
	woolLoggedOutStatus,
	WoolAccountStatusSchema,
	WoolCheckinSchema,
	WoolQuotaSchema,
	type WoolAccountStatus,
} from "../account-status.ts";

export { isValidSnapshot, readSnapshotFile, type WoolCatalogSnapshot } from "../model-catalog.ts";

export {
	DAILY_CHECKIN_REMINDER_HOUR,
	msUntilNextDailyCheckin,
	readCheckinSettings,
	WOOL_CHECKIN_SETTINGS_KEY,
	type WoolCheckinSettings,
} from "../checkin-settings.ts";

export {
	createWoolPlugin,
	WOOL_EVENT_CHANNEL_STATUS,
	type WoolAuthorizeIo,
	type WoolPluginDefinition,
} from "./plugin-kit.ts";

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
} from "./gui.ts";

export {
	requireHostApi,
	woolCredentialKey,
	type WoolGuiComponent,
	type WoolPluginContext,
	type WoolPluginHostApi,
	type WoolPluginUiEvent,
	type WoolProviderWriteParams,
	type WoolResolvedCredential,
} from "./host-contract.ts";

export {
	deriveNamespace,
	NAMESPACE_MISMATCH,
	validateNamespaceBinding,
	type NamespaceBindingResult,
} from "./namespace.ts";
