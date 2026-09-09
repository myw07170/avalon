import { createSupabaseAdminClient } from "./route";

export interface CreditsSnapshot {
  freeGamesRemaining: number;
  purchasedGamesRemaining: number;
  totalGamesRemaining: number;
}

export class QuotaError extends Error {
  constructor(
    readonly code: "QUOTA_EXHAUSTED" | "GAME_SESSION_REQUIRED" | "AI_CALL_LIMIT" | "CONFIG_MISSING",
    message: string,
  ) {
    super(message);
    this.name = "QuotaError";
  }
}

export type LlmSource = "platform" | "user";

export function readMaxAiCallsPerGame(): number {
  const raw = process.env.MAX_AI_CALLS_PER_GAME;
  if (!raw) return 250;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new QuotaError("CONFIG_MISSING", "MAX_AI_CALLS_PER_GAME 必须是正整数");
  }
  return parsed;
}

export async function startGameSession(
  userId: string,
  llmSource: LlmSource = "platform",
): Promise<string> {
  const supabase = createSupabaseAdminClient();
  const { data, error } =
    llmSource === "user"
      ? await supabase.rpc("start_user_llm_game_session", {
          p_user_id: userId,
          p_ai_call_limit: readMaxAiCallsPerGame(),
        })
      : await supabase.rpc("start_game_session", {
          p_user_id: userId,
          p_ai_call_limit: readMaxAiCallsPerGame(),
        });

  if (error) throw quotaErrorFromSupabase(error.message);
  if (typeof data !== "string") {
    throw new QuotaError("CONFIG_MISSING", "start_game_session 没有返回 session id");
  }
  return data;
}

export async function consumeAiCall(userId: string, sessionId: string): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("consume_ai_call", {
    p_user_id: userId,
    p_session_id: sessionId,
  });

  if (error) throw quotaErrorFromSupabase(error.message);
  if (typeof data !== "number") {
    throw new QuotaError("CONFIG_MISSING", "consume_ai_call 没有返回调用次数");
  }
  return data;
}

export async function recordUserAiCall(userId: string, sessionId: string): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("record_ai_call", {
    p_user_id: userId,
    p_session_id: sessionId,
  });

  if (error) throw quotaErrorFromSupabase(error.message);
  if (typeof data !== "number") {
    throw new QuotaError("CONFIG_MISSING", "record_ai_call 没有返回调用次数");
  }
  return data;
}

export async function readUserCredits(userId: string): Promise<CreditsSnapshot> {
  const supabase = createSupabaseAdminClient();
  const { error: insertError } = await supabase
    .from("user_credits")
    .insert({ user_id: userId, free_games_remaining: 1 })
    .select("user_id")
    .single();

  if (insertError && insertError.code !== "23505") {
    throw new QuotaError("CONFIG_MISSING", insertError.message);
  }

  const { data, error } = await supabase
    .from("user_credits")
    .select("free_games_remaining,purchased_games_remaining")
    .eq("user_id", userId)
    .single();

  if (error) throw new QuotaError("CONFIG_MISSING", error.message);

  const freeGamesRemaining =
    typeof data.free_games_remaining === "number" ? data.free_games_remaining : 0;
  const purchasedGamesRemaining =
    typeof data.purchased_games_remaining === "number" ? data.purchased_games_remaining : 0;

  return {
    freeGamesRemaining,
    purchasedGamesRemaining,
    totalGamesRemaining: freeGamesRemaining + purchasedGamesRemaining,
  };
}

function quotaErrorFromSupabase(message: string): QuotaError {
  if (message.includes("NO_GAME_CREDITS")) {
    return new QuotaError("QUOTA_EXHAUSTED", message);
  }
  if (message.includes("AI_CALL_LIMIT_REACHED")) {
    return new QuotaError("AI_CALL_LIMIT", message);
  }
  if (message.includes("GAME_SESSION_NOT_FOUND") || message.includes("GAME_SESSION_CLOSED")) {
    return new QuotaError("GAME_SESSION_REQUIRED", message);
  }
  return new QuotaError("CONFIG_MISSING", message);
}
