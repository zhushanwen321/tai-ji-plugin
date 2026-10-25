// gui.ts — 羊毛插件授权流程与条目扩展区的 GuiComponent 树构造（纯函数）。
//
// 形态依据（设计 §3.1 四个交互样例 + D8 原语裁决）：
// - 授权挂载位（provider.authorize）两形态：OAuth 家族 = 三步说明卡 + [去授权]；
//   提取家族 = 确认卡（路径明示 + 凭据去向声明）+ [读取本机登录态]。Qoder 提取失败
//   的次级入口 = text-input 粘贴官方 PAT（P-ui 第五屏唯一真实输入需求方）。
// - 条目扩展区（provider.detail-extra）：签到/额度状态行 + 手动签到按钮 + autoCheckin
//   开关（插件渲染——设置界面由插件承担，D6 迁移映射表）。
// - action-bar 的 commandId 指向插件注册的 invoke 方法 id（executeCommand 与 invoke
//   复用同一注册表——宿主 dispatchByMethodKey 复合键一致，不新建路由）。
//
// 组件形状 = 宿主协议真形 { type, props } 包装（SSOT = @zhushanwen/extension-protocol
// core/types；本文件底部的 ansiText/card/actionBar/statsLine 四个 helper 是唯一组装点）。
// 宿主对窄化不过的树静默丢弃（renderer ViewHostStore narrowGuiTree → 空树 → 空白渲染），
// 形状错位的真机症状 = 授权容器空白而非报错——形状改动必须对着宿主协议核（d3-r14-ui
// 实测教训：扁平形状旧镜像全树被拒，DOM 空白）。

import type { WoolGuiComponent } from "./host-contract.ts";
import type { WoolAccountStatus } from "../account-status.ts";

// ── 组件组装 helper（props 包装的唯一组装点；其余代码不手写 { type, props } 字面量）──

function ansiText(text: string): WoolGuiComponent {
	return { type: "ansi-text", props: { lines: text.split("\n") } };
}

function card(header: string, body: WoolGuiComponent[]): WoolGuiComponent {
	return { type: "card", props: { header, body } };
}

function actionBar(items: Array<{ id: string; label: string; disabled?: boolean; commandId?: string }>): WoolGuiComponent {
	return { type: "action-bar", props: { items } };
}

function statsLine(items: Array<{ label: string; value: string; severity?: "ok" | "warn" | "danger" }>): WoolGuiComponent {
	return { type: "stats-line", props: { items } };
}

/** 授权流程阶段（树状态机的显示输入）。 */
export type WoolAuthorizePhase =
	/** 初始：等待用户点动作按钮。 */
	| "ready"
	/** OAuth：授权页已打开，等待浏览器完成登录。 */
	| "waiting-browser"
	/** 提取/OAuth 执行中（进度）。 */
	| "running"
	/** 成功（附账号摘要）。 */
	| "success"
	/** 失败（附原因与恢复指引；可重试）。 */
	| "error";

/** OAuth 授权树的状态输入。 */
export interface WoolOAuthTreeState {
	phase: WoolAuthorizePhase;
	/** 展示名（家族 displayName）。 */
	displayName: string;
	/** 失败原因 / 阶段说明（error 阶段必填——失败显式上报）。 */
	message?: string;
	/** 成功摘要行（账号/额度/模型数）。 */
	summary?: Array<{ label: string; value: string }>;
}

