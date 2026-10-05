import { test, expect, type Page } from "@playwright/test";

test.use({ colorScheme: "dark" });

const errorsByPage = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  errorsByPage.set(page, errors);
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (/hydration|hydrated|did not match|server rendered/i.test(message.text())) {
      errors.push(message.text());
    }
  });
});

test.afterEach(async ({ page }) => {
  expect(errorsByPage.get(page)).toEqual([]);
});

async function expectLocale(page: Page, locale: "zh" | "en") {
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-locale", locale);
  await expect(html).toHaveAttribute("lang", locale === "zh" ? "zh-CN" : "en");
  await expect(page).toHaveTitle(locale === "zh" ? "阿瓦隆" : "Avalon");
  await expect(page.getByRole("button", {
    name: locale === "zh" ? "Switch to English" : "切换到中文", exact: true,
  })).toBeVisible();
  await expect(page.getByRole("button", {
    name: locale === "zh" ? "入座" : "Take the seat", exact: true,
  })).toBeVisible();
}

for (const { browserLocale, locale } of [
  { browserLocale: "zh-CN", locale: "zh" },
  { browserLocale: "zh-TW", locale: "zh" },
  { browserLocale: "en-US", locale: "en" },
  { browserLocale: "ja-JP", locale: "en" },
] as const) {
  test.describe(browserLocale, () => {
    test.use({ locale: browserLocale });

    test("first visit uses browser language and the fixed midnight palette", async ({ page }) => {
      await page.goto("/");
      await expectLocale(page, locale);
      await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
      await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
      await expect(page.locator("body")).toHaveCSS("background-color", "rgb(7, 20, 33)");
      expect(await page.evaluate(() => [
        localStorage.getItem("avalon.locale"), localStorage.getItem("avalon.theme"),
      ])).toEqual([null, null]);
      await page.reload();
      await expectLocale(page, locale);
      await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
    });
  });
}

test("invalid saved language follows the first supported browser preference", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("avalon.locale", "fr");
    Object.defineProperty(navigator, "languages", { value: ["ja-JP", "zh-HK", "en-US"] });
  });
  await page.goto("/");
  await expectLocale(page, "zh");
  expect(await page.evaluate(() => localStorage.getItem("avalon.locale"))).toBe("fr");
});

test.describe("English browser", () => {
  test.use({ locale: "en-US" });

  test("manual language choice survives refresh", async ({ page }) => {
    await page.goto("/");
    await expectLocale(page, "en");
    await page.getByRole("button", { name: "切换到中文", exact: true }).click();
    await expectLocale(page, "zh");
    await page.reload();
    await expectLocale(page, "zh");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(7, 20, 33)");
    await page.getByRole("button", { name: "Switch to English", exact: true }).click();
    await page.reload();
    await expectLocale(page, "en");
  });

  test("new games use the detected language and recovery preserves it after a UI language change", async ({ page }) => {
    const key = "avalon:active-game:v1:local";
    const savedLocale = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "null")?.snapshot.locale, key);
    await page.goto("/");
    await expectLocale(page, "en");
    await page.getByRole("button", { name: "Take the seat", exact: true }).click();
    await expect(page.getByRole("button", { name: "Save and exit", exact: true })).toBeVisible();
    await expect.poll(savedLocale).toBe("en");
    await page.getByRole("button", { name: "Save and exit", exact: true }).click();
    await page.getByRole("button", { name: "切换到中文", exact: true }).click();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-locale", "zh");
    await page.getByRole("button", { name: "继续对局", exact: true }).click();
    await expect(page.getByRole("button", { name: "保存并退出", exact: true })).toBeVisible();
    await expect.poll(savedLocale).toBe("en");
  });
});

for (const colorScheme of ["dark", "light"] as const) {
  test.describe(`system ${colorScheme}`, () => {
    test.use({ colorScheme });
    for (const saved of ["light", "dark", "invalid"] as const) {
      test(`ignores legacy theme ${saved}`, async ({ page }) => {
        await page.addInitScript((value) => localStorage.setItem("avalon.theme", value), saved);
        await page.goto("/");
        await expect(page.locator("body")).toHaveCSS("background-color", "rgb(7, 20, 33)");
        await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
        await expect(page.getByRole("button", { name: /Toggle theme|切换主题/ })).toHaveCount(0);
        await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#071421");
        await page.reload();
        await expect(page.locator("body")).toHaveCSS("background-color", "rgb(7, 20, 33)");
      });
    }
  });
}
