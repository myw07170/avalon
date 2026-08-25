/**
 * MISSION_RESULT：纯展示阶段，由系统的 NEXT 推进。
 *
 * 判定顺序是 rules.md §1 定死的：先判任务比分，再判刺杀。
 * 好人集齐 3 分【不是】终局——必须进 ASSASSINATION，winner 此刻仍为 null。
 * 这里写成 GAME_OVER 是最容易犯又最没人察觉的错：好人会莫名其妙直接赢。
 */
import { MISSIONS_TO_WIN } from "../config";
import { createPending, type GameAction, type GameState } from "../types";
import { endGame, enterReviewDiscussion, unexpectedAction } from "./transitions";

export function reduceMissionResult(state: GameState, action: GameAction): GameState {
  if (action.type !== "NEXT") throw unexpectedAction(state, action);

  if (state.goodScore >= MISSIONS_TO_WIN) {
    return { ...state, phase: "ASSASSINATION", pending: createPending() };
  }
  if (state.evilScore >= MISSIONS_TO_WIN) {
    return endGame(state, "EVIL", "THREE_MISSIONS");
  }
  return enterReviewDiscussion(state);
}
