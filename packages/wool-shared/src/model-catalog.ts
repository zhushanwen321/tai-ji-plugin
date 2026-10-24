// model-catalog.ts — 包内快照承载（设计 D4 的快照层在收敛后的残留职责）。
//
// 收敛说明（D6/D7——模型目录唯一数据源 = models.json 羊毛条目的 models 数组）：目录
// 缓存 store 与 persist 写入随 scaffold 的 refreshModels 退役删除；本文件只保留包内
// 快照的形状与读取——WorkBuddy 上游目录端点只返回模型 id 清单，显示名/参数档位等
// 元数据表由快照承载（插件 refreshCatalog 拉取时按 id 匹配补全），「上游不可达时的
// 目录兜底」语义不再存在（目录断供 = 条目无 models，恢复 = 插件重新拉取成功）。

import type { AnyModel } from "@earendil-works/pi-ai";
import { readFileSync } from "node:fs";

/** 包内快照文件形状。models 装完整模型对象（provider/baseUrl 已补全——与 pi createProvider.fetchModels 契约一致）。 */
export interface WoolCatalogSnapshot { // oe-exempt:20261022:framework:包内快照文件 schema 形状——wool-shared workbuddy snapshots/workbuddy.json 数据文件按此落盘，读侧 readSnapshotFile/isValidSnapshot 守卫与插件 refreshCatalog 元数据匹配消费
	family: string;
	fetchedAt: number;
	models: AnyModel[];
}

/** 快照形状校验（读侧不信任外部格式）：models 必须是对象数组且条目带 id/name/api。 */
export function isValidSnapshot(snapshot: unknown): snapshot is WoolCatalogSnapshot {
	if (typeof snapshot !== "object" || snapshot === null) {
		return false;
	}
	const record = snapshot as Record<string, unknown>;
	if (!Array.isArray(record.models)) {
		return false;
	}
	return record.models.every((model) => {
		if (typeof model !== "object" || model === null) {
			return false;
		}
		const entry = model as Record<string, unknown>;
		return typeof entry.id === "string" && typeof entry.name === "string" && typeof entry.api === "string";
	});
}

/**
 * 读包内快照文件（资源自包含约定：调用方以 import.meta.url 拼接包内绝对路径传入，
 * 禁止外部绝对路径）。文件缺失/损坏返回 undefined（元数据表缺失按未知 id 保守缺省，
 * 不炸正常拉取链路）。
 */
export function readSnapshotFile(filePath: string): WoolCatalogSnapshot | undefined {
	let raw: string;
	try {
		raw = readFileSync(filePath, "utf8");
	} catch {
		return undefined;
	}
	try {
		const parsed: unknown = JSON.parse(raw);
		return isValidSnapshot(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
}
