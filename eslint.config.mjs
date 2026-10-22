// tai-ji-plugin 独立仓 eslint 配置——typescript-eslint 基线（最小自足形态）。
// 主仓 1016 行配置深度耦合主仓结构专属规则（taste-lint / store 边界 / C-ext 族），
// 不迁移；羊毛包代码迁移前已过主仓全量 lint，本配置作为新产线的独立基线，后续按
// 新仓自身需要增补（AGENTS.md「编码规范」节）。
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**', 'test-results/**'],
  },
  ...tseslint.configs.recommended.map((c) => ({
    ...c,
    files: ['**/*.ts'],
  })),
  {
    files: ['**/*.ts'],
    rules: {
      // 对齐主仓编码红线：禁止 any（用 unknown 或具体类型）；未用变量报错。
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/__tests__/**/*.ts', 'test-guard/**/*.ts'],
    rules: {
      // 测试与防线代码允许非空断言（fixture 形态断言常见）
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
)
