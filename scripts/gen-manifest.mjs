// 生成 wool-manifest.json（taiji 宿主资产清单：DEFAULT_WOOL_MANIFEST_URL 拉取，
// install 动作钉版本 + 快照元数据源）。CI release 发布 npm 后调用，产物上传到
// GitHub release（releases/latest/download/wool-manifest.json 语义）。
//
// 家族静态元数据（displayName/vendor/credentialsSource）是产品决策值非构建派生——
// 内联本表；version 从各包 package.json 读取（单一事实源）。credentialsSource 兜底
// 缺陷（D3 验收 a5 发现：清单不可达时宿主兜底 'ide-extract' 使 OAuth 家族被误导为
// 提取族模板）的根解 = 清单真实可达——本生成器即发布链缺口的第一块。
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 包目录名 → 家族清单条目（静态元数据；pkg/version 由 package.json 派生）。 */
const FAMILIES = {
  qoder: { dir: 'pi-wool-qoder', displayName: 'Qoder', vendor: 'Alibaba', credentialsSource: 'ide-extract' },
  trae: { dir: 'pi-wool-trae', displayName: 'Trae', vendor: 'ByteDance', credentialsSource: 'ide-extract' },
  workbuddy: { dir: 'pi-wool-workbuddy', displayName: 'WorkBuddy', vendor: 'Tencent', credentialsSource: 'oauth' },
}

const DEFAULT_RISK_NOTICE =
  '非官方接口：使用你自己的账号额度，存在账号风控与接口变动风险；凭据与协议实装仅在本机运行'

const families = {}
for (const [family, meta] of Object.entries(FAMILIES)) {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'packages', meta.dir, 'package.json'), 'utf-8'))
  if (pkg.name !== `@zhushanwen/pi-wool-${family}`) {
    throw new Error(`package name mismatch: ${meta.dir} is ${pkg.name}, expected @zhushanwen/pi-wool-${family}`)
  }
  families[family] = {
    pkg: pkg.name,
    version: pkg.version,
    displayName: meta.displayName,
    vendor: meta.vendor,
    credentialsSource: meta.credentialsSource,
    riskNotice: meta.riskNotice ?? DEFAULT_RISK_NOTICE,
  }
}

const manifest = {
  schemaVersion: 1,
  // 宿主 isWoolAssetManifest（taiji 主仓 packages/shared/src/wool.ts）要求 epoch 毫秒
  // 数字——曾发过 ISO 字符串版本被宿主 bad_shape 拒收（发布链无消费侧对拍的缺口）。
  generatedAt: Date.now(),
  families,
}

// 生成后按宿主守卫同款规则自检（字面量镜像，漂移 = 发布物被宿主拒收）：
// schemaVersion=1 / generatedAt 数字 / families 三字段逐项。不过即 exit 1 拦截上传。
const bad = Object.entries(families).filter(([, e]) =>
  typeof e.pkg !== 'string' || e.pkg.length === 0 ||
  typeof e.version !== 'string' || e.version.length === 0 ||
  typeof e.displayName !== 'string' || typeof e.vendor !== 'string' ||
  (e.credentialsSource !== 'ide-extract' && e.credentialsSource !== 'oauth') ||
  typeof e.riskNotice !== 'string')
if (manifest.schemaVersion !== 1 || typeof manifest.generatedAt !== 'number' || bad.length > 0) {
  console.error(`[gen-manifest] 生成物未过宿主 schema 自检（bad families: ${bad.map(([k]) => k).join(', ') || '无'}——检查 schemaVersion/generatedAt 类型）`)
  process.exit(1)
}

const out = process.argv[2] ?? join(ROOT, 'wool-manifest.json')
writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
console.log(`[gen-manifest] written: ${out}`)
console.log(JSON.stringify(Object.fromEntries(Object.entries(families).map(([k, v]) => [k, `${v.pkg}@${v.version}`])), null, 0))
