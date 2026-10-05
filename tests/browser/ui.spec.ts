import { test, expect } from "@playwright/test";
import { messagesFor } from "../../src/i18n/messages";
import { ROLE_ORDER } from "../../src/lib/game";

for (const locale of ["zh", "en"] as const) {
  for (const width of [390, 1280]) {
    test.describe(`${locale} own LLM settings at ${width}px`, () => {
      test.use({ locale: locale === "zh" ? "zh-CN" : "en-US", viewport: { width, height: 700 }, reducedMotion: "reduce" });

      test("sidebar LLM dialog keeps session config independent of model calls", async ({ page }) => {
        const msg = messagesFor(locale);
        const llm = msg.auth.userLlm;
        const errors: string[] = [];
        const modelRequests: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.route("**/api/ai", route => {
          modelRequests.push(route.request().url());
          return route.abort();
        });
        await page.goto("/");
        await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });

        const openMenu = async () => {
          if (width < 1024) await page.getByRole("button", { name: msg.ui.menu, exact: true }).click();
        };
        await openMenu();
        const trigger = page.getByRole("button", { name: llm.title, exact: true });
        const modelSwitch = page.getByRole("switch", { name: msg.setup.modelCallsAria, exact: true });
        await expect(trigger).toContainText(llm.off);
        await expect(modelSwitch).toHaveAttribute("aria-checked", "false");
        expect(await trigger.evaluate(element => element.previousElementSibling?.getAttribute("role"))).toBe("switch");

        await trigger.click();
        const dialog = page.getByRole("dialog", { name: llm.title, exact: true });
        const key = dialog.getByLabel(llm.apiKey, { exact: true });
        const model = dialog.getByLabel(llm.model, { exact: true });
        const save = dialog.getByRole("button", { name: llm.save, exact: true });
        await expect(dialog).toBeVisible();
        await expect(key).toHaveAttribute("type", "password");
        await save.click();
        await expect(dialog.getByRole("alert")).toHaveText(llm.error.API_KEY_REQUIRED);
        await key.fill("sk-browser-test-only");
        await save.click();
        await expect(dialog.getByRole("alert")).toHaveText(llm.error.MODEL_REQUIRED);
        await dialog.getByRole("combobox", { name: llm.provider, exact: true }).selectOption("custom");
        await model.fill("test-model");
        await save.click();
        await expect(dialog.getByRole("alert")).toHaveText(llm.error.BASE_URL_REQUIRED);
        await dialog.getByLabel(llm.baseUrl, { exact: true }).fill("https://example.test/v1");
        await dialog.getByLabel(llm.temperature, { exact: true }).fill("default");
        await dialog.getByLabel(llm.maxTokens, { exact: true }).fill("700");
        await dialog.getByRole("textbox", { name: llm.extraBody, exact: true }).fill('{ "model": "override" }');
        await save.click();
        await expect(dialog.getByRole("alert")).toHaveText(llm.error.EXTRA_BODY_RESERVED);
        await dialog.getByRole("textbox", { name: llm.extraBody, exact: true }).fill('{ "reasoning_effort": "minimal" }');
        await save.click();
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole("status")).toHaveText(llm.saved);
        await expect(dialog.getByRole("status")).toBeVisible();
        await expect(dialog.getByRole("button", { name: llm.disable, exact: true })).toBeInViewport();
        await expect(dialog.getByRole("button", { name: llm.clear, exact: true })).toBeInViewport();
        await expect(dialog.getByRole("alert")).toHaveCount(0);
        await page.screenshot({ path: `test-results/ui/llm-${locale}-${width}.png` });
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);

        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
        await expect(trigger).toContainText(llm.enabled);
        await expect(modelSwitch).toHaveAttribute("aria-checked", "false");
        await modelSwitch.click();
        await expect(modelSwitch).toHaveAttribute("aria-checked", "true");
        await expect(trigger).toContainText(llm.enabled);
        await modelSwitch.click();
        await trigger.click();
        await expect(key).toHaveValue("sk-browser-test-only");
        await expect(model).toHaveValue("test-model");
        await model.fill("unsaved-model");
        await dialog.getByRole("button", { name: llm.closeAria, exact: true }).click();
        await expect(trigger).toBeFocused();
        await trigger.click();
        await expect(model).toHaveValue("unsaved-model");
        await dialog.getByRole("button", { name: llm.disable, exact: true }).click();
        await expect(dialog.getByRole("status")).toHaveText(llm.disabled);
        await expect(key).toHaveValue("sk-browser-test-only");
        await expect(model).toHaveValue("unsaved-model");
        await expect(dialog.getByRole("button", { name: llm.disable, exact: true })).toBeDisabled();
        await page.keyboard.press("Escape");
        await expect(trigger).toContainText(llm.off);
        await trigger.click();
        await save.click();
        await dialog.getByRole("button", { name: llm.clear, exact: true }).click();
        await expect(dialog.getByRole("status")).toHaveText(llm.cleared);
        await expect(key).toHaveValue("");
        await expect(model).toHaveValue("");
        await expect(dialog.getByRole("combobox", { name: llm.provider, exact: true })).toHaveValue("openai");
        await key.fill("sk-browser-test-only");
        await model.fill("test-model");
        await save.click();
        await page.keyboard.press("Escape");

        if (width >= 1024) {
          await page.getByRole("button", { name: msg.history.collapseSidebar, exact: true }).click();
          await expect(trigger).toHaveAttribute("title", llm.title);
          await trigger.click();
          await expect(key).toHaveValue("sk-browser-test-only");
          await page.keyboard.press("Escape");
          await expect(trigger).toBeFocused();
          await page.getByRole("button", { name: msg.history.expandSidebar, exact: true }).click();
          await expect(trigger).toContainText(llm.enabled);
        } else {
          await expect(page.getByRole("dialog", { name: msg.app.title, exact: true })).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(page.getByRole("button", { name: msg.ui.menu, exact: true })).toBeFocused();
        }

        expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }).includes("sk-browser-test-only"))).toBe(false);
        await page.reload();
        await openMenu();
        await expect(trigger).toContainText(llm.off);
        await trigger.click();
        await expect(key).toHaveValue("");
        await expect(model).toHaveValue("");
        expect(modelRequests).toEqual([]);
        expect(errors).toEqual([]);
      });
    });
  }
}

