// plugin-kit.ts — 羊毛 taiji 插件的装配骨架（createWoolPlugin，设计 D6 三层结构的插件层）。
//
// 家族包只提供差异件（定义项：凭据获取 / 状态聚合 / 目录拉取 / 签到），宿主契约的
// 全部接线由本骨架统一承担：invoke 方法注册（plugin.invoke 的方法面，D9）、授权流程
// 树状态机（provider.authorize 挂载位，D2）、凭据落盘（providers.write，D4）、状态
// 上报（plugin:event，D5 拉为主推补充）、采纳链（S24 存量凭据接管 + 目录写回幂等）、
// 每日签到定时器（workbuddy，产品功能定时白名单形态）。
//
// 与 pi 扩展（pi-wool-<family>）的分工：插件进程内无 pi 运行时——本模块与家族定义项
// 只消费宿主 API（host-contract 契约面）与 wool-shared 家族管理模块，凭据经宿主受控
// 通道定向流动，插件 storage 不存凭据（D4 约定）。

import {
	readCheckinSettings,
	msUntilNextDailyCheckin,
	WOOL_CHECKIN_SETTINGS_KEY,
} from "../checkin-settings.ts";
import type { WoolAccountStatus } from "../account-status.ts";
import { woolLoggedOutStatus } from "../account-status.ts";
import type { WoolCredentialAcquireData } from "../credentials-contract.ts";
import type { WoolFamilyId } from "../types.ts";
import { woolProviderId } from "../types.ts";
import type { WoolGuiComponent, WoolPluginContext } from "./host-contract.ts";
import { requireHostApi, woolCredentialKey } from "./host-contract.ts";
import {
	buildDetailTree,
	buildExtractTree,
	buildOAuthTree,
	buildPatTree,
	woolAccountStatusLine,
	PAT_INPUT_COMPONENT_ID,
	type WoolAuthorizePhase,
} from "./gui.ts";

/** 业务事件上报 channel 词表（plugin:event 的 channel；与宿主 renderer
 * PluginProviderSource.CREDENTIAL_STATUS_CHANNEL 同字面——跨仓契约，宿主按它过滤）。 */
export const WOOL_EVENT_CHANNEL_STATUS = "provider.credentialStatus";

/** 授权挂载位主视图 viewId（宿主 ViewHost 按 viewId 精确匹配渲染，跨仓契约 = 挂载位
 * 同名——快照 store 分区键 global:<mountId>:<pluginId> 内再按 viewId 查树）。 */
const AUTHORIZE_VIEW_ID = "provider.authorize";

/** 条目扩展区主视图 viewId（同上契约，挂载位 provider.detail-extra 同名）。 */
const DETAIL_EXTRA_VIEW_ID = "provider.detail-extra";

/** 宿主凭据状态展示契约（renderer PluginProviderSource.CredentialStatusPayload 的
 * 返回值子形状：getStatus 返回值不带归属 providerId——归属已在 invoke params；
 * plugin:event 推送载荷另补 providerId，见 emitStatusEvent）。 */
interface CredentialStatusFields {
	state: "valid" | "invalid";
	message?: string;
}

/** 未接入态的一行文案（宿主状态行直接呈现——用户可操作的恢复入口在授权流程）。 */
const NOT_CONNECTED_MESSAGE = "未接入：请先完成授权或提取";

/** 账号状态 → 宿主展示契约形状（getStatus 返回值与状态推送载荷共用组装；未上报 = null
 * ——宿主不显示任何标记，S5 不猜测。已登录但无昵称/额度素材（摘要空串）时省略 message
 * ——宿主回落默认「凭据可用」文案，不渲染空白行）。 */
function credentialStatusFields(status: WoolAccountStatus | undefined): CredentialStatusFields | null {
	if (status === undefined) {
		return null;
	}
	if (status.loggedIn !== true) {
		return { state: "invalid", message: NOT_CONNECTED_MESSAGE };
	}
	const message = woolAccountStatusLine(status);
	return message.length > 0 ? { state: "valid", message } : { state: "valid" };
}

