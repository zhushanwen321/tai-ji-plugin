// src/index.ts — @zhushanwen/pi-wool-trae：Trae 家族羊毛 provider 扩展（pi 会话进程侧）。
//
// 瘦身后职责（设计 D6/D7）：registerProvider + streamSimple 协议翻译 + oauth 钩子。
// 管理动作（提取 / 状态 / 目录刷新）已迁 plugin-wool-trae；本扩展不再注册管理命令、
// 不定义 refreshModels、不拉上游目录——模型目录唯一数据源 = models.json 羊毛条目的
// models 数组（插件经 providers.write 写回）。
//
// 凭据通道（D2 双通道）：主通道 = models.json 羊毛条目 apiKey（裸 JWT，请求时设备
// 三要素从本机 storage.json 现读）；次通道 = oauth 钩子（独立 pi 用户 /login，
// 复合串带全三要素）。

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { OAuthCredentials } from "@earendil-works/pi-ai";

import { defineWoolExtension, type WoolStreamRequest } from "@zhushanwen/pi-wool-shared";
import {
	TRAE_API_ID,
	TRAE_GATEWAY_CN,
	getTraeApiKey,
	loginByExtraction,
	refreshViaExchangeToken,
	resolveTraeAuth,
} from "@zhushanwen/pi-wool-shared/trae";

import { driveTraeStream } from "./stream.ts";

/** 家族 id（wool 词表 trae）。 */
export const FAMILY_ID = "trae" as const;

/** pi provider 注册名（woolProviderId("trae")）。 */
export const PROVIDER_ID = "wool-trae";

/** family streamSimple：SOLO 协议翻译（D1）。 */
async function stream(request: WoolStreamRequest) {
	if (!request.resolvedAuth.ok) {
		throw new Error(`Trae credentials unavailable: ${request.resolvedAuth.error}`);
	}
	return driveTraeStream({
		auth: resolveTraeAuth(request.resolvedAuth.apiKey),
		systemPrompt: request.systemPrompt,
		tools: request.tools,
		messages: request.messages,
		driver: request.driver,
	});
}

/**
 * 扩展入口（extension-conventions：default export 即 ExtensionFactory）。
 */
export default function piWoolTrae(pi: ExtensionAPI): void {
	defineWoolExtension({
		familyId: FAMILY_ID,
		displayName: "Trae (Wool)",
		api: TRAE_API_ID,
		baseUrl: TRAE_GATEWAY_CN,
		stream,
		oauth: {
			name: "Trae (local extraction)",
			login: () => loginByExtraction(),
			refreshToken: (credentials: OAuthCredentials, signal: AbortSignal) => refreshViaExchangeToken(credentials, signal),
			getApiKey: (credentials) => getTraeApiKey(credentials),
		},
	})(pi);
}
