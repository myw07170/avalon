import { test, expect } from "@playwright/test";
import { messagesFor } from "../../src/i18n/messages";
import { ROLE_ORDER } from "../../src/lib/game";

for (const locale of ["zh", "en"] as const) {
  for (const width of [390, 768, 1440]) {
    test.describe(`${locale} lobby at ${width}px`, () => {
      test.use({ locale: locale === "zh" ? "zh-CN" : "en-US", viewport: { width, height: 950 }, reducedMotion: "reduce" });
      test("responsive lobby, menu, tutorial, identity and saved-game placement", async ({ page }) => {
        const errors: string[] = [];
        const missingArt: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("response", (response) => { if (response.url().includes("/art/") && response.status() !== 200) missingArt.push(response.url()); });
        const msg = messagesFor(locale);
        await page.goto("/");
        await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
        await expect(page.getByRole("heading", { name: msg.ui.lobby })).toBeVisible();
        const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        expect(await overflow()).toBe(false);
        await page.getByRole("radio", { name: "10", exact: true }).click();
        await expect(page.getByRole("radio", { name: "10", exact: true })).toHaveAttribute("aria-checked", "true");
        await expect(page.getByRole("radio", { name: "10", exact: true })).not.toHaveCSS("box-shadow", "none");
        await expect(page.getByRole("radio", { name: "10", exact: true })).toHaveCSS("opacity", "1");
        await expect(page.locator(".ui-panel").first()).toHaveCSS("background-color", "rgb(11, 29, 43)");
        const faces = await page.locator("[data-portrait-index]:visible").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-portrait-index")));
        expect(new Set(faces).size).toBe(10);
        if (width >= 640) await expect(page.locator(".round-table-art").first()).toHaveCSS("background-image", /round-table\.png/);
        await expect(page.getByRole("button", { name: msg.setup.submit, exact: true })).toHaveCSS("background-image", /linear-gradient/);
        await expect(page.getByRole("button", { name: msg.setup.submit, exact: true })).toHaveCSS("border-top-width", "1px");
        await page.screenshot({ path: `test-results/ui/lobby-${locale}-${width}.png`, fullPage: true });

        if (width < 1024) {
          const trigger = page.getByRole("button", { name: msg.ui.menu, exact: true });
          await trigger.click();
          await expect(page.getByRole("dialog")).toBeVisible();
          await expect(page.getByRole("dialog").getByRole("heading", { name: msg.history.title })).toBeVisible();
          await page.screenshot({ path: `test-results/ui/menu-${locale}-${width}.png` });
          await page.keyboard.press("Escape");
          await expect(page.getByRole("dialog")).toHaveCount(0);
          await expect(trigger).toBeFocused();
          await trigger.click();
          await page.getByRole("button", { name: msg.ui.closeMenu, exact: true }).click();
          await expect(trigger).toBeFocused();
          await trigger.click();
          await page.mouse.click(width - 8, 400);
          await expect(page.getByRole("dialog")).toHaveCount(0);
          await expect(trigger).toBeFocused();
        } else {
          await expect(page.getByRole("button", { name: msg.ui.menu, exact: true })).toBeHidden();
          await page.getByRole("button", { name: msg.history.collapseSidebar, exact: true }).click();
          await expect(page.getByRole("button", { name: msg.history.expandSidebar, exact: true })).toBeVisible();
          await page.getByRole("button", { name: msg.history.expandSidebar, exact: true }).click();
        }

        await page.getByRole("button", { name: msg.tutorial.triggerAria, exact: true }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await expect(page.locator(".dialog-veil")).toHaveCSS("background-color", "rgb(6, 17, 27)");
        await expect(page.locator(".dialog-veil")).toHaveCSS("backdrop-filter", "none");
        await expect(page.getByRole("button", { name: msg.tutorial.closeAria, exact: true })).toHaveCSS("background-color", "rgb(11, 29, 43)");
        expect(await overflow()).toBe(false);
        await page.screenshot({ path: `test-results/ui/tutorial-${locale}-${width}.png` });
        await page.getByRole("button", { name: msg.tutorial.stepAria(4, 4, msg.tutorial.steps.roles.tab), exact: true }).click();
        for (const role of ROLE_ORDER) {
          await page.getByRole("radio", { name: msg.roles[role].label, exact: true }).click();
          await expect(page.locator("[data-role-art]")).toHaveAttribute("data-role-art", role);
        }
        await page.screenshot({ path: `test-results/ui/tutorial-roles-${locale}-${width}.png` });
        await page.keyboard.press("Escape");
        await page.getByRole("button", { name: msg.setup.submit, exact: true }).click();
        await expect(page.getByRole("button", { name: msg.role.flipToFront, exact: true })).toBeVisible();
        await expect(page.locator("[data-role-art]")).toHaveCount(0);
        await page.screenshot({ path: `test-results/ui/identity-${locale}-${width}.png`, fullPage: true });
        await page.getByRole("button", { name: msg.role.flipToFront, exact: true }).click();
        await expect(page.locator("[data-role-art]")).toHaveCount(1);
        await expect(page.locator(".role-portrait")).toHaveCSS("background-image", /role-portraits\.png/);
        await page.screenshot({ path: `test-results/ui/identity-revealed-${locale}-${width}.png`, fullPage: true });
        await page.getByRole("button", { name: msg.role.start, exact: true }).click();
        await expect(page.getByRole("heading", { name: msg.feed.title, exact: true })).toBeVisible();
        expect(await overflow()).toBe(false);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: `test-results/ui/game-${locale}-${width}.png`, fullPage: true });
        await page.getByRole("button", { name: msg.recovery.saveExit, exact: true }).click();
        const recovery = page.getByRole("region", { name: msg.recovery.title, exact: true });
        await expect(recovery).toBeVisible();
        await expect(page.getByRole("main").getByRole("region", { name: msg.recovery.title })).toBeVisible();
        await expect(page.getByRole("button", { name: msg.setup.submit, exact: true })).toBeDisabled();
        await expect(page.getByRole("button", { name: msg.setup.submit, exact: true })).toHaveCSS("background-image", "none");
        await expect(page.getByRole("button", { name: msg.setup.submit, exact: true })).toHaveCSS("background-color", "rgb(19, 37, 50)");
        await expect(page.getByRole("button", { name: msg.setup.submit, exact: true })).toHaveCSS("opacity", "1");
        await page.screenshot({ path: `test-results/ui/recovery-${locale}-${width}.png`, fullPage: true });
        expect(await overflow()).toBe(false);
        expect(errors).toEqual([]);
        expect(missingArt).toEqual([]);
      });
    });
  }
}

