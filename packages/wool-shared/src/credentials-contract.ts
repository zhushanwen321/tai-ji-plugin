// credentials-contract.ts — 凭据获取动作（extract / authorize）的响应契约。
//
// 原 manage-protocol.ts 的 WoolCredentialAcquireData 随管理命令协议退役迁入本文件：
// 插件（plugin-wool-<family>）执行提取/授权后按此形状拿到凭据，再经宿主 providers.write
// 写入 models.json 羊毛 provider 条目（设计 D4/D6——凭据权威单一，插件进程不留存）。
//
// - extract：apiKey = 本机提取的访问令牌（Qoder dt- / Trae Cloud-IDE-JWT），refreshToken
//   随提取链带出时给出；
// - authorize：apiKey = OAuth access token，refreshToken = 轮换刷新令牌。

/** 凭据获取动作的响应契约（插件方法返回值；宿主按 credentials.apiKey 落条目）。 */
export interface WoolCredentialAcquireData {
	credentials: {
		apiKey: string;
		refreshToken?: string;
	};
	account?: {
		displayName?: string;
	};
	/** 访问令牌到期时点（Unix ms；未知缺省）。 */
	expiresAt?: number;
}

/** 凭据双通道（请求时 options.apiKey + oauth 钩子）皆缺时的统一错误文案（错误 → 权威源
 * → 重试闭环：taiji 插件接入，或独立 pi 用户在 pi 内 /login）。放本文件（而非 scaffold）
 * 是因为共享内核的插件侧子路径必须零 pi 值依赖——家族管理模块也要用这条文案。 */
export const WOOL_CREDENTIALS_MISSING_MESSAGE = "凭据未配置：经 taiji 插件接入或在 pi 内 /login";
