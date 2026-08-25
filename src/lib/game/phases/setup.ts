/**
 * SETUP：只做阶段转移和日志。
 *
 * 角色分配和首任队长在 createGame 里就定好了（见 setup.ts 的头注释），
 * 这里不重新洗牌——否则同一 seed 会因为多洗一次而重放不出同一局。
 */
import { createPending, type GameAction, type GameState } from "../types";
import { unexpectedAction, withLog } from "./transitions";

export function reduceSetup(state: GameState, action: GameAction): GameState {
  if (action.type !== "START_GAME") throw unexpectedAction(state, action);

  return withLog(
    { ...state, phase: "ROLE_REVEAL", pending: createPending() },
    { kind: "GAME_STARTED", playerCount: state.players.length },
    // 首任队长是随机选的，时间线上补一条，UI 才知道从谁开始
    {
      kind: "LEADER_CHANGED",
      leaderId: state.currentLeaderId,
      missionIndex: state.missionIndex,
    },
  );
}
