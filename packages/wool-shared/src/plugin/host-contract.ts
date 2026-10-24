// host-contract.ts — 羊毛插件消费的宿主 API 契约（结构声明，消费方自持形状）。
//
// 为什么本仓自带类型副本而不 import 主仓 @taiji/plugin-sdk：SDK 是主仓 private
// workspace 包（无 npm 发布链），独立仓发包不可依赖；插件进程的 api 对象由宿主
// bootstrap 构造注入，插件按结构消费（TS structural typing）——本文件只声明羊毛
// 插件实际消费的形状子集。GuiComponent 段同理：协议唯一定义源 = 主仓
// @zhushanwen/extension-protocol（src/core/types.ts），npm 发布版滞后于 text-input
// 新原语，故镜像本插件消费的六个原语；形状漂移由真机集成验收（P-wool-e2e）兜底。
//
// providers 域（providers.write / providers.credential）与 events.emit（plugin.event
// 上报）的宿主侧落点 = provider-plugin-access D4 / D9（u-protocol 交付）。羊毛插件
// activate 时对必需域做存在性校验，缺域 fail-fast（错误消息指向宿主版本要求）——
// 显式失败优于静默失效。

// ── GuiComponent 协议段（最小镜像；SSOT = @zhushanwen/extension-protocol core/types）──

/** GuiComponent 联合的判别字段形态（与协议 PROTOCOL_VERSION 无关——组件形状子集）。 */
export type WoolGuiComponent =
	| { type: "group"; children: WoolGuiComponent[] }
	| {
			type: "card";
			title?: string;
			children?: WoolGuiComponent[];
			/** 键值行（宿主渲染为 label/value 对齐行）。 */
			rows?: Array<{ label: string; value: string }>;
	  }
	| { type: "ansi-text"; text: string }
	| {
			type: "stats-line";
			items: Array<{ label: string; value: string; severity?: "ok" | "warn" | "danger" }>;
	  }
	| {
			type: "action-bar";
			items: Array<{
				id: string;
				label: string;
				kind?: "danger";
				disabled?: boolean;
				commandId?: string;
				args?: Record<string, string | number | boolean>;
			}>;
	  }
	| {
			type: "text-input";
			id: string;
			label?: string;
			placeholder?: string;
			value?: string;
			multiline?: boolean;
	  };

// ── 宿主 API 域（消费形状子集）────────────────────────────────

/** 键值存储（PluginStateStorage 的消费子集；autoCheckin 开关落 global storage）。 */
export interface WoolPluginStorage {
	get<T>(key: string): Promise<T | undefined>;
	get<T>(key: string, defaultValue: T): Promise<T>;
	set(key: string, value: unknown): Promise<void>;
}

/** 业务方法注册（Phase2AgentAPI.commands.register 的消费子集）：plugin.invoke 的
 * 方法注册通道——宿主按 `${pluginId}:${id}` 复合键路由 renderer 的 invoke 调用。 */
export interface WoolPluginCommands {
	register(
		definition: { id: string; title?: string; timeoutMs?: number },
		handler: (args?: unknown) => unknown | Promise<unknown>,
	): Promise<unknown>;
}

/** 视图推送（views.update 消费子集）：羊毛插件只推全局域挂载位（Provider 页无会话归属，
 * scope 分区键自动并入插件 id——多插件同挂载位互不覆盖）。 */
export interface WoolPluginViews {
	update(viewId: string, tree: WoolGuiComponent[], scope: { mountId: string }): Promise<void>;
}

/** 输入组件值回传事件（D8 plugin.uiEvent：`{ viewId, componentId, event, value }`）。 */
export interface WoolPluginUiEvent {
	viewId: string;
	componentId: string;
	event: string;
	value: unknown;
}

/** 授权页打开（plugin.ui.openUrl，D9）：宿主侧 http(s) scheme 白名单校验。
 * 输入值回传（plugin.uiEvent，D8）经 onUiEvent 通知送达（D8 的「插件侧始终持有最新值」）。 */
