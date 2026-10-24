// checkin-settings.test.ts — 每日签到设置契约与提醒时点计算（D6 迁移件）。

import { describe, expect, it } from "vitest";

import {
	DAILY_CHECKIN_REMINDER_HOUR,
	msUntilNextDailyCheckin,
	readCheckinSettings,
	WOOL_CHECKIN_SETTINGS_KEY,
} from "../checkin-settings.ts";

describe("readCheckinSettings（读侧不信任存储内容）", () => {
	it("合法形状原样收窄", () => {
		expect(readCheckinSettings({ autoCheckin: true })).toEqual({ autoCheckin: true });
		expect(readCheckinSettings({ autoCheckin: false })).toEqual({ autoCheckin: false });
	});

	it("坏形状/缺省/非对象 → 默认关（D5 风控裁决：自动签到须用户显式开启）", () => {
		expect(readCheckinSettings(undefined)).toEqual({ autoCheckin: false });
		expect(readCheckinSettings(null)).toEqual({ autoCheckin: false });
		expect(readCheckinSettings("true")).toEqual({ autoCheckin: false });
		expect(readCheckinSettings([])).toEqual({ autoCheckin: false });
		expect(readCheckinSettings({ autoCheckin: "yes" })).toEqual({ autoCheckin: false });
		expect(readCheckinSettings({})).toEqual({ autoCheckin: false });
	});

	it("settings 键为家族单键字面量（宿主按插件隔离存储空间）", () => {
		expect(WOOL_CHECKIN_SETTINGS_KEY).toBe("checkin-settings");
	});
});

describe("msUntilNextDailyCheckin（本地时 09:00 到点）", () => {
	it("当日未到点 → 距今日 09:00", () => {
		const now = new Date(2026, 0, 15, 7, 30, 0, 0);
		const delta = msUntilNextDailyCheckin(now);
		expect(delta).toBe(90 * 60 * 1000);
	});

	it("当日已过点 → 次日 09:00", () => {
		const now = new Date(2026, 0, 15, 10, 0, 0, 0);
		const delta = msUntilNextDailyCheckin(now);
		expect(delta).toBe(23 * 60 * 60 * 1000);
	});

	it("整点边界（09:00:00）→ 次日（当日时点已到）", () => {
		const now = new Date(2026, 0, 15, DAILY_CHECKIN_REMINDER_HOUR, 0, 0, 0);
		expect(msUntilNextDailyCheckin(now)).toBe(24 * 60 * 60 * 1000);
	});

	it("返回值恒为正（setTimeout 语义）", () => {
		const now = new Date(2026, 0, 15, 8, 59, 59, 999);
		expect(msUntilNextDailyCheckin(now)).toBeGreaterThan(0);
	});
});
