// plugin-runtime-isolation.test.ts — 插件进程的依赖隔离（设计 D6 共享内核的运行位置
// 约束：插件 fork 内无 pi 运行时）。
//
// 机器检查：从插件侧入口（plugin/ 子路径 + 三家族 barrel）出发沿相对 import 闭包，
// 断言闭包内不存在对 @earendil-works/* 的值导入（type-only import 允许——编译期擦除）。
// 断链风险是真实的：根 barrel 经 scaffold / stream-adapter 对 pi-ai 有值依赖，插件
// 若误 import 根 barrel 会在真机 fork 内加载失败（P-wool-runtime 的前置条件）。

import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SRC_ROOT = join(import.meta.dirname, "..");

/** 从入口文件起，沿相对 import 收集闭包（.ts 文件绝对路径集）。 */
function importClosure(entries: string[]): Set<string> {
	const seen = new Set<string>();
	const queue = [...entries];
	while (queue.length > 0) {
		const file = queue.pop()!;
		if (seen.has(file) || !existsSync(file)) {
			continue;
		}
		seen.add(file);
		const source = readFileSync(file, "utf8");
		for (const match of source.matchAll(/from\s+"(\.[^"]+)"/g)) {
			const specifier = match[1]!;
			queue.push(resolve(dirname(file), specifier));
		}
	}
	return seen;
}

describe("插件侧 import 闭包零 pi 值依赖（D6 运行位置约束）", () => {
	const closure = importClosure([
		join(SRC_ROOT, "plugin", "index.ts"),
		join(SRC_ROOT, "qoder", "index.ts"),
		join(SRC_ROOT, "trae", "index.ts"),
		join(SRC_ROOT, "workbuddy", "index.ts"),
	]);

	it("闭包覆盖预期管理模块（防止空闭包假绿）", () => {
		const names = [...closure].map((file) => file.slice(SRC_ROOT.length + 1));
		expect(names).toContain("plugin/plugin-kit.ts");
		expect(names).toContain("qoder/auth.ts");
		expect(names).toContain("trae/auth.ts");
		expect(names).toContain("workbuddy/oauth.ts");
	});

	it("闭包内 @earendil-works/* 只允许 type-only 导入", () => {
		const violations: string[] = [];
		for (const file of closure) {
			const source = readFileSync(file, "utf8");
			// 多行 import 一并匹配（[^;] 跨行），按语句首的 type 关键字判定。
			for (const match of source.matchAll(/import\s+(type\s+)?[^;]*?from\s+"@earendil-works\/[^"]*"/g)) {
				if (match[1] === undefined) {
					violations.push(`${file.slice(SRC_ROOT.length + 1)}: ${match[0].split("\n")[0]}`);
				}
			}
		}
		expect(violations).toEqual([]);
	});

	it("闭包内不含 pi 扩展侧件（scaffold / stream-adapter / sse）——根 barrel 才导出它们", () => {
		const names = [...closure].map((file) => file.slice(SRC_ROOT.length + 1));
		expect(names).not.toContain("scaffold.ts");
		expect(names).not.toContain("stream-adapter.ts");
	});
});
