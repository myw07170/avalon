import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("./route", () => ({
  createSupabaseAdminClient: () => ({ from: mocked.from }),
}));
import { readUserCredits } from "./quota";

let db: PGlite;
const existingSessionUser = crypto.randomUUID();
let existingSessionId: string;
const existingBalances = [
  { free: 0, purchased: 0, remaining: 0, user: crypto.randomUUID() },
  { free: 1, purchased: 0, remaining: 1, user: crypto.randomUUID() },
  { free: 0, purchased: 2, remaining: 2, user: crypto.randomUUID() },
  { free: 1, purchased: 2, remaining: 3, user: crypto.randomUUID() },
];

async function serviceQuery<T>(sql: string, params: unknown[]) {
  return db.transaction(async tx => {
    await tx.exec("set local role service_role");
    return tx.query<T>(sql, params);
  });
}

async function newUser() {
  const user = crypto.randomUUID();
  await db.query("insert into auth.users(id) values ($1)", [user]);
  return user;
}

async function remaining(user: string) {
  const result = await db.query<{ games_remaining: number }>(
    "select games_remaining from public.user_credits where user_id=$1", [user],
  );
  return result.rows[0]!.games_remaining;
}

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to service_role, authenticated, anon;
    grant all on auth.users to service_role;
    alter default privileges in schema public grant all on tables to service_role;
  `);
  const migrations = new URL("../../../supabase/migrations/", import.meta.url);
  const files = readdirSync(migrations).filter(f => f.endsWith(".sql")).sort();
  expect(files.some(f => f.endsWith("_unified_game_credits.sql"))).toBe(true);
  for (const file of files) {
    if (file.endsWith("_unified_game_credits.sql")) {
      for (const balance of existingBalances) {
        await db.query("insert into auth.users(id) values ($1)", [balance.user]);
        await db.query(
          "update public.user_credits set free_games_remaining=$2, purchased_games_remaining=$3 where user_id=$1",
          [balance.user, balance.free, balance.purchased],
        );
      }
      await db.query("insert into auth.users(id) values ($1)", [existingSessionUser]);
      const session = await serviceQuery<{ id: string }>(
        "select public.start_game_session($1, 250) as id", [existingSessionUser],
      );
      existingSessionId = session.rows[0]!.id;
      await serviceQuery("select public.consume_ai_call($1, $2)", [existingSessionUser, existingSessionId]);
    }
    await db.exec(readFileSync(new URL(file, migrations), "utf8"));
  }

  // Exercise the production reader against real SQL defaults and duplicate keys.
  mocked.from.mockImplementation(() => ({
    insert: (values: { user_id: string }) => ({
      select: () => ({
        single: async () => {
          try {
            const result = await serviceQuery<{ user_id: string }>(
              "insert into public.user_credits(user_id) values ($1) returning user_id", [values.user_id],
            );
            return { data: result.rows[0], error: null };
          } catch (error) {
            return { data: null, error };
          }
        },
      }),
    }),
    select: () => ({
      eq: (_column: string, user: string) => ({
        single: async () => {
          const result = await serviceQuery<{ games_remaining: number }>(
            "select games_remaining from public.user_credits where user_id=$1", [user],
          );
          return { data: result.rows[0], error: null };
        },
      }),
    }),
  }));
}, 30000);

afterAll(async () => { await db?.close(); });

describe("unified account credits", () => {
  it.each(existingBalances)("preserves $free + $purchased as $remaining credits", async balance => {
    expect(await remaining(balance.user)).toBe(balance.remaining);
  });

  it("stores only one balance and defaults new accounts to 1", async () => {
    const columns = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema='public' and table_name='user_credits'",
    );
    expect(columns.rows.map(row => row.column_name).sort()).toEqual(
      ["user_id", "games_remaining", "created_at", "updated_at"].sort(),
    );
    const user = await newUser();
    expect(await remaining(user)).toBe(1);
    await expect(db.query("update public.user_credits set games_remaining=-1 where user_id=$1", [user])).rejects.toThrow();
    await expect(db.query("update public.user_credits set games_remaining=null where user_id=$1", [user])).rejects.toThrow();
    expect(await remaining(user)).toBe(1);
  });

  it("preserves existing sessions and continues counting AI calls without another debit", async () => {
    const session = await db.query<{ status: string; llm_source: string; ai_calls_used: number; ai_call_limit: number }>(
      "select status,llm_source,ai_calls_used,ai_call_limit from public.game_sessions where id=$1", [existingSessionId],
    );
    expect(session.rows[0]).toEqual({ status: "active", llm_source: "platform", ai_calls_used: 1, ai_call_limit: 250 });
    const usage = await serviceQuery<{ used: number }>(
      "select public.consume_ai_call($1, $2) as used", [existingSessionUser, existingSessionId],
    );
    expect(usage.rows[0]!.used).toBe(2);
    expect(await remaining(existingSessionUser)).toBe(0);
  });

  it("rebuilds missing credits on read and never resets existing balances", async () => {
    const user = await newUser();
    await db.query("delete from public.user_credits where user_id=$1", [user]);
    expect(await readUserCredits(user)).toEqual({ gamesRemaining: 1 });
    for (const balance of [0, 3]) {
      await db.query("update public.user_credits set games_remaining=$2 where user_id=$1", [user, balance]);
      expect(await readUserCredits(user)).toEqual({ gamesRemaining: balance });
      expect(await readUserCredits(user)).toEqual({ gamesRemaining: balance });
      expect(await remaining(user)).toBe(balance);
    }
  });

  it.each([
    { rpc: "start_game_session", balance: 0 },
    { rpc: "start_user_llm_game_session", balance: 1 },
  ])("rebuilds a missing balance before $rpc", async ({ rpc, balance }) => {
    const user = await newUser();
    await db.query("delete from public.user_credits where user_id=$1", [user]);
    await serviceQuery(`select public.${rpc}($1, 250)`, [user]);
    expect(await remaining(user)).toBe(balance);
  });

  it("charges platform games until exhausted and allows custom models at zero", async () => {
    const user = await newUser();
    await db.query("update public.user_credits set games_remaining=3 where user_id=$1", [user]);
    for (const balance of [2, 1, 0]) {
      await serviceQuery("select public.start_game_session($1, 250)", [user]);
      expect(await remaining(user)).toBe(balance);
    }
    await expect(serviceQuery("select public.start_game_session($1, 250)", [user])).rejects.toThrow("NO_GAME_CREDITS");
    await serviceQuery("select public.start_user_llm_game_session($1, 250)", [user]);
    expect(await remaining(user)).toBe(0);
    const sessions = await db.query<{ llm_source: string; ai_call_limit: number }>(
      "select llm_source,ai_call_limit from public.game_sessions where user_id=$1", [user],
    );
    expect(sessions.rows.filter(row => row.llm_source === "platform")).toHaveLength(3);
    expect(sessions.rows.filter(row => row.llm_source === "user")).toHaveLength(1);
    expect(sessions.rows.every(row => row.ai_call_limit === 250)).toBe(true);
  });

  it("rejects competing starts after the last credit is spent", async () => {
    const user = await newUser();
    const results = await Promise.allSettled([
      serviceQuery("select public.start_game_session($1, 250)", [user]),
      serviceQuery("select public.start_game_session($1, 250)", [user]),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(await remaining(user)).toBe(0);
  });

  it("rolls back the debit if session creation fails", async () => {
    const user = await newUser();
    await db.exec(`
      create function private.reject_test_session() returns trigger language plpgsql as
        $$ begin raise exception 'TEST_SESSION_FAILURE'; end; $$;
      create trigger reject_test_session before insert on public.game_sessions
        for each row execute function private.reject_test_session();
    `);
    try {
      await expect(serviceQuery("select public.start_game_session($1, 250)", [user])).rejects.toThrow("TEST_SESSION_FAILURE");
      expect(await remaining(user)).toBe(1);
      const sessions = await db.query("select id from public.game_sessions where user_id=$1", [user]);
      expect(sessions.rows).toHaveLength(0);
    } finally {
      await db.exec("drop trigger reject_test_session on public.game_sessions; drop function private.reject_test_session()");
    }
  });

  it("keeps browser reads scoped to the owner and disallows writes and charging RPCs", async () => {
    const owner = await newUser();
    await newUser();
    const result = await db.transaction(async tx => {
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [owner]);
      return tx.query<{ user_id: string }>("select user_id from public.user_credits");
    });
    expect(result.rows).toEqual([{ user_id: owner }]);
    for (const role of ["anon", "authenticated"]) {
      for (const sql of [
        "update public.user_credits set games_remaining=100 where user_id=$1",
        "select public.start_game_session($1, 250)",
        "select public.start_user_llm_game_session($1, 250)",
      ]) {
        await expect(db.transaction(async tx => {
          await tx.exec(`set local role ${role}`);
          await tx.query(sql, [owner]);
        })).rejects.toThrow("permission denied");
      }
    }
  });
});
