// src/index.ts — @zhushanwen/pi-wool-qoder：Qoder 家族羊毛 provider 扩展（pi 会话进程侧）。
//
// 瘦身后职责（设计 D6/D7）：registerProvider + streamSimple 协议翻译 + oauth 钩子。
// 管理动作（提取 / 授权 / 状态 / 签到 / 目录刷新）已迁 plugin-wool-qoder；本扩展不再
// 注册管理命令、不定义 refreshModels、不拉上游目录、不写宿主目录缓存——模型目录唯一
// 数据源 = models.json 羊毛条目的 models 数组（插件经 providers.write 写回）。
//
// 凭据通道（D2 双通道）：主通道 = 请求时 options.apiKey（models.json 羊毛条目，经
// adoptRequestApiKey 采纳进 authStore）；次通道 = oauth 钩子（独立 pi 用户 /login）。

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { OAuthCredentials } from "@earendil-works/pi-ai";

import { defineWoolExtension, type WoolStreamImplementation } from "@zhushanwen/pi-wool-shared";
import {
	GATEWAY_BASE_URL,
	QODER_API_ID,
	QoderAuthStore,
	adoptRequestApiKey,
	login,
	lookupModelMeta,
	makeGetApiKey,
	refreshToken,
} from "@zhushanwen/pi-wool-shared/qoder";

import { createQoderDrive } from "./chat-stream.ts";

/** 家族 id（wool 词表 qoder）。 */
export const FAMILY_ID = "qoder" as const;

/** provider 注册名（woolProviderId("qoder")）。 */
export const PROVIDER_ID = "wool-qoder";

/**
 * 扩展入口（extension-conventions：default export 即 ExtensionFactory）。
 * authStore 在同一 pi 实例内由 stream 与 getApiKey 钩子共享（请求间凭据学习通道）。
 */
export default function piWoolQoder(pi: ExtensionAPI): void {
	const authStore = new QoderAuthStore();
	const drive = createQoderDrive({ authStore, lookupModelMeta });
	// drive 参数形态是 WoolStreamRequest 的结构子集（凭据从 authStore 取）。请求时
	// 凭据双通道（D2）经 adoptRequestApiKey 采纳进 authStore：options.apiKey
	// （models.json 羊毛条目）在场即学习；oauth 钩子通道的 token 由 getApiKey 学习。
	const stream: WoolStreamImplementation = async (request) => {
		if (!request.resolvedAuth.ok) {
			throw new Error(request.resolvedAuth.error);
		}
		await adoptRequestApiKey(authStore, request.resolvedAuth.apiKey);
		return drive({
			model: request.model,
			systemPrompt: request.systemPrompt,
			tools: request.tools,
			messages: request.messages,
			driver: request.driver,
		});
	};

	defineWoolExtension({
		familyId: FAMILY_ID,
		displayName: "Qoder (Wool)",
		api: QODER_API_ID,
		// baseUrl 为 pi composer 硬校验项（P6 发现：带 models 注册时必填）。
		baseUrl: GATEWAY_BASE_URL,
		stream,
		oauth: {
			name: "Qoder (Alibaba)",
			login: (callbacks) =>
				login({
					onPrompt: (prompt) => callbacks.onPrompt(prompt),
					...(callbacks.onProgress !== undefined
						? { onProgress: (message) => callbacks.onProgress?.(message) }
						: {}),
				}),
			refreshToken: (credentials: OAuthCredentials, signal: AbortSignal) => refreshToken(credentials, signal),
			getApiKey: makeGetApiKey(authStore),
		},
	})(pi);
}
