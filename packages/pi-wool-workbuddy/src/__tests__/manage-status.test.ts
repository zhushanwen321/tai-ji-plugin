// manage-status.test.ts — WorkBuddy status 管理动作接线测试（宿主传参凭据通道）：
// params.apiKey 在场 → 直接作 access token 进账号聚合（对话链同源凭据）；缺席 →
// registry 补习链（session_start 未触发时恒 undefined → not_logged_in）。
// 账号聚合契约本体（JWT 解码/checkin/quota 降级）由 account 直测覆盖。

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

/** 测试用 JWT（payload sub/exp/domain 固定）——增值字段拉取走 fetch 路由 stub。 */
function jwtWith(payload: Record<string, unknown>): string {
	return `h.${btoa(JSON.stringify(payload))}.s`;
}

const PASSED_KEY = jwtWith({ sub: "user-status", exp: 9999999999, domain: "copilot.tencent.com" });

vi.stubGlobal(
	"fetch",
	vi.fn(async () => new Response("{}", { status: 404 })),
);

import piWoolWorkbuddy from "../index.ts";

type CommandOptions = { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> };

/** 最小 pi 替身：捕获管理命令 handler 与 appendEntry 回写（session_start 不触发 →
 * apiKeyResolver 恒 undefined，即「管理会话冷启动」形态）。 */
function fakePi() {
	const commands = new Map<string, CommandOptions>();
	const entries: Array<{ type: string; data: unknown }> = [];
	const api = {
		on: () => undefined,
		registerProvider: () => undefined,
		registerCommand: (name: string, options: CommandOptions) => {
			commands.set(name, options);
		},
		appendEntry: (type: string, data?: unknown) => {
			entries.push({ type, data });
		},
	};
	return { api: api as unknown as ExtensionAPI, commands, entries };
}

function lastResponse(mock: ReturnType<typeof fakePi>): { ok: boolean; data?: unknown } {
	const last = mock.entries.filter((entry) => entry.type === "wool-manage-response").at(-1);
	return (last?.data as { response: { ok: boolean; data?: unknown } }).response;
}

describe("status 管理动作（宿主传参凭据通道）", () => {
	it("params.apiKey 在场 → loggedIn=true（传参 key 直接作 access token，不依赖 registry 补习）", async () => {
		const mock = fakePi();
		piWoolWorkbuddy(mock.api);
		const command = mock.commands.get("wool-workbuddy");
		expect(command).toBeDefined();
		await command!.handler(
			JSON.stringify({ v: 1, action: "status", params: { apiKey: PASSED_KEY } }),
			{} as ExtensionCommandContext,
		);
		const response = lastResponse(mock);
		expect(response.ok).toBe(true);
		const data = response.data as { loggedIn: boolean; family: string };
		expect(data.loggedIn).toBe(true);
		expect(data.family).toBe("workbuddy");
	});

	it("params 缺席 → registry 补习链恒空 → not_logged_in（行为与旧版一致）", async () => {
		const mock = fakePi();
		piWoolWorkbuddy(mock.api);
		const command = mock.commands.get("wool-workbuddy");
		await command!.handler('{"v":1,"action":"status"}', {} as ExtensionCommandContext);
		const response = lastResponse(mock);
		expect(response.ok).toBe(true);
		expect((response.data as { loggedIn: boolean }).loggedIn).toBe(false);
	});
});
