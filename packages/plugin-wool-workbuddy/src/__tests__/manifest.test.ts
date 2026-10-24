// manifest.test.ts — 插件包 manifest 契约（验收条款③：namespace 与包名推导值一致）。
//
// namespace 是 providers.write / providers.delete / providers.credential 的边界：
// 声明值必须等于「包名去 npm scope、去 plugin- 前缀」的推导值（宿主安装期拒绝
// NAMESPACE_MISMATCH）。这里读 package.json 实物断言，防手改漂移。

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { deriveNamespace, validateNamespaceBinding } from "@zhushanwen/pi-wool-shared/plugin";

interface PluginPackageJson {
	name: string;
	version: string;
	main: string;
	taijiPlugin: {
		manifestVersion: number;
		main: string;
		activationEvents: string[];
		capabilities: string[];
		readPaths?: string[];
		namespace?: string;
	};
}

const PKG_DIR = join(import.meta.dirname, "..", "..");
const pkg = JSON.parse(readFileSync(join(PKG_DIR, "package.json"), "utf8")) as PluginPackageJson;

describe("@zhushanwen/plugin-wool-workbuddy manifest", () => {
	it("包名 / manifestVersion / 入口文件存在", () => {
		expect(pkg.name).toBe("@zhushanwen/plugin-wool-workbuddy");
		expect(pkg.taijiPlugin.manifestVersion).toBe(1);
		expect(pkg.main).toBe(pkg.taijiPlugin.main);
		expect(existsSync(join(PKG_DIR, pkg.taijiPlugin.main))).toBe(true);
		expect(pkg.taijiPlugin.activationEvents.length).toBeGreaterThan(0);
	});

	it("namespace = deriveNamespace(包名)（验收条款③）", () => {
		expect(deriveNamespace(pkg.name)).toBe("wool-workbuddy");
		expect(pkg.taijiPlugin.namespace).toBe("wool-workbuddy");
		expect(validateNamespaceBinding(pkg.name, pkg.taijiPlugin.namespace ?? "")).toEqual({
			ok: true,
			namespace: "wool-workbuddy",
		});
	});

	it("声明 network.http（providers.credential 明文回读的能力前提，D4）", () => {
		expect(pkg.taijiPlugin.capabilities).toContain("network.http");
	});

	it("OAuth 家族不声明 fs.read-user-data（不读本机凭据文件）", () => {
		expect(pkg.taijiPlugin.capabilities).not.toContain("fs.read-user-data");
	});

	it("写入的 providerId 落在命名空间内（ns 或 ns- 前缀）", () => {
		const providerIds = ["wool-workbuddy"];
		for (const providerId of providerIds) {
			expect(providerId === pkg.taijiPlugin.namespace || providerId.startsWith(`${pkg.taijiPlugin.namespace}-`)).toBe(true);
		}
	});
});
