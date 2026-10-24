// index.test.ts — pi-wool-trae 扩展装配面（瘦身后形态，设计 D6/D7 验收条款④）。
//
// 断言：只注册 provider（api/baseUrl/streamSimple/oauth），不声明 models、不定义
// refreshModels（模型目录唯一数据源 = models.json 条目）、不注册管理命令、激活期零
// 网络请求、源码不含上游拉取/宿主目录缓存写入残留。

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import piWoolTrae, { FAMILY_ID, PROVIDER_ID } from "../index.ts";

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

describe("pi-wool-trae 装配（瘦身形态）", () => {
	it("词表：family=trae / provider=wool-trae", () => {
		expect(FAMILY_ID).toBe("trae");
		expect(PROVIDER_ID).toBe("wool-trae");
	});

	it("只注册 provider：api/baseUrl/streamSimple/oauth 三钩子在位", () => {
		const pi = fakePi();
		piWoolTrae(pi.api as never);
		expect(pi.providers).toHaveLength(1);
		const { name, config } = pi.providers[0]!;
		expect(name).toBe("wool-trae");
		expect(config.api).toBe("wool-trae");
		expect(config.baseUrl).toBe("https://trae-api-cn.mchost.guru");
		const oauth = config.oauth as Record<string, unknown>;
		expect(typeof oauth.login).toBe("function");
		expect(typeof oauth.refreshToken).toBe("function");
		expect(typeof oauth.getApiKey).toBe("function");
		expect(typeof config.streamSimple).toBe("function");
	});

	it("不声明 models（undefined）/ 不定义 refreshModels", () => {
		const pi = fakePi();
		piWoolTrae(pi.api as never);
		expect(pi.providers[0]!.config.models).toBeUndefined();
		expect(pi.providers[0]!.config.refreshModels).toBeUndefined();
	});

	it("不注册管理命令；激活期零网络请求", () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		const pi = fakePi();
		piWoolTrae(pi.api as never);
		expect(pi.commands).toHaveLength(0);
		expect(fetchSpy).not.toHaveBeenCalled();
		fetchSpy.mockRestore();
	});

	it("源码不含上游目录拉取/宿主目录缓存写入残留", () => {
		const source = readFileSync(join(import.meta.dirname, "..", "index.ts"), "utf8");
		for (const banned of ["refreshModels:", "fetchModels:", "fetchModels(", "fetchTraeCatalog(", "snapshotPath:", "persist:", "manageHandlers:", "registerCommand("]) {
			expect(source.includes(banned), `index.ts 不应再含 ${banned}`).toBe(false);
		}
	});
});
