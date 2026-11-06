// 发布物一致性校验：按消费者实际安装形态验证 wool 包。
//
// 仓库内测试经 pnpm workspace 软链解析共享包源码，无法发现「npm 已发布共享包缺少
// 新 exports / 实现文件」这类发布错配。本脚本将七个发布包 pnpm pack 到临时目录，
// 再用 npm 只安装这些 tarball，并解析共享包各子路径 + 校验映射文件真实存在。
// 解析之上再追加加载级校验：taiji 插件侧入口（3 个 plugin 包 + shared 的 /plugin
// 子路径）必须在「只装 tarball、不补装任何 peer」的形态下真实加载成功——taiji 的
// 依赖安装器只递归装 dependencies（跳过 peer/dev/optional），插件沙箱内也没有任何
// 宿主模块可借，运行时依赖若只声明在 peerDependencies 里，解析检查发现不了、加载
// 检查当场复现。加载经 tsx（taiji 插件宿主同款 TS 加载器）。
// 校验失败即非零退出，供 release workflow 在 changeset version 之后、publish 之前拦截。
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const PACKAGE_CHECKS = [
  {
    name: '@zhushanwen/pi-wool-shared',
    specs: [
      '@zhushanwen/pi-wool-shared',
      '@zhushanwen/pi-wool-shared/testing',
      '@zhushanwen/pi-wool-shared/qoder',
      '@zhushanwen/pi-wool-shared/trae',
      '@zhushanwen/pi-wool-shared/workbuddy',
      '@zhushanwen/pi-wool-shared/plugin',
    ],
  },
  { name: '@zhushanwen/pi-wool-qoder', specs: ['@zhushanwen/pi-wool-shared', '@zhushanwen/pi-wool-shared/qoder'] },
  { name: '@zhushanwen/pi-wool-trae', specs: ['@zhushanwen/pi-wool-shared', '@zhushanwen/pi-wool-shared/trae'] },
  { name: '@zhushanwen/pi-wool-workbuddy', specs: ['@zhushanwen/pi-wool-shared', '@zhushanwen/pi-wool-shared/workbuddy'] },
  { name: '@zhushanwen/plugin-wool-qoder', specs: ['@zhushanwen/pi-wool-shared/plugin', '@zhushanwen/pi-wool-shared/qoder'] },
  { name: '@zhushanwen/plugin-wool-trae', specs: ['@zhushanwen/pi-wool-shared/plugin', '@zhushanwen/pi-wool-shared/trae'] },
  { name: '@zhushanwen/plugin-wool-workbuddy', specs: ['@zhushanwen/pi-wool-shared/plugin', '@zhushanwen/pi-wool-shared/workbuddy'] },
]

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    ...options,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (exit ${result.status})\n` +
        `stdout:\n${result.stdout ?? ''}\nstderr:\n${result.stderr ?? ''}`,
    )
  }
  return result
}

function packPackages(tmpDir) {
  const tarballs = []
  for (const check of PACKAGE_CHECKS) {
    const packDir = join(tmpDir, 'pack', check.name.replaceAll('/', '__'))
    mkdirSync(packDir, { recursive: true })
    run('pnpm', ['--filter', check.name, 'pack', '--pack-destination', packDir])
    const files = readdirSync(packDir).filter((file) => file.endsWith('.tgz'))
    if (files.length !== 1) {
      throw new Error(`expected exactly one packed tarball for ${check.name}, got ${files.length}`)
    }
    tarballs.push(join(packDir, files[0]))
  }
  return tarballs
}

function installTarballs(tmpDir, tarballs) {
  const installDir = join(tmpDir, 'install')
  mkdirSync(installDir, { recursive: true })
  writeFileSync(join(installDir, 'package.json'), '{}\n', 'utf8')
  run('npm', [
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--package-lock=false',
    ...tarballs,
  ], { cwd: installDir })
  return installDir
}

const RESOLVE_PROBE = `
const { existsSync } = await import('node:fs')
const { fileURLToPath } = await import('node:url')
const specs = JSON.parse(process.env.PROBE_SPECS)
let failed = false
for (const spec of specs) {
  try {
    const resolved = import.meta.resolve(spec)
    const path = fileURLToPath(resolved)
    if (!existsSync(path)) {
      console.error(\`\${spec}: resolved path does not exist: \${path}\`)
      failed = true
      continue
    }
    console.log(\`\${spec} -> \${path}\`)
  } catch (error) {
    console.error(\`\${spec}: \${error instanceof Error ? error.message : String(error)}\`)
    failed = true
  }
}
process.exit(failed ? 1 : 0)
`

function resolveSpecs(installDir, check) {
  const packageDir = join(installDir, 'node_modules', ...check.name.split('/'))
  if (!existsSync(packageDir)) {
    throw new Error(`packed package was not installed: ${check.name}`)
  }
  run(process.execPath, ['--input-type=module', '--eval', RESOLVE_PROBE], {
    cwd: packageDir,
    env: { ...process.env, PROBE_SPECS: JSON.stringify(check.specs) },
  })
}

// taiji 插件侧加载图入口：必须在零宿主模块、只装 dependencies 的形态下加载成功。
// pi 扩展侧（pi-wool-*）不在此列——pi 宿主进程提供 @earendil-works/* 与 typebox，
// 加载环境无法镜像，仍由解析检查覆盖其子路径映射。
const LOAD_SPECS = [
  '@zhushanwen/pi-wool-shared/plugin',
  '@zhushanwen/plugin-wool-qoder',
  '@zhushanwen/plugin-wool-trae',
  '@zhushanwen/plugin-wool-workbuddy',
]

const LOAD_PROBE = `
const specs = JSON.parse(process.env.PROBE_SPECS)
;(async () => {
  for (const spec of specs) {
    try {
      const mod = await import(spec)
      console.log(spec, '-> loaded,', Object.keys(mod).length, 'exports')
    } catch (error) {
      const message = error instanceof Error ? error.message.split('\\n')[0] : String(error)
      console.error(spec, ': LOAD FAILED:', message, '(code:', error && error.code, ')')
      process.exit(1)
    }
  }
})()
`

function loadSpecs(installDir) {
  // tsx = taiji 插件宿主同款 TS 加载器；major 钉 4 与 taiji 运行时对齐。
  // stdio inherit：加载结果行（-> loaded, N exports）进 CI 日志，失败时首行错误直接可见
  run('npx', ['-y', 'tsx@4', '--eval', LOAD_PROBE], {
    cwd: installDir,
    env: { ...process.env, PROBE_SPECS: JSON.stringify(LOAD_SPECS) },
    stdio: 'inherit',
  })
}

function main() {
  const tmpDir = mkdtempSync(join(tmpdir(), 'wool-package-artifacts-'))
  try {
    const tarballs = packPackages(tmpDir)
    const installDir = installTarballs(tmpDir, tarballs)
    for (const check of PACKAGE_CHECKS) {
      console.log(`[package-artifacts] ${check.name}`)
      resolveSpecs(installDir, check)
    }
    console.log('[package-artifacts] load check (taiji plugin side, deps-only)')
    loadSpecs(installDir)
    console.log(`[package-artifacts] ${PACKAGE_CHECKS.length} packages passed`)
  } finally {
    rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 })
  }
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