/** plugin.invoke 方法注册的命令面板可见性：invoke 面向界面代码（D9），不进命令面板
 * ——注册不带 title；action-bar 按钮经 commandId 触达（executeCommand 与 invoke 复用
 * 同一注册表）。 */

/** 存量条目目录接管的 storage 标记（S24 幂等：仅在目录写回成功后置位；写回失败不置位
 * ——下次条目展开幂等重试自愈，不设定时补偿，D6）。 */
const CATALOG_ADOPTED_KEY = "catalog-adopted";

/** OAuth 授权编排的注入面：授权页打开经宿主 plugin.ui.openUrl（http(s) scheme 白名单
 * 由宿主执法，D9）。 */
export interface WoolAuthorizeIo {
	openAuthorizePage(url: string): Promise<void>;
}

/** 家族差异件定义项（createWoolPlugin 的入参；两两互斥的凭据获取件按 credentialsSource 校验）。 */
export interface WoolPluginDefinition {
	familyId: WoolFamilyId;
	/** UI 显示名（树标题与条目扩展区卡头）。 */
	displayName: string;
	/** 凭据来源（决定授权挂载位的树形态与注册的方法集）。 */
	credentialsSource: "oauth" | "ide-extract";
	/** OAuth 授权编排（oauth 家族必填）。 */
	authorize?: (io: WoolAuthorizeIo) => Promise<WoolCredentialAcquireData>;
	/** 本机提取（ide-extract 家族必填；失败 throw——骨架转 error 树）。 */
	extract?: () => Promise<WoolCredentialAcquireData>;
	/** 提取失败的 PAT 次级入口（qoder；缺省 = 失败树无 PAT 屏）。 */
	submitPat?: (pat: string) => Promise<WoolCredentialAcquireData>;
	/** 账号状态聚合（凭据明文注入；无凭据/未登录 = loggedIn:false 形状——D5 同步返回
	 * 本地已知、异步上游校验由骨架编排）。 */
	fetchStatus: (accessToken: string | undefined) => Promise<WoolAccountStatus>;
	/** 上游模型目录拉取（返回 Model 形状数组；providers.write 写回由骨架承担）。 */
	fetchCatalog: (accessToken: string) => Promise<unknown[]>;
	/** 手动签到（workbuddy；缺省 = 方法显式应答 supported:false——qoder/trae 无签到体系）。
	 * accessToken 由骨架经 providers.credential 回读后传入（签到请求需要鉴权）。 */
	checkin?: (accessToken: string) => Promise<unknown>;
	/** true = 装每日签到提醒定时器（产品功能定时白名单形态；仅 workbuddy）。 */
	dailyCheckin?: boolean;
	/** 提取家族确认卡展示的本机凭据文件路径（缺省 = 通用占位表述）。 */
	credentialPath?: string;
}

/** 授权树状态机（挂载位本地状态；树全量替换推送——U2 generation 语义）。 */
interface WoolAuthorizeState {
	phase: WoolAuthorizePhase;
	message?: string;
	summary?: Array<{ label: string; value: string }>;
	patVisible: boolean;
	patValue: string;
}

/** 状态聚合的本地缓存（内存；D5——getStatus 同步返回最近已知，不阻塞条目展开）。 */
interface WoolStatusCache {
	status?: WoolAccountStatus;
}

/**
 * 组装羊毛插件 activate 入口。用法（家族包 src/index.ts）：
 * `export async function activate(context: WoolPluginContext): Promise<void> { return createWoolPlugin(definition)(context) }`
 */
