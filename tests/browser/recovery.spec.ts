import { test, expect, type Page } from "@playwright/test";

const key = "avalon:active-game:v1:local";
const backup = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "null"), key);

test("refresh and save-exit retain the deal and the in-progress human turn", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "入座", exact: true }).click();
  await expect(page.getByRole("button", { name: "保存并退出", exact: true })).toBeVisible();
  const initial = await backup(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "未结束的对局" })).toBeVisible();
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: /继续对局|接管对局/ }).click();
  await expect(page.getByRole("button", { name: "保存并退出", exact: true })).toBeVisible();
  const resumed = await backup(page);
  expect(resumed.snapshot.gameId).toBe(initial.snapshot.gameId);
  expect(resumed.snapshot.checkpoint.state.players).toEqual(initial.snapshot.checkpoint.state.players);
  await page.getByRole("button", { name: "翻开查看身份", exact: true }).click();
  await page.getByRole("button", { name: "记住了，开始", exact: true }).click();
  await expect.poll(async () => (await backup(page))?.snapshot.checkpoint.state.phase).not.toBe("SETUP");
  await page.getByRole("button", { name: "保存并退出", exact: true }).click();
  await expect(page.getByRole("heading", { name: "未结束的对局" })).toBeVisible();
  const saved = await backup(page);
  await page.reload();
  await page.getByRole("button", { name: "继续对局", exact: true }).click();
  await expect(page.getByRole("button", { name: "保存并退出", exact: true })).toBeVisible();
  expect((await backup(page)).snapshot.gameId).toBe(saved.snapshot.gameId);
  expect(errors).toEqual([]);
});

test("a second page explicitly takes over; abandoning does not resurrect the old save", async ({ context, page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "入座", exact: true }).click();
  await expect(page.getByRole("button", { name: "保存并退出", exact: true })).toBeVisible();
  const first = await backup(page);
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByRole("heading", { name: "未结束的对局" })).toBeVisible();
  other.on("dialog", dialog => dialog.accept());
  await other.getByRole("button", { name: "接管对局", exact: true }).click();
  await expect(other.getByRole("button", { name: "保存并退出", exact: true })).toBeVisible();
  expect((await backup(other)).handle.epoch).toBeGreaterThan(first.handle.epoch);
  await page.getByRole("button", { name: "保存并退出", exact: true }).click();
  await expect(page.getByText("当前页面已失去对局控制权，请从首页重新继续。", { exact: true })).toBeVisible();
  await other.getByRole("button", { name: "保存并退出", exact: true }).click();
  await other.getByRole("button", { name: "放弃对局", exact: true }).click();
  await expect(other.getByRole("heading", { name: "未结束的对局" })).toHaveCount(0);
  expect(await backup(other)).toBeNull();
  await page.reload();
  await expect(page.getByRole("heading", { name: "未结束的对局" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "入座", exact: true })).toBeEnabled();
});
