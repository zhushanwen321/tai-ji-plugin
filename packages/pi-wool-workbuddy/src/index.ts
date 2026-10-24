// src/index.ts — @zhushanwen/pi-wool-workbuddy：WorkBuddy 家族羊毛 provider 扩展
// （pi 会话进程侧）。
//
// 瘦身后职责（设计 D6/D7）：registerProvider + streamSimple 协议翻译 + oauth 钩子。
// 管理动作（授权 / 状态 / 签到 / 目录刷新）已迁 plugin-wool-workbuddy；本扩展不再注册
// 管理命令、不定义 refreshModels、不拉上游目录、不写宿主目录缓存——模型目录唯一
// 数据源 = models.json 羊毛条目的 models 数组（插件经 providers.write 写回）。
//
// 凭据通道（D2 双通道）：主通道 = 请求时 options.apiKey（models.json 羊毛条目）；
// 次通道 = oauth 钩子（独立 pi 用户 /login）。

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
	defineWoolExtension,
	type WoolStreamOutcome,
	type WoolStreamRequest,
} from "@zhushanwen/pi-wool-shared";
import {
	workbuddyApiKey,
	workbuddyLogin,
	workbuddyRefresh,
} from "@zhushanwen/pi-wool-shared/workbuddy";

import { workbuddyStream } from "./stream.ts";

export const FAMILY_ID = "workbuddy" as const;
export const PROVIDER_ID = "wool-workbuddy" as const;
export const PROVIDER_API = "wool-workbuddy" as const;

/** 会话键：同一 pi 会话多轮复用 X-Conversation-ID（首条 user 消息时间戳 = 会话稳定特征）。 */
function conversationKeyOf(messages: WoolStreamRequest["messages"]): string {
	for (const message of messages) {
		if (message.role === "user") {
			return String(message.timestamp);
		}
	}
	return "empty-session";
}

function streamAdapter(request: WoolStreamRequest): Promise<WoolStreamOutcome> {
	return workbuddyStream({
		model: request.model,
		systemPrompt: request.systemPrompt,
		tools: request.tools,
		messages: request.messages,
		resolvedAuth: request.resolvedAuth,
		driver: request.driver,
		conversationKey: conversationKeyOf(request.messages),
	});
}

/**
 * 扩展入口（extension-conventions：default export 即 ExtensionFactory）。
 */
export default function piWoolWorkbuddyExtension(pi: ExtensionAPI): void {
	defineWoolExtension({
		familyId: FAMILY_ID,
		displayName: "WorkBuddy",
		api: PROVIDER_API,
		// baseUrl 为 pi composer 硬校验项（带 models 注册时必填）；对话端点 CN 基址。
		baseUrl: "https://copilot.tencent.com",
		stream: streamAdapter,
		oauth: {
			name: "WorkBuddy (Tencent)",
			login: (callbacks) => workbuddyLogin(callbacks),
			refreshToken: (credentials, signal) => workbuddyRefresh(credentials, signal),
			getApiKey: (credentials) => workbuddyApiKey(credentials),
		},
	})(pi);
}
