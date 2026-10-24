// index.test.ts — plugin-wool-qoder 装配与 GuiComponent 树构造（无 pi 运行时）。
//
// 覆盖：activate 注册的 invoke 方法集、提取确认卡树、条目扩展区树、无签到体系应答、
// 命名空间推导的 providerId 词表。真机凭据提取/网络链路由 P-wool-runtime 承接。

import { describe, expect, it } from "vitest";
import { guiCommandIds, guiText, findGuiNodes, createFakeWoolPluginHost } from "@zhushanwen/pi-wool-shared/testing";

import { activate, FAMILY_ID } from "../index.ts";

describe("plugin-wool-qoder 装配", () => {
	it("family 词表 = qoder", () => {
		expect(FAMILY_ID).toBe("qoder");
	});

	it("activate 注册 ide-extract 家族方法集（无 authorize/checkin 差异件）", async () => {
		const host = createFakeWoolPluginHost();
		await activate(host.context);
		expect([...host.commands.keys()].sort()).toEqual(
			["checkin", "dismiss", "extract", "getAuthorizeView", "getDetail", "getStatus", "refreshCatalog", "submit-pat", "toggle-auto-checkin"].sort(),
		);
	});

	it("getAuthorizeView 推送提取确认卡（路径明示 + 凭据去向声明 + 读取按钮）", async () => {
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
	});

	it("checkin 显式应答 supported:false（Qoder 无签到体系，不静默假成功）", async () => {
		const host = createFakeWoolPluginHost();
		await activate(host.context);
		const result = await host.invoke<{ supported: boolean }>("checkin");
		expect(result.supported).toBe(false);
	});

	it("activate 校验宿主域：缺 providers 域 fail-fast（错误消息指向宿主版本要求）", async () => {
		const host = createFakeWoolPluginHost();
		const broken = {
			...host.context,
			api: { ...host.context.api, providers: undefined },
		};
		// 结构化替身被 readOnly 收窄，这里按运行时缺陷注入。
		await expect(activate(broken as unknown as typeof host.context)).rejects.toThrow(/missing required domain\(s\): providers/);
	});

	it("条目扩展区未接入态只给引导，不渲染 stats-line", async () => {
		const host = createFakeWoolPluginHost();
		await activate(host.context);
		await host.invoke("getDetail");
		expect(findGuiNodes(host.trees.at(-1)!.tree, "stats-line")).toHaveLength(0);
	});
});