export interface WoolPluginUi {
	openUrl(url: string): Promise<{ opened: boolean }>;
	onUiEvent?(handler: (event: WoolPluginUiEvent) => void): { dispose(): void } | void;
}

/** providers.write 载荷（D4）：凭据与模型目录经同一写策略链落 models.json 条目。
 * models 元素 = pi Model 形状对象（ModelDefinitionSchema 超集——pi 条目 schema 无
 * additionalProperties 限制，额外字段如 trae consumptionRate 随 JSON 往返保留）。 */
export interface WoolProviderWriteParams {
	providerId: string;
	apiKey: string;
	headers?: Record<string, string>;
	displayName?: string;
	models?: unknown[];
}

/** providers.credential 回包（D4 受控明文回读）：状态查询 / 额度查询 / 401 复检的凭据来源。
 * 形状对齐宿主实装（provider-write-proxy.ts：成功 = `{ providerId, key, source, kind }`，
 * 不可读 = `{ providerId, unsupported }`）——`key` 是唯一读取点，字段名不做二次包装。 */
export type WoolResolvedCredential =
	| {
			providerId: string;
			/** 生效凭据明文（api_key 或 oauth access token）。 */
			key: string;
			source: "auth.json" | "models.json";
			kind: "api_key" | "oauth";
	  }
	| { providerId: string; unsupported: "command" | "unresolved-env" };

/** providers.credential 回包 → 明文 key（不可读形态返回 undefined，调用方按未接入处理）。 */
export function woolCredentialKey(resolved: WoolResolvedCredential): string | undefined {
	const key = (resolved as { key?: unknown }).key;
	return typeof key === "string" && key.length > 0 ? key : undefined;
}

/** 插件 → renderer 的业务事件上报（plugin.event，D9）。辅助链：宿主域缺席时降级跳过
 * （getStatus 的同步返回仍承载状态语义，缺的只是增量推送——降级 ≠ 吞错，跳过留痕）。 */
export interface WoolPluginEvents {
	emit(channel: string, payload: unknown): Promise<void>;
}

/** 羊毛插件消费的宿主 API 全形（activate 时逐域校验；providers/events 为必需——
 * 凭据落盘是核心链）。 */
export interface WoolPluginHostApi {
	storage: { global: WoolPluginStorage };
	commands: WoolPluginCommands;
	views: WoolPluginViews;
	ui: WoolPluginUi;
	providers: {
		write(params: WoolProviderWriteParams): Promise<unknown>;
		credential(params: { providerId: string }): Promise<WoolResolvedCredential>;
	};
	events: WoolPluginEvents;
}

/** 插件 activate 上下文的消费子集（宿主 bootstrap 注入；api 为结构化消费面）。 */
export interface WoolPluginContext {
	readonly pluginId: string;
	readonly api: WoolPluginHostApi;
	readonly subscriptions: Array<{ dispose(): void }>;
}

/** 必需域缺失的 fail-fast 错误（错误 → 权威源 → 恢复动作闭环）。 */
export function requireHostApi(api: unknown): WoolPluginHostApi {
	const record = typeof api === "object" && api !== null ? (api as Record<string, unknown>) : {};
	const missing: string[] = [];
	for (const domain of ["storage", "commands", "views", "ui", "providers", "events"] as const) {
		if (typeof record[domain] !== "object" || record[domain] === null) {
			missing.push(domain);
		}
	}
	if (missing.length > 0) {
		throw new Error(
			`wool plugin host API is missing required domain(s): ${missing.join(", ")}. ` +
				`This plugin requires a taiji host with provider-plugin-access support (providers.write/credential, plugin.invoke, provider.authorize mount point). ` +
				`Recovery: update taiji to a version that ships the plugin provider runtime.`,
		);
	}
	return record as unknown as WoolPluginHostApi;
}
