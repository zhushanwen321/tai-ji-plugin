// auth.ts — Trae 家族凭据编排（共享内核：插件进程与 pi 扩展进程共用，零 pi 值依赖）。
//
// 从 pi-wool-trae/src/index.ts 下沉（设计 D6 三层结构：凭据提取与解密、OAuth 流程、
// 模型目录拉取归共享内核；pi 扩展只保留 registerProvider / streamSimple / oauth 接线）。
//
// 凭据双形态（D2 双通道的事实锚，原样保留）：
// ① 复合串（oauth 钩子通道：login 把 JWT + 设备三要素 JSON 编码进 credential.traeBundle）；
// ② 裸 JWT（models.json 羊毛条目 apiKey 通道）：userId/machineId/soloDeviceId 从本机
//    storage.json 现读（同机假设：设备要素对同一安装稳定；换号/卸载后上游拒绝，恢复 =
//    重跑向导提取）。
//
// 本文件只做凭据与目录编排；协议翻译（SOLO 通道请求/事件流）在 pi-wool-trae/src/stream.ts。

import type { Credential, OAuthCredentials } from "@earendil-works/pi-ai";

import { WOOL_CREDENTIALS_MISSING_MESSAGE, type WoolCredentialAcquireData } from "../credentials-contract.ts";
import type { TraeAuthInputs } from "./protocol.ts";
import { REFRESH_ENDPOINT, TRAE_GATEWAY_CN } from "./protocol.ts";
import { TRAE_EXTRACT_RECOVERY_HINT, extractTraeLogin, type TraeStoredLogin } from "./byte-crypto.ts";

/** pi provider 注册 api id（streamSimple 仅对 model.api === 此值的模型分发）。 */
export const TRAE_API_ID = "wool-trae";

/** OAuth 凭据附加键（pi OAuthCredentials 允许任意附加键）。 */
type TraeCredentialExtras = {
	/** 复合 apiKey（JWT + 设备三要素 JSON 编码）。 */
	traeBundle?: string;
};

/** ExchangeToken 刷新请求超时（ms）。 */
const REFRESH_TIMEOUT_MS = 30_000;

/** 刷新响应缺 expired_at 时的回退有效期（实测 token 寿命约 5 天 = 432_000_000 ms）。 */
const TOKEN_LIFETIME_FALLBACK_MS = 432_000_000;

/** 错误响应体截断长度（错误消息可读性，防超长 body 刷屏）。 */
const ERROR_BODY_SNIPPET = 200;

/** 组装 apiKey 复合串（login/refresh 后入库；请求时刻解析）。 */
export function encodeKeyBundle(auth: TraeAuthInputs): string {
	return JSON.stringify(auth);
}

/** 运行时守卫：复合串解析（读侧不信任存储内容）。非复合串形态（如裸 JWT）返回
 * undefined——裸令牌形态由 resolveTraeAuth 走 storage.json 设备要素通道。 */
export function parseKeyBundle(raw: string | undefined): TraeAuthInputs | undefined {
	let parsed: unknown;
	try {
		parsed = raw !== undefined && raw.length > 0 ? JSON.parse(raw) : undefined;
	} catch {
		parsed = undefined;
	}
	if (typeof parsed !== "object" || parsed === null) {
		return undefined;
	}
	const record = parsed as Record<string, unknown>;
	if (
		typeof record.token !== "string" ||
		record.token.length === 0 ||
		typeof record.userId !== "string" ||
		typeof record.machineId !== "string" ||
		typeof record.soloDeviceId !== "string"
	) {
		return undefined;
	}
	return {
		token: record.token,
		userId: record.userId,
		machineId: record.machineId,
		soloDeviceId: record.soloDeviceId,
	};
}

/** 复合串缺失/形态不符 → 可操作错误（oauth 钩子凭据通道：auth.json 里的 traeBundle）。 */
export function decodeKeyBundle(raw: string | undefined): TraeAuthInputs {
	const parsed = parseKeyBundle(raw);
	if (parsed === undefined) {
		throw new Error(
			"Trae credential bundle is missing or malformed — re-run the extraction (provider entry → 重新提取)",
		);
	}
	return parsed;
}

/**
 * 请求时凭据解析（D2 双通道）：
 * ① 复合串（oauth 钩子通道：getApiKey 返回 traeBundle，JWT + 设备三要素齐备）；
 * ② 裸 JWT（models.json 羊毛条目 apiKey 通道：宿主经向导 extract 写入，只有令牌本体）
 *    ——userId/machineId/soloDeviceId 从本机 storage.json 现读（同机假设：设备要素与
 *    账号 id 对同一安装稳定；IDE 换号/卸载后读取失败或上游拒绝，恢复 = 重跑向导提取）。
 * 每请求一次文件读 + AES 解密（微秒级，无缓存无状态）。
 */
