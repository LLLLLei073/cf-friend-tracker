import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import security from 'eslint-plugin-security';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'out/**',
      'out.old*/**',
      'dist/**',
      'latest.yml',
      '*.log',
      'src/renderer/public/**',
    ],
  },

  // 基础推荐（ES 规则）
  js.configs.recommended,

  // TypeScript 推荐
  ...tseslint.configs.recommended,

  // 安全规则
  {
    plugins: { security },
    rules: security.configs.recommended.rules,
  },

  // React Hooks（仅渲染层）
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // 与 Prettier 冲突的格式规则关掉（格式交给 Prettier）
  prettier,

  // 项目统一收口规则
  {
    rules: {
      // TS 已处理未定义名；避免 Node/浏览器全局的误报
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // 不强制 0 个 any，但提示（评审红线仍需人工把关）
      '@typescript-eslint/no-explicit-any': 'warn',

      // ---- 地化关闭：这些推荐规则与 Electron 主进程/本项目写法冲突，属误报 ----
      // 主进程合法使用 require()（CommonJS 兼容目标）
      '@typescript-eslint/no-require-imports': 'off',
      // catch 里 `throw e` 向上传播 IPC 错误是正确做法，不强制带 {cause} 重抛
      // （ESLint 10 核心规则，裸名）
      'preserve-caught-error': 'off',
      // 副作用守卫的赋值（如防重复注入的全局标记）被误报
      'no-useless-assignment': 'off',
    },
  },
);
