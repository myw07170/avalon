import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // 引擎是纯函数，不需要 DOM。等阶段 5 写组件测试时再按目录切 environment
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    coverage: {
      provider: "v8",
      // 只关心引擎与 store 的覆盖率，组件的覆盖率没有参考价值。
      // store 算在内是因为它是驱动层：泄漏闸和人类动作桥都在那里。
      // 限定 .ts 是必须的：glob 到 phases/README.md 会让 v8 provider 报 PARSE_ERROR
      include: [
        "src/lib/game/**/*.ts",
        "src/lib/ai/**/*.ts",
        "src/lib/sim/**/*.ts",
        "src/store/**/*.ts",
      ],
      exclude: ["**/*.test.ts"],
      reporter: ["text", "html"],
    },
  },
});
