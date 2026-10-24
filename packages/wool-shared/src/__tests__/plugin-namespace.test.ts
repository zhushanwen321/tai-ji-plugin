// plugin-namespace.test.ts — 命名空间推导与绑定校验（设计 D4；宿主 SSOT 的本仓镜像件）。
//
// 验收条款③：插件包 manifest namespace 与包名推导值一致。逐包断言在
// plugin-wool-<family>/src/__tests__/manifest.test.ts（读各自 package.json 实物）；
// 本文件锁定推导规则本身（与宿主 packages/shared/src/plugin-namespace.ts 同规则）。

import { describe, expect, it } from "vitest";

import { deriveNamespace, NAMESPACE_MISMATCH, validateNamespaceBinding } from "../plugin/namespace.ts";

describe("deriveNamespace（去 npm scope、去 plugin- 前缀）", () => {
	it("三家插件包名 → wool-<family>（对话链硬依赖的 providerId 前缀）", () => {
		expect(deriveNamespace("@zhushanwen/plugin-wool-qoder")).toBe("wool-qoder");
		expect(deriveNamespace("@zhushanwen/plugin-wool-trae")).toBe("wool-trae");
		expect(deriveNamespace("@zhushanwen/plugin-wool-workbuddy")).toBe("wool-workbuddy");
	});

	it("无 scope / 非 plugin- 前缀 / 重复前缀", () => {
		expect(deriveNamespace("plugin-foo")).toBe("foo");
		expect(deriveNamespace("@scope/foo")).toBe("foo");
		expect(deriveNamespace("plugin-plugin-x")).toBe("plugin-x");
		expect(deriveNamespace("plugins-x")).toBe("plugins-x");
	});

	it("异常包名返回空串（调用方按无效处置）", () => {
		expect(deriveNamespace("")).toBe("");
		expect(deriveNamespace("@scope/")).toBe("");
		expect(deriveNamespace("@scope")).toBe("");
	});
});

describe("validateNamespaceBinding（安装期规则的本地断言形态）", () => {
	it("声明值 = 推导值 → ok", () => {
		expect(validateNamespaceBinding("@zhushanwen/plugin-wool-workbuddy", "wool-workbuddy")).toEqual({
			ok: true,
			namespace: "wool-workbuddy",
		});
	});

	it("声明值 ≠ 推导值 → NAMESPACE_MISMATCH（含声明值与推导值供诊断）", () => {
		expect(validateNamespaceBinding("@zhushanwen/plugin-wool-workbuddy", "wool-qoder")).toEqual({
			ok: false,
			code: NAMESPACE_MISMATCH,
			declared: "wool-qoder",
			derived: "wool-workbuddy",
		});
	});

	it("空声明 / 包名形态异常 → 拒绝（空 namespace 无法构成 providerId 前缀边界）", () => {
		expect(validateNamespaceBinding("@zhushanwen/plugin-wool-trae", "").ok).toBe(false);
		expect(validateNamespaceBinding("@scope/", "scope").ok).toBe(false);
	});
});
