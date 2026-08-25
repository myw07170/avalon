/**
 * 状态机主入口：reduce(state, action, rng) -> newState
 *
 * 纯函数。不发网络请求，不调 LLM，不读时间戳，不用 Math.random
 * （随机源作为参数注入）。这样才测得动。
 *
 * 阶段 3 实现，见 docs/todos.md 与 docs/state-machine.md。
 */
import type { GameAction, GameState, RngFn } from "./types";

export function reduce(
  _state: GameState,
  _action: GameAction,
  _rng: RngFn,
): GameState {
  throw new Error("TODO 阶段 3：reduce 未实现");
}
