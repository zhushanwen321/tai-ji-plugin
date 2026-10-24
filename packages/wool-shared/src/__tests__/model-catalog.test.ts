// model-catalog.test.ts — 包内快照承载（D6/D7 收敛后：模型目录唯一数据源 = models.json
// 条目；本模块只保留快照形状守卫与读取，WorkBuddy 元数据表消费）。
//
// 目录缓存 store / persist entry / 上游兜底语义随 scaffold 的 refreshModels 退役删除
// （D7 单源：上游目录的拉取与写回只发生在插件侧）。

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AnyModel } from "@earendil-works/pi-ai";
import { afterAll, describe, expect, it } from "vitest";

import { isValidSnapshot, readSnapshotFile } from "../model-catalog.ts";

function chatModel(id: string) {
	return {
		id,
		name: id,
		api: "wool-test",
		provider: "wool-test",
		baseUrl: "https://upstream.invalid",
		type: "chat" as const,
		reasoning: false,
		input: ["text"] as ("text" | "image")[],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 8192,
		maxTokens: 1024,
	};
}

const tmpDir = mkdtempSync(join(tmpdir(), "wool-snapshot-"));

afterAll(() => {
	rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
});

function writeSnapshot(name: string, content: string): string {
	const path = join(tmpDir, name);
	writeFileSync(path, content);
	return path;
}

describe("isValidSnapshot（读侧不信任外部格式）", () => {
	it("合法形状通过（models 为带 id/name/api 的对象数组）", () => {
		expect(isValidSnapshot({ family: "workbuddy", fetchedAt: 1, models: [chatModel("m1")] })).toBe(true);
	});

	it("非对象 / 缺 models / models 非数组 → false", () => {
		expect(isValidSnapshot(undefined)).toBe(false);
		expect(isValidSnapshot(null)).toBe(false);
		expect(isValidSnapshot("snapshot")).toBe(false);
		expect(isValidSnapshot({})).toBe(false);
		expect(isValidSnapshot({ models: "m1" })).toBe(false);
	});

	it("条目缺 id/name/api 任一 → false", () => {
		expect(isValidSnapshot({ models: [{ id: "m1", name: "M1" }] })).toBe(false);
		expect(isValidSnapshot({ models: [{ id: "m1", api: "wool-test" }] })).toBe(false);
		expect(isValidSnapshot({ models: [{ name: "M1", api: "wool-test" }] })).toBe(false);
		expect(isValidSnapshot({ models: [null] })).toBe(false);
	});
});

describe("readSnapshotFile（文件缺失/损坏不炸正常拉取链路）", () => {
	it("合法 JSON 快照 → 解析结果", () => {
		const path = writeSnapshot("valid.json", JSON.stringify({ family: "workbuddy", fetchedAt: 1, models: [chatModel("m1")] }));
		const snapshot = readSnapshotFile(path);
		expect(snapshot?.models.map((model) => model.id)).toEqual(["m1"]);
	});

	it("文件缺失 → undefined", () => {
		expect(readSnapshotFile(join(tmpDir, "missing.json"))).toBeUndefined();
	});

	it("非 JSON / 形状非法 → undefined", () => {
		expect(readSnapshotFile(writeSnapshot("broken.json", "{not json"))).toBeUndefined();
		expect(readSnapshotFile(writeSnapshot("invalid-shape.json", JSON.stringify({ models: [{ id: "m1" }] })))).toBeUndefined();
	});
});

describe("WorkBuddy 包内快照（元数据表实物，插件与 pi 扩展同源数据）", () => {
	const snapshotPath = join(import.meta.dirname, "..", "workbuddy", "snapshots", "workbuddy.json");

	it("文件可读、形状合法、17 模型含 hy3", () => {
		const snapshot = readSnapshotFile(snapshotPath);
		expect(snapshot).toBeDefined();
		expect(snapshot?.models.length).toBe(17);
		const ids = snapshot?.models.map((model) => model.id);
		expect(ids).toContain("hy3");
		expect(ids).toContain("deepseek-v4.1-flash");
		expect(ids).toContain("kimi-k2.8-preview");
	});

	it("快照模型为完整 chat Model（provider/api/baseUrl 齐备）", () => {
		const snapshot = readSnapshotFile(snapshotPath) as { models: AnyModel[] };
		for (const model of snapshot.models) {
			expect(model.provider).toBe("wool-workbuddy");
			expect(model.api).toBe("wool-workbuddy");
			expect(typeof model.contextWindow).toBe("number");
			expect(typeof model.maxTokens).toBe("number");
			expect(Array.isArray(model.input)).toBe(true);
		}
		const hy3 = snapshot.models.find((model) => model.id === "hy3");
		expect(hy3?.reasoning).toBe(true);
		expect(hy3?.input).toContain("image");
	});
});
