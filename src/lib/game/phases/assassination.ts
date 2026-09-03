/**
 * ASSASSINATION：刺客直接选择目标并结算胜负。
 */
import {
  EngineError,
  type AssassinationRecord,
  type GameAction,
  type GameState,
} from "../types";
import { endGame, unexpectedAction, withLog } from "./transitions";

export function reduceAssassination(state: GameState, action: GameAction): GameState {
  if (action.type !== "ASSASSINATE") throw unexpectedAction(state, action);

  const target = state.players.find((p) => p.id === action.targetId);
  if (!target) {
    // assertLegal 已按 INVALID_TARGET 校验过座位号，取不到即为引擎 bug
    throw new EngineError(`刺杀目标 ${action.targetId} 不存在`, "INTERNAL", {
      targetId: action.targetId,
    });
  }

  const hit = target.role === "MERLIN";
  const record: AssassinationRecord = {
    assassinId: action.playerId,
    targetId: action.targetId,
    hit,
  };

  const struck = withLog(
    { ...state, assassination: record },
    {
      kind: "ASSASSINATION",
      assassinId: action.playerId,
      targetId: action.targetId,
      hit,
    },
  );

  // rules.md §4.5：命中梅林坏人翻盘，否则好人守住三次任务的胜利
  return hit
    ? endGame(struck, "EVIL", "ASSASSINATION_HIT")
    : endGame(struck, "GOOD", "ASSASSINATION_MISS");
}
