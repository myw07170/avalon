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
      // 只关心引擎的覆盖率，UI 的覆盖率没有参考价值
      include: ["src/lib/game/**", "src/lib/ai/**"],
      reporter: ["text", "html"],
    },
  },
});
