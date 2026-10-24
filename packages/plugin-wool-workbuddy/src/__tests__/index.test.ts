// index.test.ts — plugin-wool-workbuddy 装配与 GuiComponent 树构造（无 pi 运行时）。
//
// 覆盖：activate 注册的 invoke 方法集、OAuth 三步授权树、条目扩展区树（签到体系）、
// autoCheckin 开关持久化、无凭据签到显式拒绝、每日定时器订阅。真机 OAuth / 上游
// 网络链路由 P-wool-runtime / P-wool-e2e 承接。

import { describe, expect, it } from "vitest";
import { createFakeWoolPluginHost, findGuiNodes, guiCommandIds, guiText } from "@zhushanwen/pi-wool-shared/testing";

import { activate, FAMILY_ID } from "../index.ts";

describe("plugin-wool-workbuddy 装配", () => {
	it("family 词表 = workbuddy", () => {
		expect(FAMILY_ID).toBe("workbuddy");
	});

	it("activate 注册 OAuth 家族方法集（authorize + checkin）", async () => {
		const host = createFakeWoolPluginHost();
		await activate(host.context);
		expect([...host.commands.keys()].sort()).toEqual(
			["authorize", "checkin", "dismiss", "getAuthorizeView", "getDetail", "getStatus", "refreshCatalog", "toggle-auto-checkin"].sort(),
		);
	});

	it("getAuthorizeView 推送 OAuth 三步树（去授权/取消）", async () => {
		const host = createFakeWoolPluginHost();
		await activate(host.context);
		await host.invoke("getAuthorizeView");
		const tree = host.trees.at(-1)!;
		expect(tree.mountId).toBe("provider.authorize");
		const text = guiText(tree.tree);
		expect(text).toContain("本机回调端口就绪");
		expect(text).toContain("本机模型配置");
		expect(guiCommandIds(tree.tree)).toEqual(["authorize", "dismiss"]);
	});

	it("getDetail 推送条目扩展区树；状态未上报时不渲染统计行与按钮（D5：不显示失效标记）", async () => {
		// 状态缓存只由 getStatus 的异步上游校验填充（本用例不触发网络）；未上报 = 接入引导。
		const host = createFakeWoolPluginHost();
		await activate(host.context);
		await host.invoke("getDetail");
		const tree = host.trees.at(-1)!;
		expect(tree.mountId).toBe("provider.detail-extra");
		expect(findGuiNodes(tree.tree, "stats-line")).toHaveLength(0);
		expect(guiCommandIds(tree.tree)).toEqual([]);
	});

	it("toggle-auto-checkin 翻转并写入插件 storage（非凭据）", async () => {
		const host = createFakeWoolPluginHost();
		await activate(host.context);
		expect(await host.invoke<{ autoCheckin: boolean }>("toggle-auto-checkin")).toEqual({ autoCheckin: true });
		expect(host.storage.get("checkin-settings")).toEqual({ autoCheckin: true });
	});

	it("checkin 无凭据 → 显式拒绝（不伪造签到成功）", async () => {
		const host = createFakeWoolPluginHost();
		await activate(host.context);
		await expect(host.invoke("checkin")).rejects.toThrow(/签到需要已保存的凭据/);
	});

	it("每日签到定时器在 activate 时注册（产品功能定时白名单形态，激活重建）", async () => {
		const host = createFakeWoolPluginHost();
		await activate(host.context);
		expect(host.context.subscriptions.length).toBeGreaterThanOrEqual(1);
		const disposable = host.context.subscriptions[0]!;
		expect(() => disposable.dispose()).not.toThrow();
	});

	it("条目扩展区未接入态只给引导（不显示失效标记）", async () => {
		const host = createFakeWoolPluginHost();
		await activate(host.context);
		await host.invoke("getDetail");
		expect(findGuiNodes(host.trees.at(-1)!.tree, "stats-line")).toHaveLength(0);
	});
});
