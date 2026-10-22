---
name: dev-merge
description: >-
  Use when tai-ji-plugin 独立仓的发版流程入口：发布前检查 → 打 npm tag 触发 CI 发布 →
  npm registry 与 GitHub release 验证 → GitCode 同步（代码镜像 + release 资产）→ 终验汇报。
  触发词："dev-merge"、"/dev-merge"、"发版 tai-ji-plugin"、"发布 tai-ji-plugin"、"gitcode 同步"。
  不用于 主仓 taiji 的 Electron/npm 发布（主仓 merge skill）、worktree 合并清理（主仓同名技能语义不同）。
---

# dev-merge（tai-ji-plugin 发版流程）

把 tai-ji-plugin 独立仓的一次变更发布为 npm 四包版本，并把 release 资产（wool-manifest.json + npm 包 tarball）同步到 GitCode 镜像仓，全程本地驱动。

**发布链**：`npm-v*` tag → GitHub Actions（`.github/workflows/release-npm.yml`：typecheck + test → changeset version + publish 四个 `@zhushanwen/pi-wool-*` 包 → `node scripts/gen-manifest.mjs` 生成 wool-manifest.json → 上传 GitHub release 资产）。GitCode 同步**不在 CI**（跨境直传必然超时，主仓同款裁决），收敛到发布流程本地执行——即本技能阶段 4。

**四包**：`@zhushanwen/pi-wool-shared`、`@zhushanwen/pi-wool-qoder`、`@zhushanwen/pi-wool-trae`、`@zhushanwen/pi-wool-workbuddy`。下文 `<版本>` = 本次发布的 semver（如 `0.2.0`），tag 形态 `npm-v<版本>`（如 `npm-v0.2.0`）。

**边界**：
- 仓库形态 = bare 模式 workspace，唯一 remote 名 `github`（`zhushanwen321/tai-ji-plugin`）；GitCode 镜像仓 = `qq_18433817/tai-ji-plugin`
- 全程不 `git merge main` 之外的分支操作；push 仅限 tag 与 CI 内部动作
- 发布期间禁止修改 pi 上游语义相关内容（见「注意事项」第 3 条）

**前置环境**（阶段 4 才需要，缺了到时再配）：`GITCODE_TOKEN`（GitCode 私人令牌）、本机 `gh` 已登录 GitHub。

## 阶段 1：发布前检查

```bash
pnpm typecheck && pnpm lint && pnpm test
git status --short
npx changeset status
```

验证判据（三条全过才进阶段 2）：
- 三连命令全部 exit 0
- `git status --short` 输出为空（工作区干净，含 untracked）
- `npx changeset status` 显示有待发布变更（`.changeset/` 下存在待发布的 `*.md`；`config.json` 不算）。待发布版本号与内容核对：changeset 的 bump 类型（major/minor/patch）与本次变更语义一致，目标版本 = 当前包版本按 bump 递增后的结果

## 阶段 2：打 tag 推送 + CI 等待

```bash
git tag npm-v<版本>
git push github HEAD:refs/tags/npm-v<版本>
```

验证判据：push exit 0；`gh run list --repo zhushanwen321/tai-ji-plugin --workflow release-npm.yml --limit 1` 出现本 tag 的新 run。

等待 CI（推荐 `gh run watch`，也可轮询）：

```bash
RUN_ID=$(gh run list --repo zhushanwen321/tai-ji-plugin --workflow release-npm.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --repo zhushanwen321/tai-ji-plugin --exit-status
# 轮询形态：gh api repos/zhushanwen321/tai-ji-plugin/actions/runs/$RUN_ID --jq .conclusion
```

**结构性判定（禁止字符串猜测）**：conclusion = `null` → 未完成继续等；`success` → 通过，记下 `$RUN_ID` 进阶段 3/5；`failure` / `cancelled` / `timed_out` → 拒绝，`gh run view "$RUN_ID" --repo zhushanwen321/tai-ji-plugin --log-failed` 归因修复后删 tag 重打（`git push github :refs/tags/npm-v<版本>` + 修正 + 重打新 tag），禁止放宽断言或盲目重跑换绿灯。

## 阶段 3：发布验证

npm registry 与 GitHub release 两路核对：

```bash
for pkg in pi-wool-shared pi-wool-qoder pi-wool-trae pi-wool-workbuddy; do
  npm view "@zhushanwen/$pkg" version
done
curl -sL https://github.com/zhushanwen321/tai-ji-plugin/releases/latest/download/wool-manifest.json
```

验证判据：
- 四条 `npm view` 全部输出 `<版本>`。**npm registry 新包可见有约 2 分钟同步延迟**：404 先等 1-2 分钟重查；持续 404 → `gh run view "$RUN_ID" --log` 查 `changeset publish` 步骤输出，确认 publish 成功后再查（publish 失败属阶段 2 拒绝态，回阶段 2 处置）
- manifest JSON：`schemaVersion` = `1`，`families` 三项 `qoder` / `trae` / `workbuddy` 的 `version` 均为 `<版本>`，`generatedAt` 为本次 CI 时间