/** OAuth 家族授权树（§3.1 WorkBuddy 三步样例）。 */
export function buildOAuthTree(state: WoolOAuthTreeState): WoolGuiComponent[] {
	const steps = ansiText([
		"① 准备授权          本机回调端口就绪",
		"② 在浏览器完成登录    使用与 " + state.displayName + " 相同的账号",
		"③ 保存凭据并拉取模型  凭据只写入本机模型配置",
	].join("\n"));
	if (state.phase === "ready") {
		return [
			card(state.displayName + " 授权", [steps]),
			actionBar([
				{ id: "wool-authorize-start", label: "去授权", commandId: "authorize" },
				{ id: "wool-cancel", label: "取消", commandId: "dismiss" },
			]),
		];
	}
	if (state.phase === "waiting-browser") {
		return [
			card(state.displayName + " 授权", [steps]),
			ansiText(state.message ?? "已打开授权页，请在浏览器完成登录后回到本页。"),
			actionBar([
				{ id: "wool-authorize-start", label: "重新打开授权页", commandId: "authorize" },
				{ id: "wool-cancel", label: "取消", commandId: "dismiss" },
			]),
		];
	}
	if (state.phase === "running") {
		return [
			card(state.displayName + " 授权", [steps]),
			ansiText(state.message ?? "正在保存凭据并拉取模型目录…"),
		];
	}
	if (state.phase === "success") {
		return [
			card(
				state.displayName + " 授权成功",
				state.summary !== undefined ? [statsLine(state.summary)] : [],
			),
			actionBar([{ id: "wool-done", label: "完成", commandId: "dismiss" }]),
		];
	}
	return [
		card(state.displayName + " 授权未完成", [ansiText(state.message ?? "授权失败。")]),
		actionBar([
			{ id: "wool-authorize-start", label: "重试", commandId: "authorize" },
			{ id: "wool-cancel", label: "取消", commandId: "dismiss" },
		]),
	];
}

/** 提取家族确认卡的状态输入（§3.1 Trae 确认样例：路径明示 + 去向声明）。 */
export interface WoolExtractTreeState {
	phase: WoolAuthorizePhase;
	displayName: string;
	/** 将读取的本机凭据文件路径（确认卡展示用；missing 时按「本机默认位置」表述）。 */
	credentialPath?: string;
	message?: string;
	summary?: Array<{ label: string; value: string }>;
}

/** 提取家族授权树（确认卡 → 进度 → 结果）。 */
export function buildExtractTree(state: WoolExtractTreeState): WoolGuiComponent[] {
	const pathLine = state.credentialPath ?? "本机默认位置（未检测到安装目录时显示此占位）";
	const confirmCard = card(state.displayName + " 凭据提取", [
		ansiText([
			`将读取 ${state.displayName} 在本机的登录凭据：`,
			`  ${pathLine}`,
			"凭据只写入本机模型配置，不上传到任何服务器。",
		].join("\n")),
	]);
	if (state.phase === "ready") {
		return [
			confirmCard,
			actionBar([
				{ id: "wool-extract-start", label: "读取本机登录态", commandId: "extract" },
				{ id: "wool-cancel", label: "取消", commandId: "dismiss" },
			]),
		];
	}
	if (state.phase === "running") {
		return [confirmCard, ansiText(state.message ?? "正在读取并解密…")];
	}
	if (state.phase === "success") {
		return [
			card(
				state.displayName + " 提取成功",
				state.summary !== undefined ? [statsLine(state.summary)] : [],
			),
			actionBar([{ id: "wool-done", label: "完成", commandId: "dismiss" }]),
		];
	}
	return [
		card(state.displayName + " 提取失败", [ansiText(state.message ?? "提取失败。")]),
		actionBar([
			{ id: "wool-extract-start", label: "重试", commandId: "extract" },
			{ id: "wool-cancel", label: "取消", commandId: "dismiss" },
		]),
	];
}

/** PAT 输入组件的 id（text-input 值回传的 componentId 判别键，D8）。 */
export const PAT_INPUT_COMPONENT_ID = "wool-pat-input";

