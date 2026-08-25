/**
 * ROLE_REVEAL：累积确认，齐了转 TEAM_BUILDING。
 *
 * 首任队长直接提议，这里【不】顺延队长——顺延只发生在下一次提议之前
 * （提议被否决、或新一轮开始），见 transitions.ts。
 */
import { createPending, type GameAction, type GameState } from "../types";
import { unexpectedAction } from "./transitions";

export function reduceRoleReveal(state: GameState, action: GameAction): GameState {
  if (action.type !== "ACKNOWLEDGE") throw unexpectedAction(state, action);

  // 重复确认由 assertLegal 拦掉，这里拿到的必然是新人。
  // 排序只为让 pending 的内容与确认先后无关，方便写快照
  const acknowledged = [...state.pending.acknowledged, action.playerId].sort(
    (a, b) => a - b,
  );
  const next: GameState = {
    ...state,
    pending: { ...state.pending, acknowledged },
  };

  if (acknowledged.length < state.players.length) return next;
  return { ...next, phase: "TEAM_BUILDING", pending: createPending() };
}
