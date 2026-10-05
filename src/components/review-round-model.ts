import type { Messages } from "@/i18n/messages";
import type { GameOverBrief, RevealedMission, ReviewRound } from "./game-over-model";
import type { VoteMatrix } from "./vote-model";

export interface ReviewRoundPanel extends ReviewRound {
  mission: RevealedMission | null;
  matrix: VoteMatrix;
}

/** Include rejected proposals and tail-only rounds, without inventing future rounds. */
export function describeReviewRounds(brief: GameOverBrief, msg: Messages): ReviewRoundPanel[] {
  const indexes = new Set([
    ...brief.missions.map((mission) => mission.index),
    ...brief.review.map((round) => round.missionIndex),
    ...brief.voteMatrix.rows.map((row) => row.missionIndex),
  ]);
  return [...indexes].sort((a, b) => a - b).map((missionIndex) => {
    const replay = brief.review.find((round) => round.missionIndex === missionIndex);
    return {
      missionIndex,
      label: msg.common.round(missionIndex + 1),
      mission: brief.missions.find((mission) => mission.index === missionIndex) ?? null,
      matrix: { seats: brief.voteMatrix.seats, rows: brief.voteMatrix.rows.filter((row) => row.missionIndex === missionIndex) },
      items: replay?.items ?? [],
      tail: replay?.tail ?? [],
    };
  });
}
