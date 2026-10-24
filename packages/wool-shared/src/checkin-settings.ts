// checkin-settings.ts — 每日签到设置契约与提醒时点计算（设计 D6 迁移件）。
//
// 职责（wool-manager 拆解后随迁插件进程的三包共用件）：
// ① autoCheckin 开关的 storage 键与形状契约（开关存插件 storage——非凭据，设计 D6）；
// ② 每日提醒时点计算（原 wool-manager msUntilNextDailyCheckin 语义迁移：本地时 09:00，
//    已过今日时点 = 明日同时）。
//
// 定时器纪律（产品功能定时白名单形态，AGENTS.md 时间平抑红线豁免项）：插件激活时重建，
// 「进程不在则错过、次日到点再来、当日手动签到入口全天可用」语义与宿主时代一致；
// 错过的时点不补（无定时补偿）。到期编排：autoCheckin 开 = 自动执行签到；关（默认）=
// 拉一次账号状态上报（「今日未签到」提醒的新鲜数据载体）。

/** 插件 storage 中签到设置键的形状（family 维度单键——每插件只管自己的家族）。 */
export interface WoolCheckinSettings {
	/** true = 到点自动执行签到；缺省 false（默认关——D5 风控裁决：自动签到须用户显式开启）。 */
	autoCheckin: boolean;
}

/** 插件 storage 的 settings 键名（三包同字面，宿主按插件隔离存储空间）。 */
export const WOOL_CHECKIN_SETTINGS_KEY = "checkin-settings";

/** 运行时守卫：storage 读侧收窄（读侧不信任存储内容；坏形状回缺省值）。 */
export function readCheckinSettings(value: unknown): WoolCheckinSettings {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		const record = value as Record<string, unknown>;
		if (typeof record.autoCheckin === "boolean") {
			return { autoCheckin: record.autoCheckin };
		}
	}
	return { autoCheckin: false };
}

/** 每日提醒时点（本地时 09:00——签到额度按日刷新，上午时点覆盖「当天首次打开工作台」
 * 主流形态；时点只影响提醒新鲜度，不改变签到可用性）。 */
export const DAILY_CHECKIN_REMINDER_HOUR = 9;

/** 到下一个提醒时点（本地时 09:00）的毫秒数；已过今日时点 = 明日同时。 */
export function msUntilNextDailyCheckin(now: Date = new Date(), hour = DAILY_CHECKIN_REMINDER_HOUR): number {
	const next = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate() + (now.getHours() >= hour ? 1 : 0),
		hour,
	);
	return Math.max(next.getTime() - now.getTime(), 1);
}
