// index.ts — @zhushanwen/plugin-wool-qoder：Qoder 家族的 taiji 插件（设计 D6 三层
// 结构的插件层）。管理动作在插件 fork 进程内执行（无 pi 运行时），凭据经宿主
// providers.write 落 models.json，不存插件 storage。
//
// 家族差异件（其余接线由 wool-shared 的 createWoolPlugin 骨架统一承担）：
// - 凭据来源 = 本机提取（ide-extract）：钥匙串 → auth.v1.dat → dt-/drt- 解密；
// - 提取失败转官方 PAT 次级入口（D8 text-input 唯一真实需求方）；
// - 状态 = userinfo + quota 两独立数据源（quota 失败按部分降级）；
// - 目录 = COSY 签名 model/list 拉取（凭据经 providers.credential 回读）；
// - 签到 = 不在本家族范围（Qoder 侧无签到体系——骨架按 supported:false 应答）。

import {
	createWoolPlugin,
	type WoolPluginContext,
	woolLoggedOutStatus,
} from "@zhushanwen/pi-wool-shared/plugin";
import {
	QoderAuthStore,
	adoptRequestApiKey,
	credentialStateToAcquireData,
	defaultAuthFilePath,
	detectCredentialFile,
	extractToAcquireData,
	fetchModelCatalog,
	fetchQuotaUsage,
	fetchUserinfo,
	patToCredentialState,
} from "@zhushanwen/pi-wool-shared/qoder";

export const FAMILY_ID = "qoder" as const;

const woolPlugin = createWoolPlugin({
	familyId: FAMILY_ID,
	displayName: "Qoder (Wool)",
	credentialsSource: "ide-extract",
	credentialPath: defaultAuthFilePath(),
	extract: async () => {
		if (!detectCredentialFile()) {
			throw new Error(
				`未检测到 Qoder 本机登录态（${defaultAuthFilePath()}）。请先在 Qoder 桌面端登录后重试，或改用官方个人访问令牌（PAT）。`,
			);
		}
		return extractToAcquireData();
	},
	submitPat: async (pat) => credentialStateToAcquireData(await patToCredentialState(pat)),
	fetchStatus: async (accessToken) => {
		if (accessToken === undefined) {
			return woolLoggedOutStatus(FAMILY_ID, Date.now());
		}
		// userinfo 失败 = 无法确认身份（上抛，骨架按已知态处理）；quota 失败 = 部分降级。
		const userinfo = await fetchUserinfo(accessToken, "");
		const quota = await fetchQuotaUsage(accessToken, userinfo.id).catch(() => undefined);
		return {
			family: FAMILY_ID,
			loggedIn: true,
			...(userinfo.name.length > 0 ? { nickname: userinfo.name } : {}),
			...(quota !== undefined
				? { quota: { used: quota.used, remaining: quota.remaining, total: quota.total, unit: "credits" } }
				: {}),
			fetchedAt: Date.now(),
		};
	},
	fetchCatalog: async (accessToken) => {
		// 目录拉取要 COSY 身份（uid 派生机器头）：裸令牌经 userinfo 补全身份后进会话缓存。
		const store = new QoderAuthStore();
		await adoptRequestApiKey(store, accessToken);
		return fetchModelCatalog({ authStore: store });
	},
});

/** 插件 activate 入口（宿主按 package.json taijiPlugin.main 加载并调用）。 */
export async function activate(context: WoolPluginContext): Promise<void> {
	return woolPlugin(context);
}
