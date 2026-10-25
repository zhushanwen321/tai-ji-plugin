// plugin-kit.test.ts — createWoolPlugin 接线与 GuiComponent 树构造（设计 D6/D8/D9 的
// 插件层验收：授权树 / 提取树 / PAT 输入树 / 条目扩展区树 / invoke 方法集 / 凭据落盘
// 与目录写回 / 签到与 autoCheckin 开关）。
//
// 宿主用 wool-shared/testing 的结构化替身（plugin-host.ts）；真机 fork 与宿主 RPC 线
// 由 P-wool-runtime / P-wool-e2e 承接。

import { describe, expect, it } from "vitest";

import { buildDetailTree, buildExtractTree, buildOAuthTree, buildPatTree, PAT_INPUT_COMPONENT_ID } from "../plugin/gui.ts";
import { createWoolPlugin, type WoolPluginDefinition } from "../plugin/plugin-kit.ts";
import { woolLoggedOutStatus } from "../account-status.ts";
import { createFakeWoolPluginHost } from "../testing/plugin-host.ts";
import type { WoolGuiComponent } from "../plugin/host-contract.ts";

const ACQUIRE = {
	credentials: { apiKey: "fixture-api-key", refreshToken: "fixture-refresh" },
	account: { displayName: "Fixture User" },
	expiresAt: 1_800_000_000_000,
};

function oauthDefinition(overrides: Partial<WoolPluginDefinition> = {}): WoolPluginDefinition {
	return {
		familyId: "workbuddy",
		displayName: "WorkBuddy",
		credentialsSource: "oauth",
		authorize: async () => ACQUIRE,
		fetchStatus: async (accessToken) =>
			accessToken === undefined
				? woolLoggedOutStatus("workbuddy", Date.now())
				: { family: "workbuddy", loggedIn: true, fetchedAt: Date.now() },
		fetchCatalog: async () => [{ id: "model-1", name: "Model 1" }],
		...overrides,
	};
}

function extractDefinition(overrides: Partial<WoolPluginDefinition> = {}): WoolPluginDefinition {
	return {
		familyId: "qoder",
		displayName: "Qoder (Wool)",
		credentialsSource: "ide-extract",
		extract: async () => ACQUIRE,
		fetchStatus: async () => woolLoggedOutStatus("qoder", Date.now()),
		fetchCatalog: async () => [{ id: "model-1" }],
		...overrides,
	};
}

/** 树遍历：收集指定 type 的组件（结构断言用；children 路径按 props 包装形状）。 */
function collect(tree: WoolGuiComponent[], type: WoolGuiComponent["type"]): WoolGuiComponent[] {
	const out: WoolGuiComponent[] = [];
	const walk = (nodes: WoolGuiComponent[]): void => {
		for (const node of nodes) {
			if (node.type === type) {
				out.push(node);
			}
			if (node.type === "group") {
				walk(node.props.children);
			}
			if (node.type === "card") {
				walk(node.props.body);
			}
		}
	};
	walk(tree);
	return out;
}

function commandIds(tree: WoolGuiComponent[]): string[] {
	return collect(tree, "action-bar").flatMap((node) => (node.type === "action-bar" ? node.props.items.map((item) => item.commandId ?? "") : []));
}

/** ansi-text 组件的全文本（props.lines 拼接；文案断言用）。 */
function ansiTextOf(tree: WoolGuiComponent[], index = 0): string {
	const node = collect(tree, "ansi-text")[index];
	return node?.type === "ansi-text" ? node.props.lines.join("\n") : "";
}