## 阶段 4：GitCode 同步（本地执行）

前置 env（仅本机 export，不入库、不进 CI）：

```bash
export GITCODE_TOKEN=<GitCode 私人令牌>
export GITCODE_REPO=qq_18433817/tai-ji-plugin
```

### a. 代码镜像（分支 + tags 强推对齐）

```bash
node scripts/gitcode-release-sync.mjs push-repo --ref-source github
```

验证判据：末行输出「镜像验证通过：分支+tags 引用集与 github 完全一致」（exit 0）。**本地 bare workspace 必须显式 `--ref-source github`**——origin 指向本地 `.bare`，缺省会把本地裸仓状态推上 GitCode 造成 drift。

### b. release 资产同步（GitHub → GitCode，本地中转）

```bash
node scripts/gitcode-release-sync.mjs sync-from-github npm-v<版本> --github-repo zhushanwen321/tai-ji-plugin
```

验证判据：末行输出「附件验证通过：N 件全部存在且远端大小与本地一致」，并打印 GitCode 下载直链格式。说明：本步把 GitHub release 现有附件（当前 = wool-manifest.json）下载后上传到 GitCode 同 tag 的 release（不存在则创建，name/notes 取自 GitHub release 元数据）；下载直连失败会自动挂代理重试（`--proxy <url>` 或 `TAIJI_GITHUB_DL_PROXY`）。

### c. npm tarball 补传（同一 release）

```bash
TARBALL_DIR=$(mktemp -d)
(cd "$TARBALL_DIR" && npm pack \
  @zhushanwen/pi-wool-shared@<版本> \
  @zhushanwen/pi-wool-qoder@<版本> \
  @zhushanwen/pi-wool-trae@<版本> \
  @zhushanwen/pi-wool-workbuddy@<版本>)
ls -l "$TARBALL_DIR"   # 四个 zhushanwen-pi-wool-*-<版本>.tgz
node scripts/gitcode-release-sync.mjs sync npm-v<版本> npm-v<版本> "" "$TARBALL_DIR"
rm -rf "$TARBALL_DIR"
```

说明：
- release 已由步骤 b 创建，`sync` 幂等复用已有 release（name/notes 参数此时不被消费，传占位即可）；本步只把 tarball 补传到同一 release，同名同大小自动跳过，失败直接重跑
- `npm pack` 从 registry 拉取（阶段 3 已验四包可见），不在本仓工作区内执行，不产生仓内残留
- 验证判据：末行输出「附件验证通过：4 件全部存在且远端大小与本地一致」（本步 `sync` 只校验本次传入目录的 4 件 tarball；manifest 的 1 件已在步骤 b 验证。重跑时跳过计数会变，以「全部存在且大小一致」为准）

## 阶段 5：终验 + 汇报

GitCode 匿名直链可达性（终端用户同一链路，不带 token）：

```bash
curl -sfL "https://gitcode.com/qq_18433817/tai-ji-plugin/releases/download/npm-v<版本>/wool-manifest.json"
curl -sfL "https://gitcode.com/qq_18433817/tai-ji-plugin/releases/download/npm-v<版本>/zhushanwen-pi-wool-qoder-<版本>.tgz" \
  -o /dev/null -w "%{http_code} %{size_download}\n"
```

验证判据：两条均 exit 0（`-f` 下 HTTP 非 200 即失败）；tarball 的 `size_download` 与本地 `npm pack` 产物字节数一致。

汇报模板（逐项填齐）：

```
- 版本：npm-v<版本>
- CI：<https://github.com/zhushanwen321/tai-ji-plugin/actions/runs/$RUN_ID>（conclusion=success）
- GitHub release：https://github.com/zhushanwen321/tai-ji-plugin/releases/tag/npm-v<版本>
- GitCode release：https://gitcode.com/qq_18433817/tai-ji-plugin/releases/tag/npm-v<版本>
- npm 四包：pi-wool-shared@<版本> / pi-wool-qoder@<版本> / pi-wool-trae@<版本> / pi-wool-workbuddy@<版本>
```

## 注意事项

1. **GITCODE_TOKEN 获取**：GitCode 个人设置 → 私人令牌（需对 `qq_18433817/tai-ji-plugin` 有写权限）。只在本机 export，禁止写入任何仓库文件或 CI secret。
2. **npm tarball 上 GitCode 的定位**：npm registry 不可达时的离线安装备源资产。宿主（taiji）安装链当前仍走 npm registry（清单钉版本 → `npm install`），备源消费属后续裁决项，未接线前 GitCode tarball 仅作离线兜底。
3. **发布期间禁止改 pi 上游语义相关内容**：pi 语义断言的权威源 = node_modules 实装版；不修改 pi 源码、不提 PR、不 fork。发现协议疑点按主仓 AGENTS.md「pi 语义断言权威源」规则处理，不顺手修。
4. 脚本自检：`node scripts/gitcode-release-sync.mjs`（无参数）输出用法；缺 `GITCODE_TOKEN` / `GITCODE_REPO` 时报错并给出配置指引。
