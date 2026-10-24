// index.ts — @zhushanwen/plugin-wool-trae：Trae 家族的 taiji 插件（设计 D6 三层结构
// 的插件层）。管理动作在插件 fork 进程内执行（无 pi 运行时），凭据经宿主
// providers.write 落 models.json，不存插件 storage。
//
// 家族差异件（其余接线由 wool-shared 的 createWoolPlugin 骨架统一承担）：
// - 凭据来源 = 本机提取（ide-extract）：storage.json 的 iCubeAuthInfo 容器解密；
// - 状态 = 凭据在位事实（SOLO 免费对话通道无账号信息 API，不拉网络）；
// - 目录 = get_detail_param 拉取（设备三要素请求时从本机 storage.json 现读）；
// - 签到 = 不在本家族范围（骨架按 supported:false 应答）。

import {
	createWoolPlugin,
	type WoolPluginContext,
	woolLoggedOutStatus,
} from "@zhushanwen/pi-wool-shared/plugin";
import {
	detectTraeLoginState,
	extractTraeLogin,
	fetchTraeCatalog,
	resolveTraeAuth,
	storageJsonPath,
	traeExtractToAcquireData,
} from "@zhushanwen/pi-wool-shared/trae";

export const FAMILY_ID = "trae" as const;

const woolPlugin = createWoolPlugin({
	familyId: FAMILY_ID,
	displayName: "Trae (Wool)",
	credentialsSource: "ide-extract",
	credentialPath: storageJsonPath(),
	extract: async () => traeExtractToAcquireData(extractTraeLogin().login),
	fetchStatus: async (accessToken) => {
		// 登录态 = 凭据在位事实：条目凭据（providers.credential 回读）或本机 storage.json
		// 存在性。Trae 无独立 userinfo 端点，额度/昵称增值字段缺席（不伪造）。
		const loggedIn = accessToken !== undefined || detectTraeLoginState();
		if (!loggedIn) {
			return woolLoggedOutStatus(FAMILY_ID, Date.now());
		}
		return { family: FAMILY_ID, loggedIn: true, fetchedAt: Date.now() };
	},
	fetchCatalog: async (accessToken) => fetchTraeCatalog(resolveTraeAuth(accessToken)),
});

/** 插件 activate 入口（宿主按 package.json taijiPlugin.main 加载并调用）。 */
export async function activate(context: WoolPluginContext): Promise<void> {
	return woolPlugin(context);
}
