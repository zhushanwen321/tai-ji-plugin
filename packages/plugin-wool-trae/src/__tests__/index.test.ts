// index.test.ts — plugin-wool-trae 装配与 GuiComponent 树构造（无 pi 运行时）。
//
// 覆盖：activate 注册的 invoke 方法集、提取确认卡树（本机容器路径明示）、条目扩展区
// 树、无签到体系应答。真机 storage.json 解密/网络链路由 P-wool-runtime 承接。

import { describe, expect, it } from "vitest";
import { createFakeWoolPluginHost, findGuiNodes, guiCommandIds, guiText } from "@zhushanwen/pi-wool-shared/testing";

import { activate, FAMILY_ID } from "../index.ts";

describe("plugin-wool-trae 装配", () => {
	it("family 词表 = trae", () => {
		expect(FAMILY_ID).toBe("trae");
	});

	it("activate 注册 ide-extract 家族方法集（无 PAT/checkin 差异件）", async () => {
		const host = createFakeWoolPluginHost();
		await activate(host.context);
		expect([...host.commands.keys()].sort()).toEqual(
			["checkin", "dismiss", "extract", "getAuthorizeView", "getDetail", "getStatus", "refreshCatalog", "submit-pat", "toggle-auto-checkin"].sort(),
		);
	});

	it("getAuthorizeView 推送提取确认卡（凭据去向声明 + 读取按钮）", async () => {
		const host = createFakeWoolPluginHost();
		await activate(host.context);
		await host.invoke("getAuthorizeView");
		const tree = host.trees.at(-1)!;
		expect(tree.mountId).toBe("provider.authorize");
		expect(guiText(tree.tree)).toContain("凭据只写入本机模型配置");
		expect(guiCommandIds(tree.tree)).toEqual(["extract", "dismiss"]);
	});

	it("getDetail 推送条目扩展区树；无签到体系不渲染签到按钮", async () => {
		const host = createFakeWoolPluginHost();
		await activate(host.context);
		await host.invoke("getDetail");
		const tree = host.trees.at(-1)!;
		expect(tree.mountId).toBe("provider.detail-extra");
		expect(guiCommandIds(tree.tree)).toEqual([]);
		expect(findGuiNodes(tree.tree, "stats-line")).toHaveLength(0);
	});

	it("checkin 显式应答 supported:false（Trae 无签到体系）", async () => {
		const host = createFakeWoolPluginHost();
		await activate(host.context);
		expect(await host.invoke<{ supported: boolean }>("checkin")).toEqual({
			supported: false,
			reason: "Trae (Wool) has no check-in program",
		});
	});

	it("refreshCatalog 无凭据 → 显式拒绝（不静默 0 模型）", async () => {
		const host = createFakeWoolPluginHost();
		await activate(host.context);
		const result = await host.invoke<{ ok: boolean; error?: string }>("refreshCatalog");
		expect(result.ok).toBe(false);
		expect(result.error).toContain("未接入");
	});
});
