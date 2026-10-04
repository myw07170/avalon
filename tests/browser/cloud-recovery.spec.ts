import { test, expect, type Page } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { createServer, type Server } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Isolated Auth/PostgREST test double backed by real Postgres. The browser and
// Next.js routes are unmodified; no real account, provider or deployment is used.
let db: PGlite;
let server: Server;
const userId = "e7c4a23f-07f6-4f5c-a187-2c3321fc7f62";
const testUser = { id: userId, aud: "authenticated", role: "authenticated", email: "recovery@example.test", email_confirmed_at: new Date().toISOString(), app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, identities: [], created_at: new Date().toISOString() };
const token = () => `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, aud: "authenticated", role: "authenticated", email: testUser.email, exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) })).toString("base64url")}.dGVzdA`;

test.beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    grant usage on schema public, auth to service_role, authenticated, anon;
    grant all on auth.users to service_role;
    alter default privileges in schema public grant all on tables to service_role;`);
  const migrations = join(process.cwd(), "supabase", "migrations");
  for (const file of readdirSync(migrations).filter(f => f.endsWith(".sql")).sort()) await db.exec(readFileSync(join(migrations, file), "utf8"));
  await db.query("insert into auth.users(id) values ($1)", [userId]);
  server = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "authorization,apikey,content-type,x-client-info,x-supabase-api-version");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Content-Type", "application/json");
    if (req.method === "OPTIONS") { res.end("{}"); return; }
    const url = new URL(req.url!, "http://127.0.0.1:54329");
    const reply = (value: unknown, status = 200) => { res.statusCode = status; res.end(JSON.stringify(value)); };
    try {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = raw ? JSON.parse(raw) : {};
      if (url.pathname === "/auth/v1/token") { reply({ access_token: token(), refresh_token: "test-refresh-token", token_type: "bearer", expires_in: 3600, user: testUser }); return; }
      if (url.pathname === "/auth/v1/user") { reply(testUser); return; }
      if (url.pathname === "/auth/v1/logout") { reply({}); return; }
      if (url.pathname === "/rest/v1/rpc/active_game_command") {
        const value = await db.transaction(async tx => {
          await tx.exec("set local role service_role");
          const result = await tx.query<{ result: unknown }>("select public.active_game_command($1,$2,$3) as result", [body.p_user_id, body.p_operation, JSON.stringify(body.p_payload)]);
          return result.rows[0]!.result;
        });
        reply(value); return;
      }
      if (url.pathname === "/rest/v1/user_credits") {
        if (req.method === "POST") { reply({ code: "23505", message: "duplicate" }, 409); return; }
        const result = await db.query("select free_games_remaining,purchased_games_remaining from public.user_credits where user_id=$1", [userId]);
        reply(result.rows[0]); return;
      }
      if (url.pathname === "/rest/v1/game_sessions") { reply([]); return; }
      reply({ message: `Unhandled test endpoint: ${url.pathname}` }, 404);
    } catch (error) { reply({ code: "P0001", message: (error as Error).message }, 400); }
  });
  await new Promise<void>(resolve => server.listen(54329, "127.0.0.1", resolve));
});
test.afterAll(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  await db?.close();
});

async function signIn(page: Page) {
  await page.goto("/");
  await page.locator('input[type="email"]').fill(testUser.email);
  await page.locator('input[type="password"]').fill("test-password");
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByRole("button", { name: "入座", exact: true })).toBeVisible();
}

test("two browsers recover the same paid session, take over, and keep the original quota", async ({ browser }) => {
  const firstContext = await browser.newContext({ locale: "zh-CN" });
  const secondContext = await browser.newContext({ locale: "zh-CN" });
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();
  try {
    await signIn(first);
    await first.getByRole("button", { name: "入座", exact: true }).click();
    await expect(first.getByRole("button", { name: "保存并退出", exact: true })).toBeVisible();
    const stored = await db.query<{ game_session_id: string; snapshot: { gameId: string } }>("select game_session_id,snapshot from public.active_games where user_id=$1", [userId]);
    const sessionId = stored.rows[0]!.game_session_id;
    expect(sessionId).toBeTruthy();
    await signIn(second);
    await expect(second.getByRole("heading", { name: "未结束的对局" })).toBeVisible();
    second.on("dialog", dialog => dialog.accept());
    await second.getByRole("button", { name: "接管对局", exact: true }).click();
    await expect(second.getByRole("button", { name: "保存并退出", exact: true })).toBeVisible();
    await first.getByRole("button", { name: "保存并退出", exact: true }).click();
    await expect(first.getByText("当前页面已失去对局控制权，请从首页重新继续。", { exact: true })).toBeVisible();
    await second.reload();
    await second.getByRole("button", { name: /继续对局|接管对局/ }).click();
    await expect(second.getByRole("button", { name: "保存并退出", exact: true })).toBeVisible();
    await second.getByRole("button", { name: "翻开查看身份", exact: true }).click();
    await second.getByRole("button", { name: "记住了，开始", exact: true }).click();
    await expect.poll(async () => {
      const state = await db.query<{ phase: string }>("select snapshot->'checkpoint'->'state'->>'phase' as phase from public.active_games where user_id=$1", [userId]);
      return state.rows[0]?.phase;
    }).not.toBe("SETUP");
    await second.getByRole("button", { name: "保存并退出", exact: true }).click();
    await expect(second.getByRole("heading", { name: "未结束的对局" })).toBeVisible();
    const row = await db.query<{ game_session_id: string }>("select game_session_id from public.active_games where user_id=$1", [userId]);
    expect(row.rows[0]!.game_session_id).toBe(sessionId);
    const credits = await db.query<{ remaining: number }>("select free_games_remaining as remaining from public.user_credits where user_id=$1", [userId]);
    expect(credits.rows[0]!.remaining).toBe(0);
    const sessions = await db.query<{ count: number }>("select count(*)::int as count from public.game_sessions where user_id=$1", [userId]);
    expect(sessions.rows[0]!.count).toBe(1);
  } finally { await firstContext.close(); await secondContext.close(); }
});
