import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { savedGame } from "../active-game.test-helpers";
import type { ActiveGameEnvelope, ActiveGameSnapshot } from "../active-game";
import { runGame } from "../ai/orchestrator";
import { createMockAiClient } from "../ai/mock";
import { createRng } from "../game";

const mocked = vi.hoisted(() => ({ user: "", rpc: vi.fn() }));
vi.mock("./route", () => ({ createSupabaseAdminClient: () => ({ rpc: mocked.rpc }) }));
vi.mock("./auth", () => ({
  AuthError: class extends Error {},
  requireAuthenticatedUser: async () => {
    if (!mocked.user) { const { AuthError } = await import("./auth"); throw new AuthError(); }
    return { userId: mocked.user, responseHeaders: new Headers() };
  },
}));
import { GET, PUT, DELETE } from "@/app/api/active-game/route";
import { POST as resumeRoute } from "@/app/api/active-game/resume/route";
import { POST as finishRoute } from "@/app/api/active-game/finish/route";
import { startActiveGame, verifyActiveGameRequest, authorizeActiveGameAiCall, finishActiveGameFromReviewRequest } from "./active-games";

let db: PGlite;
let user: string;
const request = (method: string, body?: unknown) => new Request("http://localhost/api/active-game", { method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
async function command(operation: string, payload: unknown = {}, owner = user) {
  return db.transaction(async tx => {
    await tx.exec("set local role service_role");
    const result = await tx.query<{ result: ActiveGameEnvelope & { occupied: boolean } }>("select public.active_game_command($1::uuid, $2::text, $3::jsonb) as result", [owner, operation, JSON.stringify(payload)]);
    return result.rows[0]!.result;
  });
}
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    grant usage on schema public, auth to service_role, authenticated, anon;
    grant all on auth.users to service_role;
    alter default privileges in schema public grant all on tables to service_role;
  `);
  const migrations = new URL("../../../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(migrations).filter(f => f.endsWith(".sql")).sort()) await db.exec(readFileSync(new URL(file, migrations), "utf8"));
  mocked.rpc.mockImplementation(async (_name, args) => {
    try { return { data: await command(args.p_operation, args.p_payload, args.p_user_id), error: null }; }
    catch (error) { return { data: null, error: { message: (error as Error).message, code: "P0001" } }; }
  });
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  user = crypto.randomUUID(); mocked.user = user;
  await db.query("insert into auth.users(id) values ($1)", [user]);
});

describe("active game SQL and authenticated routes", () => {
  it("atomically charges once, enforces a single slot and resumes without credits", async () => {
    const snapshot = { ...savedGame(), aiMode: "remote" as const };
    const payload = { snapshot, writerId: crypto.randomUUID() };
    const first = await startActiveGame(user, payload);
    const duplicate = await startActiveGame(user, payload);
    expect(duplicate).toEqual(first);
    const credits = await db.query<{ remaining: number }>("select games_remaining as remaining from public.user_credits where user_id=$1", [user]);
    expect(credits.rows[0]!.remaining).toBe(0);
    await expect(startActiveGame(user, { ...payload, snapshot: savedGame() })).rejects.toMatchObject({ code: "GAME_EXISTS" });
    const resumed = await resumeRoute(request("POST", { gameId: snapshot.gameId, writerId: crypto.randomUUID(), takeover: true }));
    expect(resumed.status).toBe(200);
    expect((await resumed.json()).snapshot.gameSessionId).toBe(first!.snapshot.gameSessionId);
  });
  it("rejects stale epochs and AI requests, but accepts repeated writes", async () => {
    const first = await startActiveGame(user, { snapshot: savedGame(), writerId: crypto.randomUUID() });
    const handle = { ...first!.handle, revision: 1 };
    const snapshot = { ...first!.snapshot, paused: true };
    expect((await PUT(request("PUT", { handle, snapshot }))).status).toBe(200);
    expect((await PUT(request("PUT", { handle, snapshot }))).status).toBe(200);
    expect((await resumeRoute(request("POST", { gameId: handle.gameId, writerId: crypto.randomUUID() }))).status).toBe(409);
    await resumeRoute(request("POST", { gameId: handle.gameId, writerId: crypto.randomUUID(), takeover: true }));
    expect((await PUT(request("PUT", { handle: { ...handle, revision: 2 }, snapshot }))).status).toBe(409);
    await expect(command("heartbeat", handle)).rejects.toThrow("GAME_CONFLICT");
  });
  it("requires the active writer header before an AI call", async () => {
    const first = await startActiveGame(user, { snapshot: { ...savedGame(), aiMode: "remote" }, writerId: crypto.randomUUID() });
    const session = first!.snapshot.gameSessionId!;
    await expect(verifyActiveGameRequest(user, session, null)).rejects.toMatchObject({ code: "GAME_CONFLICT" });
    await expect(verifyActiveGameRequest(user, session, JSON.stringify(first!.handle))).resolves.toBeUndefined();
    await expect(authorizeActiveGameAiCall(user, session, JSON.stringify(first!.handle), "platform")).resolves.toBe(true);
    const usage = await db.query<{ ai_calls_used: number }>("select ai_calls_used from public.game_sessions where id=$1", [session]);
    expect(usage.rows[0]!.ai_calls_used).toBe(1);
    await expect(finishActiveGameFromReviewRequest(user, session, null)).rejects.toMatchObject({ code: "GAME_CONFLICT" });
    await command("resume", { gameId: first!.handle.gameId, writerId: crypto.randomUUID(), takeover: true });
    await expect(verifyActiveGameRequest(user, session, JSON.stringify(first!.handle))).rejects.toMatchObject({ code: "GAME_CONFLICT" });
    await expect(authorizeActiveGameAiCall(user, session, JSON.stringify(first!.handle), "platform")).rejects.toMatchObject({ code: "GAME_CONFLICT" });
    expect((await db.query<{ ai_calls_used: number }>("select ai_calls_used from public.game_sessions where id=$1", [session])).rows[0]!.ai_calls_used).toBe(1);
  });
  it("custom-model sessions preserve game credits and never store an API key", async () => {
    const snapshot = { ...savedGame(), aiMode: "remote" as const, model: { provider: "openai" as const, model: "test-model" } };
    const first = (await startActiveGame(user, { snapshot, writerId: crypto.randomUUID() }))!;
    const credits = await db.query<{ remaining: number }>("select games_remaining as remaining from public.user_credits where user_id=$1", [user]);
    expect(credits.rows[0]!.remaining).toBe(1);
    expect(JSON.stringify(first.snapshot)).not.toContain("apiKey");
    await expect(authorizeActiveGameAiCall(user, first.snapshot.gameSessionId!, JSON.stringify(first.handle), "platform")).rejects.toThrow();
    await expect(authorizeActiveGameAiCall(user, first.snapshot.gameSessionId!, JSON.stringify(first.handle), "user")).resolves.toBe(true);
  });
  it("only merges backups from the current generation, never another device's stale backup", async () => {
    const first = (await startActiveGame(user, { snapshot: savedGame(), writerId: crypto.randomUUID() }))!;
    const backup = { snapshot: { ...first.snapshot, paused: true }, handle: { ...first.handle, revision: 3 } };
    const second = await command("resume", { gameId: first.handle.gameId, writerId: crypto.randomUUID(), takeover: true, backup });
    expect(second.snapshot.paused).toBe(true);
    const third = await command("resume", { gameId: first.handle.gameId, writerId: crypto.randomUUID(), takeover: true, backup: { ...backup, handle: { ...backup.handle, revision: 99 }, snapshot: { ...backup.snapshot, paused: false } } });
    expect(third.snapshot.paused).toBe(true);
  });
  it("does not disclose a different user's game and does not permit browser database access", async () => {
    const first = (await startActiveGame(user, { snapshot: savedGame(), writerId: crypto.randomUUID() }))!;
    mocked.user = crypto.randomUUID();
    await db.query("insert into auth.users(id) values ($1)", [mocked.user]);
    expect(await (await GET(request("GET"))).json()).toEqual({ summary: null });
    expect((await DELETE(request("DELETE", { gameId: first.handle.gameId, takeover: true }))).status).toBe(404);
    mocked.user = "";
    expect((await GET(request("GET"))).status).toBe(401);
    for (const role of ["anon", "authenticated"]) {
      await expect(db.transaction(async tx => { await tx.exec(`set local role ${role}`); await tx.query("select * from public.active_games"); })).rejects.toThrow("permission denied");
      await expect(db.transaction(async tx => { await tx.exec(`set local role ${role}`); await tx.query("select public.active_game_command($1,'read','{}')", [user]); })).rejects.toThrow("permission denied");
    }
  });
  it("rejects invalid checkpoints before storing and never returns hidden roles in summaries", async () => {
    const first = (await startActiveGame(user, { snapshot: savedGame(), writerId: crypto.randomUUID() }))!;
    const summary = await (await GET(request("GET"))).json();
    expect(JSON.stringify(summary)).not.toMatch(/MERLIN|MORGANA|reasoning|rngState/);
    const invalid = { ...first.snapshot, schemaVersion: 99 };
    expect((await PUT(request("PUT", { handle: first.handle, snapshot: invalid }))).status).toBe(400);
  });
  it("lease expiry allows recovery and abandon permanently invalidates old writes", async () => {
    const first = (await startActiveGame(user, { snapshot: savedGame(), writerId: crypto.randomUUID() }))!;
    await db.query("update public.active_games set lease_expires_at=now()-interval '1 second' where user_id=$1", [user]);
    expect((await resumeRoute(request("POST", { gameId: first.handle.gameId, writerId: crypto.randomUUID() }))).status).toBe(200);
    expect((await DELETE(request("DELETE", { gameId: first.handle.gameId, takeover: true }))).status).toBe(200);
    await expect(command("save", { ...first.handle, revision: 1, snapshot: first.snapshot })).rejects.toThrow("GAME_GONE");
    await expect(startActiveGame(user, { snapshot: first.snapshot, writerId: first.handle.writerId })).rejects.toMatchObject({ code: "GAME_GONE" });
  });
  it("finishes and removes the slot atomically; lost completion responses can be retried", async () => {
    const snapshot: ActiveGameSnapshot = { ...savedGame(), aiMode: "remote" };
    const first = (await startActiveGame(user, { snapshot, writerId: crypto.randomUUID() }))!;
    const rng = createRng(snapshot.rngState);
    const final = await runGame({ state: snapshot.checkpoint.state, rng, client: createMockAiClient(rng) });
    await command("save", { ...first.handle, revision: 1, snapshot: { ...first.snapshot, checkpoint: { state: final, batch: null }, rngState: rng.getState() } });
    const handle = { ...first.handle, revision: 1 };
    await expect(command("finish", { ...handle, review: { schemaVersion: 1, summary: { playerCount: 100 } } })).rejects.toThrow();
    expect((await command("read")).handle.gameId).toBe(handle.gameId);
    expect((await db.query<{ status: string }>("select status from public.game_sessions where id=$1", [first.snapshot.gameSessionId])).rows[0]!.status).toBe("active");
    expect((await finishRoute(request("POST", handle))).status).toBe(200);
    expect((await finishRoute(request("POST", handle))).status).toBe(200);
    expect(await command("read")).toBeNull();
    const row = await db.query<{ status: string; review_snapshot: unknown }>("select status, review_snapshot from public.game_sessions where id=$1", [first.snapshot.gameSessionId]);
    expect(row.rows[0]!.status).toBe("ended");
    expect(row.rows[0]!.review_snapshot).toBeTruthy();
  });
});
