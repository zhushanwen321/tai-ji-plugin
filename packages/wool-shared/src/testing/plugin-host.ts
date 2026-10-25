// plugin-host.ts — createWoolPlugin 的单测替身宿主（结构化消费面，不模拟宿主内部）。
//
// 只实现 wool-shared 的 host-contract 契约子集：方法注册表、视图推送记录、providers
// 写/读回执、业务事件记录、storage 内存表与 uiEvent 注入口。真机集成（插件 fork、
// capability 放行、宿主 RPC 线）由 P-wool-runtime / P-wool-e2e 承接，不在单测范围。

import type {
	WoolGuiComponent,
	WoolPluginContext,
	WoolPluginHostApi,
	WoolPluginUiEvent,
	WoolProviderWriteParams,
	WoolResolvedCredential,
} from "../plugin/host-contract.ts";

export interface FakeWoolPluginHost {
	context: WoolPluginContext;
	writes: WoolProviderWriteParams[];
	trees: Array<{ viewId: string; tree: WoolGuiComponent[]; mountId: string }>;
	events: Array<{ channel: string; payload: unknown }>;
	openedUrls: string[];
	storage: Map<string, unknown>;
	commands: Map<string, (args?: unknown) => unknown>;
	credentials: Map<string, WoolResolvedCredential>;
	/** plugin.uiEvent 注入口（D8 值回传）。 */
	emitUiEvent(event: WoolPluginUiEvent): void;
	/** plugin.invoke 调用口（与宿主 commands 注册表同键）。 */
	invoke<T = unknown>(method: string, args?: unknown): Promise<T>;
}

export function createFakeWoolPluginHost(options: {
	pluginId?: string;
	storage?: Record<string, unknown>;
	credentials?: Record<string, WoolResolvedCredential>;
} = {}): FakeWoolPluginHost {
	const writes: WoolProviderWriteParams[] = [];
	const trees: FakeWoolPluginHost["trees"] = [];
	const events: FakeWoolPluginHost["events"] = [];
	const openedUrls: string[] = [];
	const storage = new Map<string, unknown>(Object.entries(options.storage ?? {}));
	const commands = new Map<string, (args?: unknown) => unknown>();
	const credentials = new Map<string, WoolResolvedCredential>(Object.entries(options.credentials ?? {}));
	const uiEventHandlers: Array<(event: WoolPluginUiEvent) => void> = [];

	const api: WoolPluginHostApi = {
		storage: {
			global: {
				get: async <T>(key: string, defaultValue?: T): Promise<T | undefined> => {
					const value = storage.get(key);
					return value === undefined ? defaultValue : (value as T);
				},
				set: async (key: string, value: unknown): Promise<void> => {
					storage.set(key, value);
				},
			},
		},
		commands: {
			register: async (definition, handler) => {
				commands.set(definition.id, handler);
				return { dispose: () => undefined };
			},
		},
		views: {
			update: async (viewId, tree, scope) => {
				trees.push({ viewId, tree, mountId: scope.mountId });
			},
		},
		ui: {
			openUrl: async (url) => {
				openedUrls.push(url);
				return { opened: true };
			},
			onUiEvent: (handler) => {
				uiEventHandlers.push(handler);
				return { dispose: () => undefined };
			},
		},
		providers: {
			write: async (params) => {
				writes.push(params);
				credentials.set(params.providerId, {
					providerId: params.providerId,
					key: params.apiKey,
					source: "models.json",
					kind: "api_key",
				});
				return { written: true, providerId: params.providerId };
			},
			credential: async ({ providerId }) => {
				const resolved = credentials.get(providerId);
				if (resolved === undefined) {
					throw new Error(`PROVIDER_CREDENTIAL_MISSING: no credential entry found for '${providerId}'`);
				}
				return resolved;
			},
		},
		events: {
			emit: async (channel, payload) => {
				events.push({ channel, payload });
			},
		},
	};

	const context: WoolPluginContext = {
		pluginId: options.pluginId ?? "@zhushanwen/plugin-wool-test",
		api,
		subscriptions: [],
	};

	return {
		context,
		writes,
		trees,
		events,
		openedUrls,
		storage,
		commands,
		credentials,
		emitUiEvent: (event) => {
			for (const handler of uiEventHandlers) {
				handler(event);
			}
		},
		invoke: async <T>(method: string, args?: unknown): Promise<T> => {
			const handler = commands.get(method);
			if (handler === undefined) {
				throw new Error(`plugin method '${method}' is not registered`);
			}
			return (await handler(args)) as T;
		},
	};
}

/** 树遍历：指定 type 的全部节点（结构断言的通用工具；children 路径按 props 包装形状）。 */
export function findGuiNodes(tree: WoolGuiComponent[], type: WoolGuiComponent["type"]): WoolGuiComponent[] {
	const out: WoolGuiComponent[] = [];
	const walk = (nodes: WoolGuiComponent[]): void => {
		for (const node of nodes) {
			if (node.type === type) {
				out.push(node);
			}
			if (node.type === "group") {
				walk(node.props.children);
			}
			if (node.type === "card") {
				walk(node.props.body);
			}
		}
	};
	walk(tree);
	return out;
}

/** 树内全部 action-bar 按钮的 commandId（按钮 → 插件方法接线断言）。 */
export function guiCommandIds(tree: WoolGuiComponent[]): string[] {
	return findGuiNodes(tree, "action-bar").flatMap((node) =>
		node.type === "action-bar" ? node.props.items.map((item) => item.commandId ?? "") : [],
	);
}

/** 树内全部 ansi-text 文本拼接（文案断言用；props.lines 按行拼接）。 */
export function guiText(tree: WoolGuiComponent[]): string {
	return findGuiNodes(tree, "ansi-text")
		.map((node) => (node.type === "ansi-text" ? node.props.lines.join("\n") : ""))
		.join("\n");
}
