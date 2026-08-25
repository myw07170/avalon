/**
 * 合法动作枚举 —— 防作弊的第一道闸。
 *
 * AI 的候选项直接来自这里，不由 prompt 自由发挥：
 * 好人在 MISSION_EXECUTION 拿到的列表里根本没有"投失败"这个选项，想投也投不了。
 *
 * 阶段 3 实现，见 docs/todos.md。
 */
import type { GameAction, GameState, PlayerId } from "./types";

/** 不该该玩家行动时返回空数组，而不是抛错 */
export function getLegalActions(
  _state: GameState,
  _playerId: PlayerId,
): GameAction[] {
  throw new Error("TODO 阶段 3：getLegalActions 未实现");
}

/** 当前阶段在等谁行动。空数组表示等系统推进（NEXT） */
export function getAwaitingPlayerIds(_state: GameState): PlayerId[] {
  throw new Error("TODO 阶段 3：getAwaitingPlayerIds 未实现");
}

/** 非法动作直接抛 EngineError，不静默忽略 */
export function assertLegal(_state: GameState, _action: GameAction): void {
  throw new Error("TODO 阶段 3：assertLegal 未实现");
}
