// namespace.ts — 插件命名空间推导与绑定校验（本仓侧镜像件）。
//
// SSOT = taiji 主仓 `packages/shared/src/plugin-namespace.ts`（安装期与 providers.*
// RPC 的宿主侧校验）：同一推导规则必须两侧逐字一致，否则插件按本仓规则写的
// providerId 会在宿主侧被判 NAMESPACE_MISMATCH。独立仓不依赖主仓 private 包（设计
// D6 的三层结构约束），故规则以纯函数镜像形式落在这里——漂移由本仓单测
// （deriveNamespace 断言 + manifest 绑定校验）与真机安装验收（P-wool-e2e）共同兜底。
//
// 规则：去 npm scope、去 `plugin-` 前缀（各剥离一次）。
//   '@zhushanwen/plugin-wool-workbuddy' → 'wool-workbuddy'

/** 命名空间绑定校验失败的错误码（与宿主同一字面量，错误码即跨仓契约）。 */
export const NAMESPACE_MISMATCH = "NAMESPACE_MISMATCH" as const;

export type NamespaceBindingResult =
	| { ok: true; namespace: string }
	| { ok: false; code: typeof NAMESPACE_MISMATCH; declared: string; derived: string };

/** 从插件 npm 包名推导命名空间（纯函数、零 IO）。 */
export function deriveNamespace(pkgName: string): string {
	let rest = pkgName.trim();
	if (rest.startsWith("@")) {
		const slash = rest.indexOf("/");
		if (slash < 0) {
			return "";
		}
		rest = rest.slice(slash + 1);
	}
	const prefix = "plugin-";
	if (rest.startsWith(prefix)) {
		rest = rest.slice(prefix.length);
	}
	return rest;
}

/** manifest 声明的 namespace 与包名推导值的绑定校验（安装期规则的本地断言形态）。 */
export function validateNamespaceBinding(pkgName: string, declared: string): NamespaceBindingResult {
	const derived = deriveNamespace(pkgName);
	if (derived.length === 0 || declared.trim() !== derived) {
		return { ok: false, code: NAMESPACE_MISMATCH, declared, derived };
	}
	return { ok: true, namespace: derived };
}
