// types.ts — Qoder 家族跨层共享类型（管理模块与 pi 扩展协议翻译两侧都用）。
//
// QoderModelMeta 原属 pi-wool-qoder/src/chat-body.ts（协议翻译件）。管理模块
// models-fetch.ts 的 model/list 条目 → 元数据转换也要产出同一形状，而共享内核不得
// 反向依赖 pi 扩展包（D6 分层：pi 扩展 → wool-shared，非倒置）——类型下沉到本文件，
// chat-body 从共享内核按名导入。

/** 模型目录元数据（model/list 条目子集；model_config 与结构化判定用）。 */
export type QoderModelMeta = {
	key: string;
	displayName: string;
	isVl: boolean;
	isReasoning: boolean;
	maxInputTokens: number;
};
