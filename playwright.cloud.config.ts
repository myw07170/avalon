import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser", testMatch: "cloud-recovery.spec.ts", timeout: 60000, workers: 1,
  use: { baseURL: "http://127.0.0.1:3107", headless: true, trace: "retain-on-failure" },
  webServer: {
    command: "node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3107",
    url: "http://127.0.0.1:3107", reuseExistingServer: false, timeout: 120000,
    env: {
      NEXT_PUBLIC_REQUIRE_AUTH: "true", NEXT_PUBLIC_AI_MODE: "remote", LLM_PROVIDER: "mock",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
      SUPABASE_SECRET_KEY: "test-secret-key",
    },
  },
});
