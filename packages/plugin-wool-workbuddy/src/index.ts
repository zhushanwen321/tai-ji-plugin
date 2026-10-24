// index.ts — @zhushanwen/plugin-wool-workbuddy：WorkBuddy 家族的 taiji 插件（设计 D6
// 三层结构的插件层）。管理动作在插件 fork 进程内执行（无 pi 运行时），凭据经宿主
// providers.write 落 models.json，不存插件 storage。
//
// 家族差异件（其余接线由 wool-shared 的 createWoolPlugin 骨架统一承担）：
// - 凭据来源 = OAuth 授权（授权页经宿主 plugin.ui.openUrl 打开，本机回调监听收口）；
// - 状态 = checkin + quota 聚合（两者独立降级）；
// - 目录 = personal/models id 清单 + 包内快照元数据匹配；
// - 签到 = 手动 checkin + 每日提醒定时器（autoCheckin 开关存插件 storage）。

import { createWoolPlugin, type WoolPluginContext, woolLoggedOutStatus } from "@zhushanwen/pi-wool-shared/plugin";
import {
	asWorkbuddyCredential,
	authContextFromToken,
	executeCheckin,
	fetchWorkbuddyModels,
	isWorkbuddyRealm,
	loadWorkbuddySnapshot,
	runWorkbuddyAuthorization,
	toWoolAcquireData,
	workbuddyAccountStatus,
	type WorkbuddyCredentials,
} from "@zhushanwen/pi-wool-shared/workbuddy";

export const FAMILY_ID = "workbuddy" as const;

/** access token → OAuth 凭据形态（uid/realm 从 JWT 解码；目录拉取不需要刷新令牌）。
 * type 判别键是 asWorkbuddyCredential（Credential union 收窄）的输入前提。 */
function credentialFromToken(accessToken: string): WorkbuddyCredentials & { type: "oauth" } {
	const auth = authContextFromToken(accessToken);
	return {
		type: "oauth",
		access: accessToken,
		refresh: "",
		expires: 0,
		uid: auth.uid,
		realm: auth.realm,
		...(auth.domain !== undefined ? { domain: auth.domain } : {}),
	};
}

const woolPlugin = createWoolPlugin({
	familyId: FAMILY_ID,
	displayName: "WorkBuddy",
	credentialsSource: "oauth",
	dailyCheckin: true,
	authorize: async (io) =>
		toWoolAcquireData(
			await runWorkbuddyAuthorization({
				deliverAuthInfo: (info) => {
					void io.openAuthorizePage(info.authUrl);
				},
			}),
		),
	fetchStatus: async (accessToken) => {
		if (accessToken === undefined) {
			return woolLoggedOutStatus(FAMILY_ID, Date.now());
		}
		return workbuddyAccountStatus(true, accessToken, undefined);
	},
	fetchCatalog: async (accessToken) => {
		const credential = credentialFromToken(accessToken);
		const realm = isWorkbuddyRealm(credential.realm) ? credential.realm : "cn";
		return fetchWorkbuddyModels({
			credential: asWorkbuddyCredential(credential),
			signal: new AbortController().signal,
			snapshot: loadWorkbuddySnapshot(),
			realm,
		});
	},
	checkin: async (accessToken) => {
		const auth = authContextFromToken(accessToken);
		return executeCheckin(auth.realm, auth);
	},
});

/** 插件 activate 入口（宿主按 package.json taijiPlugin.main 加载并调用）。 */
export async function activate(context: WoolPluginContext): Promise<void> {
	return woolPlugin(context);
}
