import { test, expect } from "@playwright/test";
import { savedGame } from "../../src/lib/active-game.test-helpers";
import { createMockAiClient } from "../../src/lib/ai/mock";
import { createRng } from "../../src/lib/game/rng";
import type { AiDecisionKind, AiDecisionRequest } from "../../src/lib/game/types";

test.use({ locale: "zh-CN", viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });

const key = "avalon:active-game:v1:local";
for (const humanSeat of [null, 0]) {
  for (const code of ["PROVIDER_TIMEOUT", "PROVIDER_UNAVAILABLE"]) {
    test(`${humanSeat === null ? "spectator" : "player"} retains the table after ${code} and retries the same turn`, async ({ page }) => {
      const snapshot = savedGame(1, humanSeat);
      snapshot.locale = "zh";
      snapshot.aiMode = "remote";
      snapshot.model = {
        provider: "qwen", model: "qwen3.8-max",
        baseUrl: "https://token-plan.maas.qwencloudapi.com/compatible-mode/v1",
      };
      // Keep the first two decisions on AI seats in both game modes.
      snapshot.checkpoint.state.currentLeaderId = 1;
      const backup = { snapshot, handle: { gameId: snapshot.gameId, writerId: "fixture", epoch: 1, revision: 0 }, leaseUntil: 0 };
      await page.addInitScript(({ key, backup }) => {
        if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(backup));
      }, { key, backup });
      const mock = createMockAiClient(createRng(42));
      const requests: Array<AiDecisionRequest<AiDecisionKind>> = [];
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/api/ai", async route => {
        const req = route.request().postDataJSON();
        requests.push(req);
        expect(req.userLlmConfig).toMatchObject({ ...snapshot.model, apiKey: "browser-test-only" });
        const success = requests.length === 2;
        await route.fulfill({ status: success ? 200 : 502, json: success ? await mock.decide(req) : { code } });
      });
      await page.goto("/");
      await page.getByLabel("原模型 API Key", { exact: true }).fill("browser-test-only");
      await page.getByRole("button", { name: "继续对局", exact: true }).click();
      if (humanSeat === null) {
        await page.getByRole("button", { name: "开始观战", exact: true }).click();
      } else {
        await page.getByRole("button", { name: "翻开查看身份", exact: true }).click();
        await page.getByRole("button", { name: "记住了，开始", exact: true }).click();
      }
      const retry = page.getByRole("button", { name: "重试", exact: true });
      await expect(retry).toBeVisible();
      await expect(page.getByRole("alert").filter({ hasText: code })).toBeVisible();
      await expect(page.getByRole("button", { name: "保存并退出", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "入座", exact: true })).toHaveCount(0);
      await retry.click();
      await expect.poll(() => requests.length).toBe(3);
      await expect(retry).toBeVisible();
      expect(requests[1]).toEqual(requests[0]);
      const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key);
      expect(saved.snapshot.gameId).toBe(snapshot.gameId);
      expect(saved.snapshot.checkpoint.state.players).toEqual(snapshot.checkpoint.state.players);
      expect(saved.snapshot.decisions).toHaveLength(1);
      expect(JSON.stringify(saved)).not.toContain("browser-test-only");
      await page.getByRole("button", { name: "保存并退出", exact: true }).click();
      await expect(page.getByRole("heading", { name: "未结束的对局" })).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
}
