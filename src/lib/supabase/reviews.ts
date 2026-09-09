import type { SavedReviewSnapshot, ReviewSummary } from "@/lib/reviews";
import { isSavedReviewSnapshot } from "@/lib/reviews";
import type { Team, WinReason } from "@/lib/game";
import { createSupabaseAdminClient } from "./route";

export class ReviewError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "CONFIG_MISSING" | "SCHEMA_MISSING",
    message: string,
  ) {
    super(message);
    this.name = "ReviewError";
  }
}

const REVIEW_COLUMN_NAMES = [
  "review_version",
  "review_snapshot",
  "player_count",
  "human_seat",
  "winner",
  "win_reason",
  "good_score",
  "evil_score",
] as const;

interface GameSessionReviewRow {
  id: string;
  ended_at: string | null;
  player_count: number | null;
  human_seat: number | null;
  winner: Team | null;
  win_reason: WinReason | null;
  good_score: number | null;
  evil_score: number | null;
  ai_calls_used: number | null;
  review_snapshot?: unknown;
}

export async function listGameReviewSummaries(userId: string): Promise<ReviewSummary[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("game_sessions")
    .select(
      "id,ended_at,player_count,human_seat,winner,win_reason,good_score,evil_score,ai_calls_used",
    )
    .eq("user_id", userId)
    .eq("status", "ended")
    .not("review_snapshot", "is", null)
    .order("ended_at", { ascending: false });

  if (error) {
    throw new ReviewError(
      isMissingReviewColumnsError(error) ? "SCHEMA_MISSING" : "CONFIG_MISSING",
      error.message,
    );
  }
  return (data ?? []).flatMap(summaryFromRow);
}

export async function saveGameReview({
  userId,
  sessionId,
  snapshot,
}: {
  userId: string;
  sessionId: string;
  snapshot: SavedReviewSnapshot;
}): Promise<{ id: string }> {
  const supabase = createSupabaseAdminClient();
  const endedAt = snapshot.savedAt;
  const { summary } = snapshot;

  const { data, error } = await supabase
    .from("game_sessions")
    .update({
      status: "ended",
      ended_at: endedAt,
      review_version: snapshot.schemaVersion,
      review_snapshot: snapshot,
      player_count: summary.playerCount,
      human_seat: summary.humanSeat,
      winner: summary.winner,
      win_reason: summary.winReason,
      good_score: summary.goodScore,
      evil_score: summary.evilScore,
    })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .select("id")
    .single();

  if (error) {
    throw new ReviewError(
      isMissingReviewColumnsError(error) ? "SCHEMA_MISSING" : "CONFIG_MISSING",
      error.message,
    );
  }
  if (!data?.id) throw new ReviewError("NOT_FOUND", "game session not found");
  return { id: data.id };
}

export async function readGameReview(
  userId: string,
  sessionId: string,
): Promise<SavedReviewSnapshot> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("game_sessions")
    .select("review_snapshot")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .eq("status", "ended")
    .single();

  if (error) throw new ReviewError(error.code === "PGRST116" ? "NOT_FOUND" : "CONFIG_MISSING", error.message);
  const snapshot = data?.review_snapshot;
  if (!isSavedReviewSnapshot(snapshot)) {
    throw new ReviewError("NOT_FOUND", "review snapshot not found");
  }
  return snapshot;
}

export async function deleteGameReview({
  userId,
  sessionId,
}: {
  userId: string;
  sessionId: string;
}): Promise<{ id: string }> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("game_sessions")
    .update({
      review_version: null,
      review_snapshot: null,
      player_count: null,
      human_seat: null,
      winner: null,
      win_reason: null,
      good_score: null,
      evil_score: null,
    })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .not("review_snapshot", "is", null)
    .select("id")
    .single();

  if (error) throw new ReviewError(error.code === "PGRST116" ? "NOT_FOUND" : "CONFIG_MISSING", error.message);
  if (!data?.id) throw new ReviewError("NOT_FOUND", "review snapshot not found");
  return { id: data.id };
}

function summaryFromRow(row: GameSessionReviewRow): ReviewSummary[] {
  if (
    !row.ended_at ||
    typeof row.player_count !== "number" ||
    row.winner === null ||
    row.win_reason === null ||
    typeof row.good_score !== "number" ||
    typeof row.evil_score !== "number" ||
    typeof row.ai_calls_used !== "number"
  ) {
    return [];
  }

  return [
    {
      id: row.id,
      endedAt: row.ended_at,
      playerCount: row.player_count,
      humanSeat: typeof row.human_seat === "number" ? row.human_seat : null,
      winner: row.winner,
      winReason: row.win_reason,
      goodScore: row.good_score,
      evilScore: row.evil_score,
      aiCallsUsed: row.ai_calls_used,
    },
  ];
}

export function isMissingReviewColumnsError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code !== "42703" && candidate.code !== "PGRST204") {
    return false;
  }
  if (typeof candidate.message !== "string") return false;
  const message = candidate.message.toLowerCase();
  return REVIEW_COLUMN_NAMES.some(
    (column) =>
      message.includes(`game_sessions.${column}`) ||
      message.includes(`'${column}' column of 'game_sessions'`) ||
      message.includes(`"${column}" column of "game_sessions"`),
  );
}
