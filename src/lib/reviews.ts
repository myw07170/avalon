import type { DecisionRecord } from "@/lib/ai/orchestrator";
import type { AnyView, PlayerId, Team, WinReason } from "@/lib/game";

export const REVIEW_SCHEMA_VERSION = 1;

export interface ReviewSummary {
  id: string;
  endedAt: string;
  playerCount: number;
  humanSeat: PlayerId | null;
  winner: Team;
  winReason: WinReason;
  goodScore: number;
  evilScore: number;
  aiCallsUsed: number;
}

export interface SavedReviewSnapshot {
  schemaVersion: typeof REVIEW_SCHEMA_VERSION;
  savedAt: string;
  summary: Omit<ReviewSummary, "id" | "endedAt">;
  view: AnyView;
  decisions: DecisionRecord[];
  avatarSeed: number;
}

export function createSavedReviewSnapshot({
  view,
  decisions,
  avatarSeed,
  savedAt = new Date().toISOString(),
}: {
  view: AnyView | null;
  decisions: readonly DecisionRecord[];
  avatarSeed: number;
  savedAt?: string;
}): SavedReviewSnapshot | null {
  if (!view?.reveal) return null;

  return {
    schemaVersion: REVIEW_SCHEMA_VERSION,
    savedAt,
    summary: {
      playerCount: view.players.length,
      humanSeat: view.selfId,
      winner: view.reveal.winner,
      winReason: view.reveal.winReason,
      goodScore: view.goodScore,
      evilScore: view.evilScore,
      aiCallsUsed: decisions.filter((decision) => !decision.auto).length,
    },
    view,
    decisions: [...decisions],
    avatarSeed,
  };
}

export function isSavedReviewSnapshot(value: unknown): value is SavedReviewSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<SavedReviewSnapshot>;
  return (
    candidate.schemaVersion === REVIEW_SCHEMA_VERSION &&
    typeof candidate.savedAt === "string" &&
    typeof candidate.avatarSeed === "number" &&
    typeof candidate.summary === "object" &&
    candidate.summary !== null &&
    typeof candidate.view === "object" &&
    candidate.view !== null &&
    Array.isArray(candidate.decisions)
  );
}
