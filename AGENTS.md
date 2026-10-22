# tai-ji-plugin AGENTS.md

taiji 插件包独立仓：pi provider 扩展（羊毛 provider 三家族 + 共享库），npm 独立版本线发布（`@zhushanwen` scope），与 taiji 主应用版本解耦（扩展热更新不绑 taiji 发版）。

## 仓库形态

- pnpm workspace 单仓多包：`packages/wool-shared`（共享库）+ `packages/pi-wool-{qoder,trae,workbuddy}`（三家族扩展）
- bare 模式 workspace：`<workspace>/.bare`（git dir）+ `main` worktree；remote = `github`（zhushanwen321/tai-ji-plugin）
- 源码直出（`main: src/index.ts`），无构建产物，npm 发布即源码

## 常用命令

```bash
pnpm install        # workspace 安装
pnpm typecheck      # tsc --noEmit（根 tsconfig 统一驱动，含 __tests__ 排除语义）
pnpm lint           # eslint（typescript-eslint 基线 + no-explicit-any 红线）
pnpm test           # 各包 vitest（经 test-guard/taijiTestConfig 工厂挂防线）
```

## 约定（自主仓 extensions/ 产线继承）

- 包名 `@zhushanwen/pi-wool-*`；`keywords: ["pi-package"]`；peer 依赖 pi 宿主三件（`@earendil-works/pi-coding-agent` / `pi-ai` / `typebox`），内部依赖走 workspace:*
- 测试：vitest；vitest.config.ts 一律经 `test-guard/taijiTestConfig` 工厂（globalSetup 固定 TAIJI_AGENT_DATA_DIR 到 tmp + fs-guard 拦截破坏性 fs——测试禁触真实数据目录）；写删目标 mkdtemp 自建自删；rmSync 递归删除必须带 `maxRetries: 5, retryDelay: 20`
- 禁止 `any`（用 `unknown` 或具体类型）；禁止 `eslint-disable` 绕过
- **pi 语义断言的权威源 = node_modules 实装版**；不修改 pi 源码、不提 PR、不 fork
- pi-ai 深路径 import 禁令：pi 宿主注入清单（virtual-modules）只支持根/compat/oauth/providers/all 四入口，深路径真机不可解析（单测被 repo node_modules 掩盖）

## 发布

- changeset 管版本（`pnpm changeset-version` / `pnpm changeset-publish`）；CI release workflow 发布 npm + 生成 `wool-manifest.json`（taiji 宿主经 DEFAULT_WOOL_MANIFEST_URL 拉取钉版本清单）并上传到 GitHub release
- 发布后 GitCode 同步（代码镜像 + release 资产）= dev-merge 技能阶段 4，本地执行非 CI——跨境直传必然超时的主仓同款裁决；入口技能 = `.agents/skills/dev-merge/SKILL.md`
- 发布前供应链自查：能读凭据的可执行代码只从本仓官方源出（npm provenance）
