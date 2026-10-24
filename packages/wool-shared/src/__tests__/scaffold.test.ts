// scaffold.test.ts — defineWoolExtension 接线（瘦身后形态，设计 D6/D7）：
// - provider 注册不声明 models（目录唯一数据源 = models.json 条目；声明会替换为空表）；
// - 不定义 refreshModels、不注册管理命令（管理动作已迁 plugin-wool-<family>）；
// - streamSimple 骨架分发与凭据双通道优先级。

import type { ExtensionAPI, ExtensionContext, ProviderConfig } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import { defineWoolExtension, type WoolFamilyExtensionDefinition } from "../scaffold.ts";
import { collectAssistantEvents, expectErrorOutcome, expectTextOutcome, assertConformantSequence } from "../testing/harness.ts";

type SessionStartHandler = (event: unknown, ctx: ExtensionContext) => void;

function mockPi() {
	const providers = new Map<string, ProviderConfig>();
	const commands: Array<{ name: string; options: { handler: (args: string) => Promise<void> } }> = [];
	const sessionStartHandlers: SessionStartHandler[] = [];
	const pi = {
		registerProvider: (nameOrProvider: string | { id: string }, config?: ProviderConfig) => {
			if (typeof nameOrProvider === "string" && config !== undefined) {
				providers.set(nameOrProvider, config);
			}
		},
		registerCommand: (name: string, options: { handler: (args: string) => Promise<void> }) => {
			commands.push({ name, options });
		},
		on: (event: string, handler: SessionStartHandler) => {
			if (event === "session_start") {
				sessionStartHandlers.push(handler);
			}
			return () => {};
		},
	} as unknown as ExtensionAPI;
	return { pi, providers, commands, sessionStartHandlers };
}

function echoDefinition(overrides: Partial<WoolFamilyExtensionDefinition> = {}): WoolFamilyExtensionDefinition {
	return {
		familyId: "qoder",
		displayName: "Wool Qoder",
		api: "wool-qoder",
		stream: async (request) => {
			request.driver.open();
			request.driver.text("echo");
			return { usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 } };
		},
		...overrides,
	};
}

