/**
 * 全随机合法策略的模拟对局。引擎的验收工具。
 *
 * 阶段 3 的完成标准：跑 1000 局，断言无异常抛出、每局都到达 GAME_OVER、
 * 胜负双方都出现过、任务轮数不超过 5，且同一 seed 跑两次结果完全一致。
 *
 * 阶段 3 实现，见 docs/todos.md。
 */
import type { GameState, Team, WinReason } from "../game/types";

export interface SimResult {
  winner: Team;
  winReason: WinReason;
  missionsPlayed: number;
  finalState: GameState;
}

/** 每一步都从 getLegalActions 里随机取，因此永远不会构造出非法状态 */
export function simulateGame(_playerCount: number, _seed: number): SimResult {
  throw new Error("TODO 阶段 3：simulateGame 未实现");
}