test("live player table and spectator controls remain usable", async ({ page }) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.addInitScript(() => localStorage.setItem("avalon.locale", "en"));
  const msg = messagesFor("en");
  await page.goto("/");
  await page.getByRole("button", { name: msg.setup.submit, exact: true }).click();
  await page.getByRole("button", { name: msg.role.flipToFront, exact: true }).click();
  await page.getByRole("button", { name: msg.role.start, exact: true }).click();
  await expect(page.getByRole("heading", { name: msg.feed.title, exact: true })).toBeVisible();
  const portraits = () => page.locator("[data-portrait-index]:visible").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-portrait-index")));
  const beforeSaving = await portraits();
  await page.screenshot({ path: "test-results/ui/player-table.png", fullPage: true });
  await page.getByRole("button", { name: msg.recovery.saveExit, exact: true }).click();
  await page.getByRole("button", { name: msg.recovery.resume, exact: true }).click();
  await expect(page.getByRole("heading", { name: msg.feed.title, exact: true })).toBeVisible();
  expect(await portraits()).toEqual(beforeSaving);
  await page.getByRole("button", { name: msg.recovery.saveExit, exact: true }).click();
  await page.getByRole("button", { name: msg.recovery.abandon, exact: true }).click();
  await expect(page.getByRole("heading", { name: msg.recovery.title, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: msg.setup.standUp, exact: true }).click();
  await page.getByRole("button", { name: msg.setup.spectate, exact: true }).click();
  await expect(page.getByRole("heading", { name: msg.spectator.introTitle, exact: true })).toBeVisible();
  await page.getByRole("button", { name: msg.spectator.start, exact: true }).click();
  await page.getByRole("button", { name: msg.spectator.pause, exact: true }).click();
  await expect(page.getByRole("button", { name: msg.spectator.resume, exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-role-art]")).toHaveCount(0);
  await page.getByRole("button", { name: msg.spectator.flipAria(0), exact: true }).click();
  await expect(page.locator("[data-role-art]")).toHaveCount(1);
  await page.screenshot({ path: "test-results/ui/spectator-table.png", fullPage: true });
  await page.getByRole("button", { name: msg.recovery.saveExit, exact: true }).click();
  await expect(page.getByRole("heading", { name: msg.recovery.title, exact: true })).toBeVisible();
});

test("password page shares navigation and shows validation clearly", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 950 });
  await page.addInitScript(() => localStorage.setItem("avalon.locale", "en"));
  const msg = messagesFor("en");
  await page.goto("/account/update-password");
  await expect(page.getByRole("heading", { name: msg.auth.updatePasswordTitle })).toBeVisible();
  await expect(page.getByRole("navigation", { name: msg.ui.navigation })).toBeVisible();
  await page.getByLabel(msg.auth.newPassword, { exact: true }).fill("test-password");
  await expect(page.getByLabel(msg.auth.newPassword, { exact: true })).toHaveCSS("background-color", "rgb(7, 20, 33)");
  await expect(page.getByLabel(msg.auth.newPassword, { exact: true })).toHaveCSS("outline-color", "rgb(222, 192, 130)");
  await page.getByLabel(msg.auth.confirmPassword, { exact: true }).fill("different-password");
  await page.getByRole("button", { name: msg.auth.updatePasswordSubmit, exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(msg.auth.passwordMismatch);
  await page.screenshot({ path: "test-results/ui/password-390.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
