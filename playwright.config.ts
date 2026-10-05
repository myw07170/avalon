import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: ["recovery.spec.ts", "preferences.spec.ts", "ui.spec.ts", "review.spec.ts"],
  timeout: 60000,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3107", headless: true, trace: "retain-on-failure" },
  webServer: {
    command: "node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3107",
    url: "http://127.0.0.1:3107", reuseExistingServer: false, timeout: 120000,
    env: { NEXT_PUBLIC_REQUIRE_AUTH: "false", NEXT_PUBLIC_AI_MODE: "mock", LLM_PROVIDER: "mock" },
  },
});