/** PAT 次级入口树（提取失败后；text-input 值经 plugin.uiEvent 回传，插件持有最新值）。 */
export function buildPatTree(state: { displayName: string; patValue?: string; message?: string }): WoolGuiComponent[] {
	return [
		card(state.displayName + " 改用官方令牌（PAT）", [
			ansiText(state.message ?? "本机自动提取失败。可在官方设置页生成个人访问令牌（PAT）后粘贴继续。"),
			{
				type: "text-input",
				props: {
					id: PAT_INPUT_COMPONENT_ID,
					label: "个人访问令牌",
					placeholder: "pt-...",
					multiline: false,
					...(state.patValue !== undefined ? { value: state.patValue } : {}),
				},
			},
		]),
		actionBar([
			{ id: "wool-pat-submit", label: "提交 PAT", commandId: "submit-pat" },
			{ id: "wool-cancel", label: "取消", commandId: "dismiss" },
		]),
	];
}

/** 额度字段族（WoolAccountStatus["quota"] 别名——文案组装的输入形状）。 */
type WoolQuotaFields = NonNullable<WoolAccountStatus["quota"]>;

/** 额度一行文案（树 stats-line 与凭据状态行 message 共用素材——同一状态两种呈现不复制组装）。 */
function quotaLine(quota: WoolQuotaFields): string {
	const total = quota.total;
	const remaining = quota.remaining;
	const used = quota.used;
	return total !== undefined
		? `${formatNumber(remaining ?? Math.max(total - used, 0))} / ${formatNumber(total)} ${quota.unit}`
		: `${formatNumber(remaining ?? used)} ${quota.unit}`;
}

/** 已登录账号的一行摘要（昵称/额度；凭据状态行 message 的组装源）。 */
export function woolAccountStatusLine(s: WoolAccountStatus): string {
	const parts: string[] = [];
	if (s.nickname !== undefined && s.nickname.length > 0) {
		parts.push(s.nickname);
	}
	if (s.quota !== undefined) {
		parts.push(quotaLine(s.quota));
	}
	return parts.join(" · ");
}

/** 条目扩展区（provider.detail-extra）的显示输入。 */
export interface WoolDetailTreeState {
	displayName: string;
	/** 最近已知账号状态（未上报 = undefined——宿主区不显示失效标记，插件区显示接入引导）。 */
	status?: WoolAccountStatus;
	/** 该家族是否实装签到（workbuddy = true；qoder/trae = false——按钮缺席，不渲染死按钮）。 */
	checkinSupported: boolean;
	/** autoCheckin 开关当前值（仅 checkinSupported 时渲染开关按钮）。 */
	autoCheckin: boolean;
}

/** 条目扩展区树（§3.1 条目内容样例的插件区段；D5——状态未上报时不显示任何失效标记）。 */
export function buildDetailTree(state: WoolDetailTreeState): WoolGuiComponent[] {
	if (state.status === undefined || state.status.loggedIn !== true) {
		return [
			card(state.displayName, [
				ansiText("尚未接入或凭据未上报。展开条目将触发状态校验；如需接入请从「添加供应商 → 插件 Provider」进入。"),
			]),
		];
	}
	const s = state.status;
	const items: Array<{ label: string; value: string; severity?: "ok" | "warn" | "danger" }> = [];
	if (s.nickname !== undefined && s.nickname.length > 0) {
		items.push({ label: "账号", value: s.nickname });
	}
	if (s.quota !== undefined) {
		items.push({ label: "额度", value: quotaLine(s.quota) });
	}
	if (s.checkin?.doneToday === true) {
		items.push({ label: "签到", value: "今日已签", severity: "ok" });
	}
	const body: WoolGuiComponent[] = [statsLine(items)];
	if (state.checkinSupported) {
		body.push(actionBar([
			{
				id: "wool-checkin",
				label: s.checkin?.doneToday === true ? "今日已签" : "签到",
				disabled: s.checkin?.doneToday === true,
				commandId: s.checkin?.doneToday === true ? undefined : "checkin",
			},
			{
				id: "wool-auto-checkin",
				label: state.autoCheckin ? "每日自动签到：开" : "每日自动签到：关",
				commandId: "toggle-auto-checkin",
			},
		]));
	}
	return [card(state.displayName, body)];
}

function formatNumber(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
