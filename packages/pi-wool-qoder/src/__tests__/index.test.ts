// index.test.ts — pi-wool-qoder 扩展装配面（瘦身后形态，设计 D6/D7 验收条款④）。
//
// 断言：只注册 provider（api/baseUrl/streamSimple/oauth），不声明 models、不定义
// refreshModels（模型目录唯一数据源 = models.json 条目）、不注册管理命令、激活期零
// 网络请求、源码不含上游拉取/宿主目录缓存写入残留。

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import piWoolQoder, { FAMILY_ID, PROVIDER_ID } from "../index.ts";

/** ExtensionAPI 最小替身（装配面断言；不跑真实 pi 生命周期）。 */
function fakePi() {
	const providers: Array<{ name: string; config: Record<string, unknown> }> = [];
	const commands: string[] = [];
	const events: string[] = [];
	return {
		providers,
		commands,
		events,
		api: {
			on: (event: string) => {
				events.push(event);
			},
			registerProvider: (name: string, config: Record<string, unknown>) => {
				providers.push({ name, config });
			},
			registerCommand: (name: string) => {
				commands.push(name);
			},
		},
	};
}

describe("pi-wool-qoder 装配（瘦身形态）", () => {
	it("词表：family=qoder / provider=wool-qoder", () => {
		expect(FAMILY_ID).toBe("qoder");
		expect(PROVIDER_ID).toBe("wool-qoder");
	});

	it("只注册 provider：api/baseUrl/streamSimple/oauth 三钩子在位", () => {
		const pi = fakePi();
		piWoolQoder(pi.api as never);
		expect(pi.providers).toHaveLength(1);
		const { name, config } = pi.providers[0]!;
		expect(name).toBe("wool-qoder");
		expect(config.api).toBe("wool-qoder");
		expect(config.baseUrl).toContain("gateway.qoder.com.cn");
		const oauth = config.oauth as Record<string, unknown>;
		expect(typeof oauth.login).toBe("function");
		expect(typeof oauth.refreshToken).toBe("function");
		expect(typeof oauth.getApiKey).toBe("function");
		expect(typeof config.streamSimple).toBe("function");
	});

	it("不声明 models（undefined）：目录来自 models.json 条目，声明空表会替换成 0 模型", () => {
		const pi = fakePi();
		piWoolQoder(pi.api as never);
		expect(pi.providers[0]!.config.models).toBeUndefined();
	});

	it("不定义 refreshModels（零上游拉取、零宿主目录缓存写入）", () => {
		const pi = fakePi();
		piWoolQoder(pi.api as never);
		expect(pi.providers[0]!.config.refreshModels).toBeUndefined();
	});

	it("不注册管理命令（管理动作已迁 plugin-wool-qoder）", () => {
		const pi = fakePi();
		piWoolQoder(pi.api as never);
		expect(pi.commands).toHaveLength(0);
	});

	it("激活期零网络请求（fetch 不被调用）", () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		const pi = fakePi();
		piWoolQoder(pi.api as never);
		expect(fetchSpy).not.toHaveBeenCalled();
		fetchSpy.mockRestore();
	});

	it("源码不含上游目录拉取/宿主目录缓存写入残留", () => {
		const source = readFileSync(join(import.meta.dirname, "..", "index.ts"), "utf8");
		for (const banned of ["refreshModels:", "fetchModels:", "fetchModels(", "fetchModelCatalog(", "snapshotPath:", "persist:", "manageHandlers:", "registerCommand("]) {
			expect(source.includes(banned), `index.ts 不应再含 ${banned}`).toBe(false);
		}
	});
});