describe("GuiComponent 树构造（纯函数）", () => {
	it("OAuth 初始树：三步说明卡 + 去授权/取消", () => {
		const tree = buildOAuthTree({ phase: "ready", displayName: "WorkBuddy" });
		const card = collect(tree, "card")[0];
		expect(card?.type).toBe("card");
		expect(ansiTextOf(tree)).toContain("本机回调端口就绪");
		expect(commandIds(tree)).toEqual(["authorize", "dismiss"]);
	});

	it("OAuth 成功树：账号摘要行（stats-line）+ 完成按钮（无去授权）", () => {
		const tree = buildOAuthTree({ phase: "success", displayName: "WorkBuddy", summary: [{ label: "账号", value: "Fixture User" }] });
		const stats = collect(tree, "stats-line")[0];
		expect(stats?.type === "stats-line" && stats.props.items).toEqual([{ label: "账号", value: "Fixture User" }]);
		expect(commandIds(tree)).toEqual(["dismiss"]);
	});

	it("提取确认卡：路径明示 + 凭据去向声明 + 读取按钮", () => {
		const tree = buildExtractTree({ phase: "ready", displayName: "Trae (Wool)", credentialPath: "~/Library/storage.json" });
		const text = ansiTextOf(tree);
		expect(text).toContain("~/Library/storage.json");
		expect(text).toContain("凭据只写入本机模型配置");
		expect(commandIds(tree)).toEqual(["extract", "dismiss"]);
	});

	it("PAT 树：text-input 组件在场（D8 唯一输入原语）+ 提交/取消", () => {
		const tree = buildPatTree({ displayName: "Qoder (Wool)", patValue: "pt-fixture" });
		const input = collect(tree, "text-input")[0];
		expect(input?.type === "text-input" && input.props.id).toBe(PAT_INPUT_COMPONENT_ID);
		expect(input?.type === "text-input" && input.props.value).toBe("pt-fixture");
		expect(commandIds(tree)).toEqual(["submit-pat", "dismiss"]);
	});

	it("条目扩展区：已登录显示账号/额度/签到 + 手动签到 + autoCheckin 开关", () => {
		const tree = buildDetailTree({
			displayName: "WorkBuddy",
			status: {
				family: "workbuddy",
				loggedIn: true,
				nickname: "Fixture User",
				quota: { used: 3, remaining: 7, total: 10, unit: "points" },
				checkin: { doneToday: false },
				fetchedAt: 1,
			},
			checkinSupported: true,
			autoCheckin: true,
		});
		const stats = collect(tree, "stats-line")[0];
		expect(stats?.type === "stats-line" && stats.props.items.map((item) => item.label)).toEqual(["账号", "额度"]);
		expect(commandIds(tree)).toEqual(["checkin", "toggle-auto-checkin"]);
		const toggle = collect(tree, "action-bar")[0];
		expect(toggle?.type === "action-bar" && toggle.props.items[1]?.label).toBe("每日自动签到：开");
	});

	it("条目扩展区：未登录/未上报不显示失效标记，只给接入引导", () => {
		const tree = buildDetailTree({ displayName: "WorkBuddy", status: undefined, checkinSupported: true, autoCheckin: false });
		expect(collect(tree, "stats-line")).toHaveLength(0);
		expect(collect(tree, "action-bar")).toHaveLength(0);
		expect(ansiTextOf(tree)).toContain("尚未接入");
	});

	it("无签到体系的家族不渲染死按钮（checkinSupported=false）", () => {
		const tree = buildDetailTree({
			displayName: "Qoder (Wool)",
			status: { family: "qoder", loggedIn: true, fetchedAt: 1 },
			checkinSupported: false,
			autoCheckin: false,
		});
		expect(commandIds(tree)).toEqual([]);
	});

	it("树形状 = 宿主协议 { type, props } 包装（renderer isGuiComponent 校验契约——形状漂移 = 全树被拒、DOM 空白）", () => {
		const tree = buildExtractTree({ phase: "ready", displayName: "Trae (Wool)", credentialPath: "~/x" });
		for (const node of tree) {
			expect(typeof node.type).toBe("string");
			expect(typeof node.props).toBe("object");
			expect(node.props).not.toBeNull();
		}
	});
});