export function createWoolPlugin(definition: WoolPluginDefinition): (context: WoolPluginContext) => Promise<void> {
	// 定义项与凭据来源的一致性在装配期一次校验（配置错误 fail-fast，不运行期静默）。
	if (definition.credentialsSource === "oauth" && definition.authorize === undefined) {
		throw new Error(`wool plugin ${definition.familyId}: credentialsSource "oauth" requires an authorize implementation`);
	}
	if (definition.credentialsSource === "ide-extract" && definition.extract === undefined) {
		throw new Error(`wool plugin ${definition.familyId}: credentialsSource "ide-extract" requires an extract implementation`);
	}
	const providerId = woolProviderId(definition.familyId);

	return async (context: WoolPluginContext): Promise<void> => {
		const api = requireHostApi(context.api);
		const statusCache: WoolStatusCache = {};
		const authorizeState: WoolAuthorizeState = { phase: "ready", patVisible: false, patValue: "" };

		// 输入组件值回传（D8 plugin.uiEvent）：text-input 的值只在树里回显，确认动作由
		// action-bar 按钮触发——插件侧始终持有最新值（submit-pat 读最近一次回传）。
		const uiEventSubscription = api.ui.onUiEvent?.((event) => {
			if (event.componentId === PAT_INPUT_COMPONENT_ID && typeof event.value === "string") {
				authorizeState.patValue = event.value;
			}
		});
		if (uiEventSubscription !== undefined) {
			context.subscriptions.push(uiEventSubscription);
		}

		// ── 树推送（provider.authorize 挂载位；全局域 scope，分区键自动并入插件 id）──
		async function pushAuthorizeTree(): Promise<void> {
			const tree: WoolGuiComponent[] = authorizeState.patVisible
				? buildPatTree({
						displayName: definition.displayName,
						patValue: authorizeState.patValue,
						message: authorizeState.message,
					})
				: definition.credentialsSource === "oauth"
					? buildOAuthTree({
							phase: authorizeState.phase,
							displayName: definition.displayName,
							message: authorizeState.message,
							summary: authorizeState.summary,
						})
					: buildExtractTree({
							phase: authorizeState.phase,
							displayName: definition.displayName,
							credentialPath: definition.credentialPath,
							message: authorizeState.message,
							summary: authorizeState.summary,
						});
			await api.views.update(AUTHORIZE_VIEW_ID, tree, { mountId: AUTHORIZE_VIEW_ID });
		}

		function setAuthorizePhase(phase: WoolAuthorizePhase, patch: Partial<WoolAuthorizeState> = {}): Promise<void> {
			authorizeState.phase = phase;
			authorizeState.message = patch.message;
			authorizeState.summary = patch.summary;
			if (patch.patVisible !== undefined) authorizeState.patVisible = patch.patVisible;
			return pushAuthorizeTree();
		}

		/** 凭据获取结果的统一落盘（providers.write；refreshToken 进 headers 承载键——
		 * models.json ProviderConfig 无 refreshToken 字段，headers 经 getApiKeyAndHeaders
		 * 透传家族 stream，键名与宿主时代同字面）。 */
		async function writeCredentials(acquired: WoolCredentialAcquireData): Promise<void> {
			await api.providers.write({
				providerId,
				apiKey: acquired.credentials.apiKey,
				...(acquired.credentials.refreshToken !== undefined
					? { headers: { "x-wool-refresh-token": acquired.credentials.refreshToken } }
					: {}),
				...(acquired.account?.displayName !== undefined ? { displayName: acquired.account.displayName } : {}),
			});
		}

		/** 凭据明文回读（providers.credential——D4 受控通道；无凭据返回 undefined）。 */
		async function readCredential(): Promise<string | undefined> {
			try {
				return woolCredentialKey(await api.providers.credential({ providerId }));
			} catch {
				// 条目不存在/未授权 = 无凭据（回读拒绝是合法未接入态，非错误）。
				return undefined;
			}
		}

		/** 状态刷新（D5 时序语义的异步半段：凭据 → 上游校验 → 缓存 + 增量上报）。
		 * 失败不抛（调用方 fire-and-forget；失败经缓存态显式呈现——校验失败 = loggedIn
		 * false 或维持上次状态，恢复 = 重新展开条目 / 重新授权）。 */
		async function refreshStatus(): Promise<WoolAccountStatus | undefined> {
			const accessToken = await readCredential();
			try {
				const status = await definition.fetchStatus(accessToken);
				statusCache.status = status;
			} catch (error) {
				// 上游校验失败 ≠ 未登录：保留最近已知态（网络失败与凭据失效不可区分时
				// 不把已登录误报为未登录）；无已知态才落未登录。
				statusCache.status ??= woolLoggedOutStatus(definition.familyId, Date.now());
				console.warn(
					`[wool-plugin-${definition.familyId}] status refresh failed: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
			await emitStatusEvent(statusCache.status);
			return statusCache.status;
		}

		/** 目录写回（授权完成 / 采纳接管 / 手动刷新共用编排；写回成功才置接管标记——S24 幂等）。 */
		async function writeCatalog(accessToken: string, options: { markAdopted: boolean }): Promise<void> {
			const models = await definition.fetchCatalog(accessToken);
			await api.providers.write({ providerId, apiKey: accessToken, models });
			if (options.markAdopted) {
				await api.storage.global.set(CATALOG_ADOPTED_KEY, true);
			}
		}

		/** 存量条目采纳链（S24）：条目展开触发 getStatus 后执行——校验通过且未接管过，
		 * 拉上游目录写回条目（免重授权形态的关键步：不写回则 pi 扩展读条目得空目录）。 */
		async function adoptCatalogIfPending(): Promise<void> {
			if ((await api.storage.global.get<boolean>(CATALOG_ADOPTED_KEY)) === true) {
				return;
			}
			const accessToken = await readCredential();
			if (accessToken === undefined) {
				return;
			}
			try {
				const status = await definition.fetchStatus(accessToken);
				if (status.loggedIn !== true) {
					return;
				}
				await writeCatalog(accessToken, { markAdopted: true });
			} catch (error) {
				// 校验/目录写回失败：显式呈现中间态（「已登录 · 模型目录未同步」语义），不静默
				// ——调用方是 fire-and-forget 链，异常不得逃逸成 unhandled rejection。
				console.warn(
					`[wool-plugin-${definition.familyId}] catalog adoption failed: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}

		async function emitStatusEvent(status: WoolAccountStatus | undefined): Promise<void> {
			const fields = credentialStatusFields(status);
			if (fields === null) {
				return;
			}
			try {
				// 推送载荷带归属 providerId（宿主 parseCredentialStatus 契约：归属必带，
				// 宿主按它落 providerId → 状态分区）。
				await api.events.emit(WOOL_EVENT_CHANNEL_STATUS, { providerId, ...fields });
			} catch (error) {
				// 辅助链降级：事件出线缺失/失败不影响状态语义（getStatus 同步返回承载），
				// 留痕不吞——warn 可从日志归因「有状态但渲染端未收到增量」。
				console.warn(
					`[wool-plugin-${definition.familyId}] status event emit failed: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}

		/** 成功摘要行（树回显：账号/模型数——D6 写回链的可见反馈）。 */
		function summarize(acquired: WoolCredentialAcquireData | undefined, modelCount?: number): Array<{ label: string; value: string }> {
			const rows: Array<{ label: string; value: string }> = [];
			if (acquired?.account?.displayName !== undefined) {
				rows.push({ label: "账号", value: acquired.account.displayName });
			}
			if (acquired?.expiresAt !== undefined && acquired.expiresAt > 0) {
				rows.push({ label: "令牌到期", value: new Date(acquired.expiresAt).toLocaleString() });
			}
			if (modelCount !== undefined) {
				rows.push({ label: "模型", value: `${modelCount} 个` });
			}
			return rows;
		}

		// ── invoke 方法注册（plugin.invoke 的方法面；id = renderer 调用键 + 按钮 commandId）──

		await api.commands.register({ id: "getAuthorizeView" }, async () => {
			await pushAuthorizeTree();
			return { phase: authorizeState.phase, patVisible: authorizeState.patVisible };
		});

		const authorize = definition.authorize;
		if (authorize !== undefined) {
			await api.commands.register({ id: "authorize", timeoutMs: 0 }, async () => {
				// timeoutMs: 0 = 显式 opt-out（OAuth 含浏览器人机交互，无墙钟上界——任务级
				// 默认无超时原则；插件进程存活期即授权窗口）。
				try {
					await setAuthorizePhase("waiting-browser", { message: "已打开授权页，请用同账号登录后回到本页。", patVisible: false });
					const acquired = await authorize({
						openAuthorizePage: async (url) => {
							const result = await api.ui.openUrl(url);
							// 出线未装配（opened:false）= 授权页没打开：显式失败，不等浏览器。
							if (!result.opened) {
								throw new Error("授权页未能打开（宿主浏览器出口未就绪）——请重试或更新 taiji");
							}
						},
					});
					await writeCredentials(acquired);
					await setAuthorizePhase("running", { message: "授权成功，正在保存凭据并拉取模型目录…" });
					try {
						await writeCatalog(acquired.credentials.apiKey, { markAdopted: true });
					} catch (error) {
						// 目录拉取失败不回滚凭据（对话可用），中间态经状态上报显式呈现（D6）。
						console.warn(
							`[wool-plugin-${definition.familyId}] post-authorize catalog fetch failed: ${error instanceof Error ? error.message : String(error)}`,
						);
					}
					await setAuthorizePhase("success", { summary: summarize(acquired), patVisible: false });
					await refreshStatus();
					return { ok: true };
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					// 用户主动取消（AbortError）回 ready，不落 error 态。
					if (error instanceof DOMException && error.name === "AbortError") {
						await setAuthorizePhase("ready", { patVisible: false });
						return { ok: false, cancelled: true };
					}
					await setAuthorizePhase("error", { message, patVisible: false });
					return { ok: false, error: message };
				}
			});
		}

		const extract = definition.extract;
		const submitPat = definition.submitPat;
		if (extract !== undefined) {
			await api.commands.register({ id: "extract", timeoutMs: 0 }, async () => {
				try {
					await setAuthorizePhase("running", { message: "正在读取并解密本机登录态…", patVisible: false });
					const acquired = await extract();
					await writeCredentials(acquired);
					try {
						await writeCatalog(acquired.credentials.apiKey, { markAdopted: true });
					} catch (error) {
						console.warn(
							`[wool-plugin-${definition.familyId}] post-extract catalog fetch failed: ${error instanceof Error ? error.message : String(error)}`,
						);
					}
					await setAuthorizePhase("success", { summary: summarize(acquired), patVisible: false });
					await refreshStatus();
					return { ok: true };
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					// PAT 次级入口在场（qoder）：提取失败转 PAT 屏（D8 P-ui 第五屏真实入口）。
					if (definition.submitPat !== undefined) {
						await setAuthorizePhase("ready", { patVisible: true, message });
						return { ok: false, error: message, patEntry: true };
					}
					await setAuthorizePhase("error", { message, patVisible: false });
					return { ok: false, error: message };
				}
			});

			await api.commands.register({ id: "submit-pat", timeoutMs: 0 }, async (args?: unknown) => {
				// PAT 值双通道：invoke args 优先（renderer 调用携带），回退 uiEvent 缓存。
				const argsRecord = typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {};
				const patArg = typeof argsRecord.pat === "string" ? argsRecord.pat : undefined;
				const pat = (patArg ?? authorizeState.patValue).trim();
				if (submitPat === undefined) {
					// 家族未提供 PAT 入口（方法仍在注册表内以保持方法集稳定）：显式拒绝。
					return { ok: false, error: "本家族不支持 PAT 入口" };
				}
				if (pat.length === 0) {
					return { ok: false, error: "PAT 为空——粘贴官方个人访问令牌后再提交" };
				}
				try {
					await setAuthorizePhase("running", { message: "正在验证 PAT…", patVisible: false });
					const acquired = await submitPat(pat);
					await writeCredentials(acquired);
					try {
						await writeCatalog(acquired.credentials.apiKey, { markAdopted: true });
					} catch (error) {
						console.warn(
							`[wool-plugin-${definition.familyId}] post-pat catalog fetch failed: ${error instanceof Error ? error.message : String(error)}`,
						);
					}
					await setAuthorizePhase("success", { summary: summarize(acquired), patVisible: false });
					await refreshStatus();
					return { ok: true };
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					await setAuthorizePhase("ready", { patVisible: true, message });
					return { ok: false, error: message };
				}
			});
		}

		// 取消/完成：授权树回初始态（挂载位保留上次成功结果树直至重进——由 renderer
		// 按需重拉 getAuthorizeView）。
		await api.commands.register({ id: "dismiss" }, async () => {
			await setAuthorizePhase("ready", { patVisible: false });
			return { ok: true };
		});

		await api.commands.register({ id: "getStatus" }, async () => {
			// D5：同步返回本地最近已知状态（宿主 CredentialStatusPayload 契约形状——renderer
			// parseStatusFields 按它窄化渲染状态行）；上游校验异步跟进（校验完经 plugin:event
			// 增量上报）+ 存量条目采纳链（S24）。未上报返回 null = 宿主不显示任何标记。
			const known = statusCache.status;
			void refreshStatus().then(() => adoptCatalogIfPending());
			return credentialStatusFields(known);
		});

		await api.commands.register({ id: "refreshCatalog" }, async () => {
			const accessToken = await readCredential();
			if (accessToken === undefined) {
				return { ok: false, error: "未接入：请先完成授权或提取" };
			}
			try {
				await writeCatalog(accessToken, { markAdopted: true });
				await refreshStatus();
				return { ok: true };
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return { ok: false, error: message };
			}
		});

		await api.commands.register({ id: "checkin" }, async () => {
			if (definition.checkin === undefined) {
				// 无签到体系家族的显式应答（不静默假成功——现状语义保留）。
				return { supported: false, reason: `${definition.displayName} has no check-in program` };
			}
			const accessToken = await readCredential();
			if (accessToken === undefined) {
				throw new Error("签到需要已保存的凭据——请先完成授权");
			}
			const result = await definition.checkin(accessToken);
			await refreshStatus();
			return { supported: true, result };
		});

		await api.commands.register({ id: "toggle-auto-checkin" }, async () => {
			const current = readCheckinSettings(await api.storage.global.get<unknown>(WOOL_CHECKIN_SETTINGS_KEY));
			const next = { autoCheckin: !current.autoCheckin };
			await api.storage.global.set(WOOL_CHECKIN_SETTINGS_KEY, next);
			return next;
		});

		await api.commands.register({ id: "getDetail" }, async () => {
			const settings = readCheckinSettings(await api.storage.global.get<unknown>(WOOL_CHECKIN_SETTINGS_KEY));
			const tree = buildDetailTree({
				displayName: definition.displayName,
				status: statusCache.status,
				checkinSupported: definition.checkin !== undefined,
				autoCheckin: settings.autoCheckin,
			});
			await api.views.update(DETAIL_EXTRA_VIEW_ID, tree, { mountId: "provider.detail-extra" });
			return { status: statusCache.status, autoCheckin: settings.autoCheckin };
		});

		// ── 每日签到定时器（dailyCheckin 家族；产品功能定时白名单形态）──────────
		if (definition.dailyCheckin === true && definition.checkin !== undefined) {
			let disposed = false;
			let timer: ReturnType<typeof setTimeout> | undefined;
			const tick = async (): Promise<void> => {
				if (disposed) {
					return;
				}
				try {
					const settings = readCheckinSettings(await api.storage.global.get<unknown>(WOOL_CHECKIN_SETTINGS_KEY));
					if (settings.autoCheckin) {
						const accessToken = await readCredential();
						if (accessToken === undefined) {
							// 到点无凭据 = 未接入态（不伪造签到成功；手动入口仍可用）。
							return;
						}
						await definition.checkin?.(accessToken);
					} else {
						// 提醒形态 = 账号状态新鲜化（「今日未签到」徽标以新鲜数据点亮）。
						await refreshStatus();
					}
				} catch (error) {
					// 单次到点失败只留痕：下一天照常触发；当日手动签到入口全天可用（D6 语义）。
					console.warn(
						`[wool-plugin-${definition.familyId}] daily checkin tick failed: ${error instanceof Error ? error.message : String(error)}`,
					);
				} finally {
					if (!disposed) {
						schedule();
					}
				}
			};
			const schedule = (): void => {
				timer = setTimeout(() => {
					void tick();
				}, msUntilNextDailyCheckin());
				timer.unref?.();
			};
			schedule();
			context.subscriptions.push({
				dispose: () => {
					disposed = true;
					if (timer !== undefined) {
						clearTimeout(timer);
					}
				},
			});
		}
	};
}
