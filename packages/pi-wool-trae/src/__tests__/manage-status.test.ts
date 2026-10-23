// manage-status.test.ts — Trae status 管理动作接线测试（宿主契约形态 + 传参凭据通道）：
// 回包必须满足宿主 isWoolAccountStatusView 契约（loggedIn/fetchedAt，family 对齐）——
// 旧实现回 {providerId, loginDetected} 形态与宿主守卫不符（status 恒格式异常）。
// 登录态判定：params.apiKey 在场 → true；缺席 → storage.json 存在性（测试环境无 → false）。

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

// detectTraeLoginState 读本机真实 Trae storage.json（存在性 stat）——本机装有已登录
// Trae 时测试会读到真实登录态，结果随机器漂移。mock 固定为 false（缺席分支的
// 「无本地登录态」形态）；传参分支不依赖 detect（短路在前）。
vi.mock("../byte-crypto.ts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../byte-crypto.ts")>();
	return { ...actual, detectTraeLoginState: vi.fn(() => false) };
});

import piWoolTrae from "../index.ts";

type CommandOptions = { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> };

/** 最小 pi 替身：捕获管理命令 handler 与 appendEntry 回写。 */
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

describe("status 管理动作（宿主契约形态 + 传参凭据通道）", () => {
	it("params.apiKey 在场 → loggedIn=true，回包满足 isWoolAccountStatusView 契约（loggedIn/fetchedAt/family）", async () => {
		const mock = fakePi();
		piWoolTrae(mock.api);
		const command = mock.commands.get("wool-trae");
		expect(command).toBeDefined();
		await command!.handler(
			JSON.stringify({ v: 1, action: "status", params: { apiKey: "Cloud-IDE-JWT-fixture" } }),
			{} as ExtensionCommandContext,
		);
		const response = lastResponse(mock);
		expect(response.ok).toBe(true);
		const data = response.data as { loggedIn: boolean; family: string; fetchedAt: number };
		expect(data.loggedIn).toBe(true);
		expect(data.family).toBe("trae");
		expect(typeof data.fetchedAt).toBe("number");
	});

	it("params 缺席 → 回退本地存在性（测试环境无 storage.json → loggedIn=false）", async () => {
		const mock = fakePi();
		piWoolTrae(mock.api);
		const command = mock.commands.get("wool-trae");
		await command!.handler('{"v":1,"action":"status"}', {} as ExtensionCommandContext);
		const response = lastResponse(mock);
		expect(response.ok).toBe(true);
		expect((response.data as { loggedIn: boolean }).loggedIn).toBe(false);
	});
});
