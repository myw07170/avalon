import { describe, expect, it } from "vitest";
import { zh } from "@/i18n/messages.zh";
import { en } from "@/i18n/messages.en";
import type { GameOverBrief, ReplayEntry } from "./game-over-model";
import type { VoteMatrixRow } from "./vote-model";
import { describeReviewRounds } from "./review-round-model";

const brief: GameOverBrief = {
  winner: "EVIL", winnerLabel: "", reasonLabel: "", youWon: null, yourRoleLabel: null,
  strike: null, seats: [], missions: [], voteMatrix: { seats: [], rows: [] }, review: [], timing: null,
};
const row = (missionIndex: number): VoteMatrixRow => ({
  missionIndex, key: `propose-${missionIndex}-0`, label: "", ariaLabel: "", leaderId: 0,
  approved: false, forced: false, outcomeLabel: "", detailLabel: "", cells: [],
});
const mind: ReplayEntry = { playerId: 0, seatLabel: "", kindLabel: "", reasoning: "Full reasoning", flags: [], latencyLabel: null };

describe("round review aggregation", () => {
  it("includes proposal-only rejected rounds and filters votes by numeric index", () => {
    const result = describeReviewRounds({ ...brief, voteMatrix: { seats: [], rows: [row(2), row(0), row(2)] } }, zh);
    expect(result.map((round) => round.missionIndex)).toEqual([0, 2]);
    expect(result[0]?.mission).toBeNull();
    expect(result[1]?.matrix.rows).toHaveLength(2);
    expect(result[1]?.matrix.rows.every((vote) => vote.missionIndex === 2)).toBe(true);
  });
  it("keeps mission-only and tail-only rounds, in order, without future rounds", () => {
    const result = describeReviewRounds({
      ...brief,
      missions: [{ index: 0, label: "", succeeded: true, failCount: 0, teamLabels: [], failedByLabels: [], detail: "" }],
      review: [{ missionIndex: 1, label: "", items: [], tail: [mind] }],
    }, en);
    expect(result.map((round) => round.missionIndex)).toEqual([0, 1]);
    expect(result[0]?.mission?.succeeded).toBe(true);
    expect(result[1]?.tail).toEqual([mind]);
    expect(result[1]?.items).toEqual([]);
    expect(result[1]?.label).toBe(en.common.round(2));
  });
  it("handles an empty review without adding phantom rounds", () => {
    expect(describeReviewRounds(brief, zh)).toEqual([]);
  });
});
