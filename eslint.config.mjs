import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // 与 tsconfig 的 noUnusedParameters 保持一致：下划线前缀表示"有意不用"。
      // 引擎里大量存在"实现了接口但这个分支用不到某个参数"的情况。
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // vitest 的覆盖率报告，跑过 pnpm test:cov 之后才存在。
    // 它自带的 block-navigation.js 会报一条 unused eslint-disable，不是我们的代码
    "coverage/**",
  ]),
]);

export default eslintConfig;
