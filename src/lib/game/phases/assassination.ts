/**
 * ASSASSINATION：坏人逐个发表推测，全部说完后刺客动手。
 *
 * 发言调度在 legal.ts（坏人按座位号升序，含奥伯伦——他也是坏人，只是不认识队友）。
 * 目标是否合法、推测是否已说完，都由 assertLegal 拦下，这里只负责记录与判定。
 */
import {
  EngineError,
  type AssassinationRecord,
  type GameAction,
  type GameState,
} from "../types";
import { endGame, unexpectedAction, withLog } from "./transitions";

export function reduceAssassination(state: GameState, action: GameAction): GameState {
  if (action.type === "ASSASSIN_OPINION") {
    return {
      ...state,
      pending: {
        ...state.pending,
        // 这里的顺序就是发言顺序，AssassinationRecord.opinions 直接沿用
        assassinOpinions: [
          ...state.pending.assassinOpinions,
          { playerId: action.playerId, content: action.content },
        ],
      },
    };
  }
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
    opinions: [...state.pending.assassinOpinions],
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
