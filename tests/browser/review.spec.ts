import { test, expect } from "@playwright/test";
import { createConfig, createGame, createRng, makePlaceholderPersonas, toPlayerView, toSpectatorView } from "../../src/lib/game";
import { createMockAiClient } from "../../src/lib/ai/mock";
import { runGame, type DecisionRecord } from "../../src/lib/ai/orchestrator";
import { createSavedReviewSnapshot } from "../../src/lib/reviews";
import { describeGameOver } from "../../src/components/game-over-model";
import { describeReviewRounds } from "../../src/components/review-round-model";
import { messagesFor } from "../../src/i18n/messages";

async function fixture(locale: "zh" | "en", spectator = false, noDecisions = false) {
  const rng = createRng(7);
  const state = createGame({ config: createConfig(10, { seed: 7 }), humanSeat: null, personas: makePlaceholderPersonas(10), rng });
  const decisions: DecisionRecord[] = [];
  const final = await runGame({ state, client: createMockAiClient(rng), rng, locale, hooks: { onDecision: (record) => { decisions.push(record); } } });
  const view = spectator ? toSpectatorView(final) : toPlayerView(final, 0);
  return createSavedReviewSnapshot({ view, decisions: noDecisions ? [] : decisions, avatarSeed: 17 })!;
}

for (const locale of ["zh", "en"] as const) {
  for (const width of [390, 768, 1440]) {
    test.describe(`${locale} review at ${width}px`, () => {
      test.use({ locale: locale === "zh" ? "zh-CN" : "en-US", viewport: { width, height: 950 }, reducedMotion: "reduce" });
      test("overview, paired reasoning, round navigation and full text", async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const snapshot = await fixture(locale);
        const msg = messagesFor(locale);
        const brief = describeGameOver(snapshot.view, snapshot.decisions, msg)!;
        const rounds = describeReviewRounds(brief, msg);
        expect(rounds.length).toBeGreaterThan(1);
        await page.route("**/api/game-sessions/*/review", (route) => route.fulfill({ json: { review: snapshot } }));
        await page.goto("/reviews/ui-fixture");
        await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
        await expect(page.getByRole("tab", { name: msg.ui.overview, exact: true })).toHaveAttribute("aria-selected", "true");
        await expect(page.getByRole("heading", { name: msg.gameOver.allRoles, exact: true })).toBeVisible();
        await expect(page.locator("[data-role-art]")).toHaveCount(snapshot.view.players.length);
        await expect(page.getByText(msg.gameOver.reviewTitle, { exact: true })).toHaveCount(0);
        const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        expect(await overflow()).toBe(false);
        await page.screenshot({ path: `test-results/ui/review-overview-${locale}-${width}.png`, fullPage: true });

        const first = rounds[0]!;
        await page.getByRole("tab", { name: first.label, exact: true }).click();
        const panel = page.getByRole("tabpanel");
        await expect(panel.getByRole("heading", { name: `${first.label} · ${msg.gameOver.reviewTitle}`, exact: true })).toBeVisible();
        await expect.poll(async () => (await panel.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(0);
        await expect(panel.getByRole("table").locator("tbody tr")).toHaveCount(first.matrix.rows.length);
        const speeches = first.items.filter((item) => item.type === "speech");
        const paired = speeches.find((item) => item.mind && item.entry.content);
        expect(paired).toBeDefined();
        await expect(panel.getByText(paired!.entry.content, { exact: true }).first()).toBeVisible();
        await expect(panel.getByText(paired!.mind!.reasoning, { exact: true }).first()).toBeVisible();
        await page.screenshot({ path: `test-results/ui/review-round-viewport-${locale}-${width}.png` });
        await page.screenshot({ path: `test-results/ui/review-round-${locale}-${width}.png`, fullPage: true });
        expect(await overflow()).toBe(false);

        if (first.tail.length) {
          await panel.locator("details").last().locator("summary").click();
          await expect(panel.getByText(first.tail[0]!.reasoning, { exact: true }).first()).toBeVisible();
        }
        await page.getByRole("tab", { name: first.label, exact: true }).focus();
        await page.keyboard.press("End");
        await expect(page.getByRole("tab", { name: rounds.at(-1)!.label, exact: true })).toHaveAttribute("aria-selected", "true");
        await expect(page.getByRole("button", { name: msg.ui.next, exact: true })).toBeDisabled();
        if (!rounds.at(-1)!.mission) await expect(panel.getByText(msg.ui.noMission, { exact: true })).toBeVisible();
        await page.keyboard.press("Home");
        await expect(page.getByRole("tab", { name: msg.ui.overview, exact: true })).toHaveAttribute("aria-selected", "true");
        await expect(page.getByRole("button", { name: msg.ui.previous, exact: true })).toBeDisabled();
        await page.keyboard.press("ArrowRight");
        await expect(page.getByRole("tab", { name: first.label, exact: true })).toHaveAttribute("aria-selected", "true");
        await page.keyboard.press("ArrowLeft");
        await expect(page.getByRole("tab", { name: msg.ui.overview, exact: true })).toHaveAttribute("aria-selected", "true");
        expect(errors).toEqual([]);
      });
    });
  }
}

test("spectator review works without model decisions", async ({ page }) => {
  const snapshot = await fixture("en", true, true);
  await page.addInitScript(() => localStorage.setItem("avalon.locale", "en"));
  await page.route("**/api/game-sessions/*/review", (route) => route.fulfill({ json: { review: snapshot } }));
  await page.goto("/reviews/no-decisions");
  const msg = messagesFor("en");
  await expect(page.getByText(msg.gameOver.spectated, { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: msg.common.round(1), exact: true }).click();
  await expect(page.getByText(msg.ui.noReasoning, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: `${msg.common.round(1)} · ${msg.gameOver.reviewTitle}` })).toBeVisible();
});

test("review loading failure offers a working home link", async ({ page }) => {
  await page.route("**/api/game-sessions/*/review", (route) => route.fulfill({ status: 404, json: { error: "Review unavailable" } }));
  await page.goto("/reviews/missing");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Review unavailable");
  await page.getByRole("main").getByRole("link").click();
  await expect(page.getByRole("heading", { name: /圆桌大厅|Round table lobby/ })).toBeVisible();
});
