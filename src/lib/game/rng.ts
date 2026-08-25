/**
 * 可播种随机数。
 *
 * 引擎自身不持有 rng，随机源作为参数注入（见 state-machine.md §3）。
 * 这样「同一 seed + 同一动作序列 == 同一局」成立，回放和排查才有可能。
 *
 * 阶段 1 实现，见 docs/todos.md。
 */
import type { RngFn } from "./types";

/** mulberry32：32 位状态，够快够均匀，实现只有几行，适合做可复现随机源 */
export function createRng(_seed: number): RngFn {
  throw new Error("TODO 阶段 1：createRng 未实现");
}

/** Fisher-Yates。必须返回新数组，不要原地改传入的数组 */
export function shuffle<T>(_items: readonly T[], _rng: RngFn): T[] {
  throw new Error("TODO 阶段 1：shuffle 未实现");
}

/** 从数组里随机取一个。用于 AI 兜底和随机策略 */
export function pick<T>(_items: readonly T[], _rng: RngFn): T {
  throw new Error("TODO 阶段 1：pick 未实现");
}