export function resolveTraeAuth(apiKey: string | undefined, deps?: { storagePath?: string }): TraeAuthInputs {
	const bundle = parseKeyBundle(apiKey);
	if (bundle !== undefined) {
		return bundle;
	}
	if (apiKey === undefined || apiKey.length === 0) {
		throw new Error(`Trae credentials unavailable: ${WOOL_CREDENTIALS_MISSING_MESSAGE}`);
	}
	try {
		const { login, device } = extractTraeLogin(deps?.storagePath ?? undefined);
		return {
			token: apiKey,
			userId: login.userId,
			machineId: device.machineId,
			soloDeviceId: device.soloDeviceId,
		};
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Trae request token has no device facts available (${reason}). Re-run the taiji wizard extraction or pi /login. ${TRAE_EXTRACT_RECOVERY_HINT}`,
		);
	}
}

/** 从凭据读复合串附加键（Credential union 与 OAuthCredentials 都允许附加键）。 */
export function readTraeBundle(credential: Credential | OAuthCredentials | undefined): string | undefined {
	if (credential === undefined) {
		return undefined;
	}
	const bundle = (credential as Readonly<TraeCredentialExtras>).traeBundle;
	return typeof bundle === "string" && bundle.length > 0 ? bundle : undefined;
}

/** 从已刷新凭据取请求要素（refreshModels 带网阶段；scaffold 经 ctx.credential 传入）。 */
export function authFromCredential(credential: Credential | OAuthCredentials | undefined): TraeAuthInputs {
	return decodeKeyBundle(readTraeBundle(credential));
}

/** expiredAt（ISO）→ epoch ms；不可解析时回退 0（= 立即触发 pi 的刷新链）。 */
export function expiresEpochMs(iso: string): number {
	const parsed = Date.parse(iso);
	return Number.isNaN(parsed) ? 0 : parsed;
}

/** 提取链包装为 oauth.login 等效流程（D3：pi 拿到返回值即入 auth.json）。 */
export async function loginByExtraction(): Promise<OAuthCredentials> {
	const { login, device } = extractTraeLogin();
	const auth: TraeAuthInputs = {
		token: login.token,
		userId: login.userId,
		machineId: device.machineId,
		soloDeviceId: device.soloDeviceId,
	};
	return {
		refresh: login.refreshToken,
		access: login.token,
		expires: expiresEpochMs(login.expiredAt),
		traeBundle: encodeKeyBundle(auth),
	};
}

/**
 * extract 动作的响应组装（WoolCredentialAcquireData 契约）：
 * apiKey = 容器解密所得 JWT（裸令牌——设备要素不进契约，请求时从本机 storage.json
 * 现读）；容器无展示名字段，account 缺席；expiredAt（ISO）转 Unix ms，不可解析缺省。
 */
export function traeExtractToAcquireData(login: TraeStoredLogin): WoolCredentialAcquireData {
	const expiresAt = expiresEpochMs(login.expiredAt);
	return {
		credentials: {
			apiKey: login.token,
			...(login.refreshToken.length > 0 ? { refreshToken: login.refreshToken } : {}),
		},
		...(expiresAt > 0 ? { expiresAt } : {}),
	};
}

/** ExchangeToken 刷新（探针实测机制：payload 自带 refreshToken + 半年刷新窗口）。 */
export async function refreshViaExchangeToken(
	credentials: OAuthCredentials,
	signal?: AbortSignal,
): Promise<OAuthCredentials> {
	const current = authFromCredential(credentials);
	const response = await globalThis.fetch(`${TRAE_GATEWAY_CN}${REFRESH_ENDPOINT}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			ClientID: "ono9krqynydwx5",
			RefreshToken: credentials.refresh,
			ClientSecret: "-",
			UserID: current.userId,
		}),
		signal: signal ?? AbortSignal.timeout(REFRESH_TIMEOUT_MS),
	});
	const bodyText = await response.text().catch(() => "");
	if (!response.ok) {
		throw new Error(`ExchangeToken failed: ${response.status} ${bodyText.slice(0, ERROR_BODY_SNIPPET)}. ${TRAE_EXTRACT_RECOVERY_HINT}`);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(bodyText);
	} catch {
		throw new Error(`ExchangeToken returned non-JSON body. ${TRAE_EXTRACT_RECOVERY_HINT}`);
	}
	const record = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
	const data = typeof record.data === "object" && record.data !== null ? (record.data as Record<string, unknown>) : record;
	const token = typeof data.token === "string" ? data.token : typeof data.access_token === "string" ? data.access_token : undefined;
	const refreshToken =
		typeof data.refresh_token === "string" ? data.refresh_token : typeof data.refreshToken === "string" ? data.refreshToken : credentials.refresh;
	if (token === undefined) {
		throw new Error(`ExchangeToken response missing token. ${TRAE_EXTRACT_RECOVERY_HINT}`);
	}
	return {
		...credentials,
		access: token,
		refresh: refreshToken,
		expires: typeof data.expired_at === "number" ? data.expired_at : Date.now() + TOKEN_LIFETIME_FALLBACK_MS,
		traeBundle: encodeKeyBundle({ ...current, token }),
	};
}

/** oauth.getApiKey 实装（复合串优先，回退 access）。 */
export function getTraeApiKey(credentials: OAuthCredentials): string {
	const extras = credentials as Readonly<TraeCredentialExtras>;
	return extras.traeBundle ?? credentials.access;
}