for (const locale of ["zh", "en"] as const) {
  for (const width of [390, 768, 1280, 1440]) {
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
        await page.evaluate(() => document.fonts.ready);
        const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        expect(await overflow()).toBe(false);
        const lobbyHeader = page.getByRole("main").locator(":scope > header");
        const checkPanels = async () => {
          const layout = await page.getByRole("main").evaluate((main) => ({
            boxes: Array.from(main.querySelectorAll<HTMLElement>(":scope > .grid > .ui-panel"), (element) => {
              const box = element.getBoundingClientRect();
              return { y: box.y, height: box.height, bottom: box.bottom, clipped: element.scrollHeight > element.clientHeight };
            }),
            bottom: main.getBoundingClientRect().bottom,
            padding: parseFloat(getComputedStyle(main).paddingBottom),
            pageHeight: document.documentElement.scrollHeight,
            scrollY,
          }));
          const boxes = layout.boxes;
          expect(boxes).toHaveLength(2);
          const [seats, setup] = boxes;
          if (width >= 1280) {
            expect(Math.abs(seats!.y - setup!.y)).toBeLessThanOrEqual(1);
            expect(Math.abs(seats!.height - setup!.height)).toBeLessThanOrEqual(1);
            expect(Math.abs(setup!.bottom + layout.padding - layout.bottom)).toBeLessThanOrEqual(1);
            expect(Math.abs(layout.bottom + layout.scrollY - layout.pageHeight)).toBeLessThanOrEqual(1);
            expect(boxes.every((box) => !box.clipped)).toBe(true);
          } else {
            expect(setup!.y).toBeGreaterThanOrEqual(seats!.y + seats!.height);
          }
          expect(await overflow()).toBe(false);
        };
        const checkStartPosition = async (name: string) => {
          await expect(page.getByRole("button", { name, exact: true })).toHaveCount(1);
          const title = await lobbyHeader.getByRole("heading", { name: msg.ui.lobby }).boundingBox();
          const button = await lobbyHeader.getByRole("button", { name, exact: true }).boundingBox();
          expect(title).not.toBeNull();
          expect(button).not.toBeNull();
          expect(button!.x).toBeGreaterThanOrEqual(title!.x + title!.width);
          expect(Math.abs(title!.y + title!.height / 2 - button!.y - button!.height / 2)).toBeLessThanOrEqual(1);
        };
        await checkStartPosition(msg.setup.submit);
        for (const count of [5, 6, 7, 8, 9, 10]) {
          await page.getByRole("radio", { name: String(count), exact: true }).click();
          await expect(page.getByRole("radio", { name: String(count), exact: true })).toHaveAttribute("aria-checked", "true");
          await checkPanels();
          if (count >= 7) {
            const choices = page.getByRole("radiogroup", { name: msg.setup.freeEvilAria }).getByRole("radio");
            const boxes = await choices.evaluateAll((elements) => elements.map((element) => {
              const box = element.getBoundingClientRect();
              return { y: box.y, height: box.height, clipped: element.scrollWidth > element.clientWidth };
            }));
            for (const box of boxes) {
              expect(box.height).toBeGreaterThanOrEqual(44);
              expect(box.clipped).toBe(false);
              if (width >= 1440 || (locale === "zh" && width >= 1280)) {
                expect(Math.abs(box.y - boxes[0]!.y)).toBeLessThanOrEqual(1);
              }
            }
            for (let index = 0; index < boxes.length; index++) {
              await choices.nth(index).click();
              await expect(choices.nth(index)).toHaveAttribute("aria-checked", "true");
              await checkPanels();
            }
            await choices.first().click();
          }
        }
        await page.getByRole("button", { name: msg.setup.standUp, exact: true }).click();
        await checkStartPosition(msg.setup.spectate);
        await checkPanels();
        await page.getByRole("button", { name: msg.setup.sitDown, exact: true }).click();
        await checkPanels();
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
        if (width >= 1280) {
          for (const height of [600, 950, 1200]) {
            await page.setViewportSize({ width, height });
            for (const count of [5, 10]) {
              await page.getByRole("radio", { name: String(count), exact: true }).click();
              await expect(page.getByRole("radio", { name: String(count), exact: true })).toHaveAttribute("aria-checked", "true");
              await checkPanels();
              await page.getByRole("button", { name: msg.setup.standUp, exact: true }).click();
              await expect(page.getByRole("button", { name: msg.setup.spectate, exact: true })).toBeVisible();
              await checkPanels();
              await page.getByRole("button", { name: msg.setup.sitDown, exact: true }).click();
              await expect(page.getByRole("button", { name: msg.setup.submit, exact: true })).toBeVisible();
              await checkPanels();
            }
            expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(height === 600);
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.screenshot({ path: `test-results/ui/lobby-${locale}-${width}-${height}.png`, fullPage: true });
          }
          await page.setViewportSize({ width, height: 950 });
        }
        await page.evaluate(() => window.scrollTo(0, 0));
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
          await checkPanels();
          await page.getByRole("button", { name: msg.history.expandSidebar, exact: true }).click();
          await checkPanels();
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
        await checkPanels();
        if (width >= 1280) {
          await page.setViewportSize({ width, height: 1200 });
          await checkPanels();
          await page.setViewportSize({ width, height: 950 });
        }
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