describe("createWoolPlugin 接线", () => {
	it("装配期校验：oauth 家族缺 authorize / ide-extract 家族缺 extract → fail-fast", () => {
		expect(() => createWoolPlugin({ ...oauthDefinition(), authorize: undefined })).toThrow(/requires an authorize implementation/);
		expect(() => createWoolPlugin({ ...extractDefinition(), extract: undefined })).toThrow(/requires an extract implementation/);
	});

	it("getAuthorizeView 推送 provider.authorize 挂载位树（viewId = 挂载位同名，宿主 ViewHost 精确匹配契约）", async () => {
		const host = createFakeWoolPluginHost();
		await createWoolPlugin(oauthDefinition())(host.context);
		await host.invoke("getAuthorizeView");
		expect(host.trees).toHaveLength(1);
		expect(host.trees[0]!.viewId).toBe("provider.authorize");
		expect(host.trees[0]!.mountId).toBe("provider.authorize");
		expect(commandIds(host.trees[0]!.tree)).toEqual(["authorize", "dismiss"]);
	});

	it("extract 成功：凭据经 providers.write 落盘（含 refreshToken headers 承载键）+ 目录写回", async () => {
		const host = createFakeWoolPluginHost();
		await createWoolPlugin(extractDefinition())(host.context);
		const result = await host.invoke<{ ok: boolean }>("extract");
		expect(result.ok).toBe(true);
		// 第一次写凭据、第二次写目录（同一 providerId、同一写策略链）。
		expect(host.writes).toHaveLength(2);
		expect(host.writes[0]).toMatchObject({
			providerId: "wool-qoder",
			apiKey: "fixture-api-key",
			headers: { "x-wool-refresh-token": "fixture-refresh" },
			displayName: "Fixture User",
		});
		expect(host.writes[1]).toMatchObject({ providerId: "wool-qoder", models: [{ id: "model-1" }] });
		expect(host.storage.get("catalog-adopted")).toBe(true);
	});

	it("extract 失败且有 PAT 入口 → 转 text-input 屏；uiEvent 回传值直达 submit-pat", async () => {
		const host = createFakeWoolPluginHost();
		let submitted: string | undefined;
		await createWoolPlugin(
			extractDefinition({
				extract: async () => {
					throw new Error("keychain locked");
				},
				submitPat: async (pat) => {
					submitted = pat;
					return ACQUIRE;
				},
			}),
		)(host.context);
		const failed = await host.invoke<{ ok: boolean; patEntry?: boolean }>("extract");
		expect(failed).toMatchObject({ ok: false, patEntry: true });
		const patTree = host.trees.at(-1)!.tree;
		expect(collect(patTree, "text-input")).toHaveLength(1);
		// D8 值回传：text-input 变更经 plugin.uiEvent 到达插件，确认按钮读最近值。
		host.emitUiEvent({ viewId: "provider.authorize", componentId: PAT_INPUT_COMPONENT_ID, event: "change", value: "pt-from-ui-event" });
		const submittedResult = await host.invoke<{ ok: boolean }>("submit-pat");
		expect(submittedResult.ok).toBe(true);
		expect(submitted).toBe("pt-from-ui-event");
	});

	it("getStatus 返回宿主展示契约形状：未上报 = null（宿主不显示标记）；异步校验后推送 { providerId, state, message }", async () => {
		const host = createFakeWoolPluginHost();
		await createWoolPlugin(oauthDefinition())(host.context);
		const first = await host.invoke<unknown>("getStatus");
		expect(first).toBeNull(); // 尚未上报 = null（宿主不显示失效标记）
		await new Promise((resolve) => setTimeout(resolve, 0));
		// 无凭据：异步校验落未登录态并经 plugin:event 增量上报（拉为主、推补充）。
		// 推送载荷 = 宿主 parseCredentialStatus 契约形状（channel 同字面 + 归属 providerId 必带）。
		expect(host.events[0]?.channel).toBe("provider.credentialStatus");
		expect(host.events[0]?.payload).toMatchObject({
			providerId: "wool-workbuddy",
			state: "invalid",
			message: expect.stringContaining("未接入"),
		});
		// 缓存落定后的拉取返回 invalid 态（宿主状态行显示「未接入」文案）。
		const second = await host.invoke<{ state?: string; message?: string } | null>("getStatus");
		expect(second).toMatchObject({ state: "invalid", message: expect.stringContaining("未接入") });
	});

	it("getStatus 形状三态：未上报 null / 未登录 invalid / 已登录 valid 且 message 携带昵称与额度摘要", async () => {
		const host = createFakeWoolPluginHost({
			credentials: { "wool-workbuddy": { providerId: "wool-workbuddy", key: "fixture-token", source: "models.json", kind: "api_key" } },
		});
		await createWoolPlugin(
			oauthDefinition({
				fetchStatus: async () => ({
					family: "workbuddy",
					loggedIn: true,
					nickname: "Fixture User",
					quota: { used: 3, remaining: 7, total: 10, unit: "points" },
					fetchedAt: 1,
				}),
			}),
		)(host.context);
		const first = await host.invoke<unknown>("getStatus");
		expect(first).toBeNull(); // 首次拉取 = 尚未上报（宿主不显示任何标记）
		await new Promise((resolve) => setTimeout(resolve, 0));
		// 异步校验刷新缓存后，下次拉取返回已登录态（message 携带昵称/额度素材）。
		const loggedIn = await host.invoke<{ state?: string; message?: string } | null>("getStatus");
		expect(loggedIn).toMatchObject({ state: "valid" });
		expect(loggedIn?.message).toContain("Fixture User");
		expect(loggedIn?.message).toContain("7 / 10 points");
		// 推送载荷同形状（valid 态）：宿主状态行渲染的唯一输入。
		const pushed = host.events.at(-1)?.payload as { providerId?: string; state?: string };
		expect(pushed).toMatchObject({ providerId: "wool-workbuddy", state: "valid" });
	});

	it("已登录但无昵称/额度素材（Trae 设计性缺席）→ message 省略（宿主回落默认文案，不渲染空白行）", async () => {
		const host = createFakeWoolPluginHost({
			credentials: { "wool-workbuddy": { providerId: "wool-workbuddy", key: "fixture-token", source: "models.json", kind: "api_key" } },
		});
		await createWoolPlugin(
			oauthDefinition({
				fetchStatus: async () => ({ family: "workbuddy", loggedIn: true, fetchedAt: 1 }),
			}),
		)(host.context);
		await host.invoke("getStatus");
		await new Promise((resolve) => setTimeout(resolve, 0));
		const bare = await host.invoke<{ state?: string; message?: string } | null>("getStatus");
		expect(bare).toEqual({ state: "valid" }); // 无 message 键 → 宿主 fallbackValid「凭据可用」
	});

	it("getDetail 推送 provider.detail-extra 树（viewId = 挂载位同名契约）+ 返回 autoCheckin 当前值", async () => {
		const host = createFakeWoolPluginHost({ storage: { "checkin-settings": { autoCheckin: true } } });
		await createWoolPlugin(oauthDefinition())(host.context);
		const result = await host.invoke<{ autoCheckin: boolean }>("getDetail");
		expect(result.autoCheckin).toBe(true);
		expect(host.trees.at(-1)!.viewId).toBe("provider.detail-extra");
		expect(host.trees.at(-1)!.mountId).toBe("provider.detail-extra");
	});

	it("toggle-auto-checkin 翻转并持久化到插件 storage（非凭据）", async () => {
		const host = createFakeWoolPluginHost();
		await createWoolPlugin(oauthDefinition())(host.context);
		const first = await host.invoke<{ autoCheckin: boolean }>("toggle-auto-checkin");
		expect(first.autoCheckin).toBe(true);
		expect(host.storage.get("checkin-settings")).toEqual({ autoCheckin: true });
		const second = await host.invoke<{ autoCheckin: boolean }>("toggle-auto-checkin");
		expect(second.autoCheckin).toBe(false);
	});

	it("checkin：无签到体系的家族显式应答 supported:false（不静默假成功）", async () => {
		const host = createFakeWoolPluginHost();
		await createWoolPlugin(extractDefinition())(host.context);
		const result = await host.invoke<{ supported: boolean }>("checkin");
		expect(result.supported).toBe(false);
	});

	it("checkin：有签到体系但无凭据 → 显式拒绝（不造假成功）", async () => {
		const host = createFakeWoolPluginHost();
		let called = false;
		await createWoolPlugin(
			oauthDefinition({
				checkin: async () => {
					called = true;
					return { ok: true };
				},
			}),
		)(host.context);
		await expect(host.invoke("checkin")).rejects.toThrow(/签到需要已保存的凭据/);
		expect(called).toBe(false);
	});

	it("checkin：凭据在位时把 access token 交给家族差异件（签到请求需要鉴权）", async () => {
		const host = createFakeWoolPluginHost({
			credentials: { "wool-workbuddy": { providerId: "wool-workbuddy", key: "fixture-token", source: "models.json", kind: "api_key" } },
		});
		let received: string | undefined;
		await createWoolPlugin(
			oauthDefinition({
				checkin: async (accessToken) => {
					received = accessToken;
					return { ok: true };
				},
			}),
		)(host.context);
		const result = await host.invoke<{ supported: boolean }>("checkin");
		expect(result.supported).toBe(true);
		expect(received).toBe("fixture-token");
	});

	it("存量条目采纳链（S24）：getStatus 校验通过且未接管 → 拉目录写回条目并置接管标记", async () => {
		const host = createFakeWoolPluginHost({
			credentials: { "wool-workbuddy": { providerId: "wool-workbuddy", key: "fixture-token", source: "models.json", kind: "api_key" } },
		});
		await createWoolPlugin(oauthDefinition())(host.context);
		await host.invoke("getStatus");
		await new Promise((resolve) => setTimeout(resolve, 5));
		// 写回 = providers.write 的 models 字段（与凭据同一写策略链、同一权威源）。
		expect(host.writes.some((write) => Array.isArray(write.models))).toBe(true);
		expect(host.storage.get("catalog-adopted")).toBe(true);
	});

	it("目录写回失败不置接管标记（下次条目展开幂等重试自愈，不设定时补偿）", async () => {
		const host = createFakeWoolPluginHost({
			credentials: { "wool-workbuddy": { providerId: "wool-workbuddy", key: "fixture-token", source: "models.json", kind: "api_key" } },
		});
		await createWoolPlugin(
			oauthDefinition({
				fetchCatalog: async () => {
					throw new Error("catalog upstream down");
				},
			}),
		)(host.context);
		await host.invoke("getStatus");
		await new Promise((resolve) => setTimeout(resolve, 5));
		expect(host.storage.get("catalog-adopted")).toBeUndefined();
	});

	it("校验失败保留最近已知已登录态（网络失败不误报未登录）", async () => {
		let calls = 0;
		const host = createFakeWoolPluginHost({
			credentials: { "wool-workbuddy": { providerId: "wool-workbuddy", key: "fixture-token", source: "models.json", kind: "api_key" } },
		});
		await createWoolPlugin(
			oauthDefinition({
				fetchStatus: async () => {
					calls += 1;
					if (calls === 1) {
						return { family: "workbuddy", loggedIn: true, fetchedAt: 1 };
					}
					throw new Error("status upstream timeout");
				},
			}),
		)(host.context);
		await host.invoke("getStatus");
		await new Promise((resolve) => setTimeout(resolve, 5));
		const second = await host.invoke<{ state?: string; message?: string } | null>("getStatus");
		expect(second).toMatchObject({ state: "valid" });
		await new Promise((resolve) => setTimeout(resolve, 5));
		const third = await host.invoke<{ state?: string; message?: string } | null>("getStatus");
		expect(third).toMatchObject({ state: "valid" });
	});

	it("每日签到定时器：dailyCheckin 家族注册可清理订阅；无签到体系家族不注册", async () => {
		// 两族都注册 uiEvent 订阅（D8 值回传）；差值即定时器订阅。
		const withoutTimer = createFakeWoolPluginHost();
		await createWoolPlugin(extractDefinition())(withoutTimer.context);
		const withTimer = createFakeWoolPluginHost();
		await createWoolPlugin(
			oauthDefinition({
				dailyCheckin: true,
				checkin: async () => ({ ok: true }),
			}),
		)(withTimer.context);
		expect(withTimer.context.subscriptions.length).toBe(withoutTimer.context.subscriptions.length + 1);
	});

	it("refreshCatalog：无凭据显式拒绝；有凭据写回目录并置接管标记", async () => {
		const emptyHost = createFakeWoolPluginHost();
		await createWoolPlugin(extractDefinition())(emptyHost.context);
		const rejected = await emptyHost.invoke<{ ok: boolean; error?: string }>("refreshCatalog");
		expect(rejected.ok).toBe(false);
		expect(rejected.error).toContain("未接入");

		const host = createFakeWoolPluginHost({
			credentials: { "wool-qoder": { providerId: "wool-qoder", key: "fixture-token", source: "models.json", kind: "api_key" } },
		});
		await createWoolPlugin(extractDefinition())(host.context);
		const ok = await host.invoke<{ ok: boolean }>("refreshCatalog");
		expect(ok.ok).toBe(true);
		expect(host.storage.get("catalog-adopted")).toBe(true);
	});

	it("授权页打开失败（宿主浏览器出口未就绪）→ 显式报错，不静默等待", async () => {
		const host = createFakeWoolPluginHost();
		host.context.api.ui.openUrl = async () => ({ opened: false });
		await createWoolPlugin(
			oauthDefinition({
				authorize: async (io) => {
					await io.openAuthorizePage("https://example.invalid/authorize");
					return ACQUIRE;
				},
			}),
		)(host.context);
		const result = await host.invoke<{ ok: boolean; error?: string }>("authorize");
		expect(result.ok).toBe(false);
		expect(result.error).toContain("授权页未能打开");
	});
});