describe("defineWoolExtension 接线（瘦身形态）", () => {
	it("按 wool-<family> 注册 provider；api/name/streamSimple 透传", () => {
		const { pi, providers } = mockPi();
		defineWoolExtension(echoDefinition())(pi);
		const config = providers.get("wool-qoder");
		expect(config).toBeDefined();
		expect(config?.api).toBe("wool-qoder");
		expect(config?.name).toBe("Wool Qoder");
		expect(config?.streamSimple).toBeTypeOf("function");
	});

	it("不声明 models（undefined）：pi composer applyExtension 保留 models.json 条目目录", () => {
		const { pi, providers } = mockPi();
		defineWoolExtension(echoDefinition())(pi);
		// 声明空数组会把条目目录替换为空表（0 模型）——必须是 undefined。
		expect(providers.get("wool-qoder")?.models).toBeUndefined();
	});

	it("不定义 refreshModels（零上游拉取、零宿主目录缓存写入）", () => {
		const { pi, providers } = mockPi();
		defineWoolExtension(echoDefinition())(pi);
		expect(providers.get("wool-qoder")?.refreshModels).toBeUndefined();
	});

	it("不注册管理命令（管理动作已迁 plugin-wool-<family>）", () => {
		const { pi, commands } = mockPi();
		defineWoolExtension(echoDefinition())(pi);
		expect(commands).toHaveLength(0);
	});

	it("oauth 钩子原样透传（login/refreshToken/getApiKey）", () => {
		const { pi, providers } = mockPi();
		defineWoolExtension(
			echoDefinition({
				oauth: {
					name: "Wool Qoder",
					login: async () => ({ type: "oauth", access: "a", refresh: "r", expires: 0 }),
					refreshToken: async (credentials) => credentials,
					getApiKey: () => "key",
				},
			}),
		)(pi);
		const oauth = providers.get("wool-qoder")?.oauth as Record<string, unknown> | undefined;
		expect(typeof oauth?.login).toBe("function");
		expect(typeof oauth?.refreshToken).toBe("function");
		expect(typeof oauth?.getApiKey).toBe("function");
	});

	describe("streamSimple", () => {
		it("经骨架执行家族 stream：事件流纪律成立", async () => {
			const { pi, providers, sessionStartHandlers } = mockPi();
			defineWoolExtension(echoDefinition())(pi);
			for (const handler of sessionStartHandlers) {
				handler({}, {
					modelRegistry: {
						getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "tok" }),
					},
				} as unknown as ExtensionContext);
			}
			const config = providers.get("wool-qoder");
			const model = { id: "m", api: "wool-qoder", provider: "wool-qoder" } as unknown as Parameters<NonNullable<ProviderConfig["streamSimple"]>>[0];
			const context = { messages: [{ role: "user", content: "hi", timestamp: Date.now() }] } as unknown as Parameters<NonNullable<ProviderConfig["streamSimple"]>>[1];
			const stream = config?.streamSimple?.(model, context, undefined);
			expect(stream).toBeDefined();
			const events = await collectAssistantEvents(stream!);
			assertConformantSequence(events);
			expectTextOutcome(events, "echo");
		});

		it("session_start 未跑即调 streamSimple → fail-fast 拒绝（生命周期 bug 不静默）", () => {
			const { pi, providers } = mockPi();
			defineWoolExtension(echoDefinition())(pi);
			const config = providers.get("wool-qoder");
			const model = { id: "m", api: "wool-qoder", provider: "wool-qoder" } as unknown as Parameters<NonNullable<ProviderConfig["streamSimple"]>>[0];
			const context = { messages: [] } as unknown as Parameters<NonNullable<ProviderConfig["streamSimple"]>>[1];
			expect(() => config?.streamSimple?.(model, context, undefined)).toThrow(/before session_start/);
		});

		describe("凭据优先级（D2 双通道：options.apiKey > oauth 钩子 > 皆无报错）", () => {
			/** 组装一个记录 resolvedAuth 的家族 stream + 已捕获 registry 的 streamSimple 环境。 */
			async function setupStream(
				registryResolve: () => Promise<{ ok: boolean; apiKey?: string; headers?: Record<string, string>; error?: string }>,
			) {
				const { pi, providers, sessionStartHandlers } = mockPi();
				let seenAuth: unknown;
				let registryCalls = 0;
				defineWoolExtension(
					echoDefinition({
						stream: async (request) => {
							seenAuth = request.resolvedAuth;
							if (!request.resolvedAuth.ok) {
								throw new Error(request.resolvedAuth.error);
							}
							request.driver.open();
							request.driver.text("echo");
							return { usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 } };
						},
					}),
				)(pi);
				for (const handler of sessionStartHandlers) {
					handler({}, {
						modelRegistry: {
							getApiKeyAndHeaders: async () => {
								registryCalls += 1;
								return registryResolve();
							},
						},
					} as unknown as ExtensionContext);
				}
				const config = providers.get("wool-qoder");
				const model = {
					id: "m",
					api: "wool-qoder",
					provider: "wool-qoder",
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				} as unknown as Parameters<NonNullable<ProviderConfig["streamSimple"]>>[0];
				const context = { messages: [{ role: "user", content: "hi", timestamp: Date.now() }] } as unknown as Parameters<NonNullable<ProviderConfig["streamSimple"]>>[1];
				return {
					run: (options?: { apiKey?: string }) => {
						const stream = config?.streamSimple?.(model, context, options);
						if (stream === undefined) {
							throw new Error("streamSimple returned undefined");
						}
						return collectAssistantEvents(stream);
					},
					get seenAuth(): unknown {
						return seenAuth;
					},
					get registryCalls(): number {
						return registryCalls;
					},
				};
			}

			it("options.apiKey 在场即采信（registry 不被调，不做 oauth 刷新尝试）", async () => {
				const env = await setupStream(async () => ({ ok: true, apiKey: "registry-key" }));
				const events = await env.run({ apiKey: "models-json-key" });
				assertConformantSequence(events);
				expectTextOutcome(events, "echo");
				expect(env.seenAuth).toEqual({ ok: true, apiKey: "models-json-key" });
				expect(env.registryCalls).toBe(0);
			});

			it("options.apiKey 缺席 → registry oauth 凭据（apiKey 透传家族）", async () => {
				const env = await setupStream(async () => ({ ok: true, apiKey: "oauth-hook-key" }));
				const events = await env.run(undefined);
				assertConformantSequence(events);
				expectTextOutcome(events, "echo");
				expect(env.seenAuth).toEqual({ ok: true, apiKey: "oauth-hook-key" });
				expect(env.registryCalls).toBe(1);
			});

			it("双通道皆无（registry ok 但无 apiKey）→ error 终态带统一「凭据未配置」", async () => {
				const env = await setupStream(async () => ({ ok: true, headers: {} }));
				const events = await env.run(undefined);
				expectErrorOutcome(events, "凭据未配置：经 taiji 插件接入或在 pi 内 /login");
				const seen = env.seenAuth as { ok: boolean; error: string };
				expect(seen.ok).toBe(false);
				expect(seen.error).toContain("凭据未配置");
			});

			it("registry 解析失败（ok:false，如刷新链失败）→ 保留原错误（比统一消息可诊断）", async () => {
				const env = await setupStream(async () => ({ ok: false, error: "oauth refresh failed: 502" }));
				const events = await env.run(undefined);
				expectErrorOutcome(events, "oauth refresh failed: 502");
			});
		});
	});
});
