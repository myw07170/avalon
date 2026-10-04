/**
 * 可播种随机数。
 *
 * 引擎自身不持有 rng，随机源作为参数注入（见 state-machine.md §3）。
 * 这样「同一 seed + 同一动作序列 == 同一局」成立，回放和排查才有可能。
 *
 * 本文件不 import 其他引擎模块，保持在依赖链的最底层。
 */
import { EngineError, type RngFn } from "./types";

/**
 * mulberry32。32 位状态，实现只有几行，分布对本项目够用。
 *
 * 刻意不用 Math.random：它不可播种，一旦出现"跑 1000 局偶发崩一次"这类问题，
 * 没有种子就没法复现。
 */
export interface StatefulRng extends RngFn {
  getState(): number;
}

/** The saved state is the same 32-bit accumulator used by a fresh seed. */
export function createRng(seed: number): StatefulRng {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.getState = () => state;
  return next;
}

/** [0, maxExclusive) 内的整数 */
export function randomInt(rng: RngFn, maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new EngineError(
      `randomInt 的上界必须是正整数，收到 ${maxExclusive}`,
      "INTERNAL",
      { maxExclusive },
    );
  }
  return Math.floor(rng() * maxExclusive);
}

/**
 * Fisher-Yates。返回新数组，不改传入的数组。
 *
 * 注：这里对 out[i] / out[j] 用了断言。i 由循环上界保证、j 由 randomInt 的上界保证，
 * 都在 [0, out.length) 内，undefined 不可达——这与"按用户输入的人数查表"那种
 * undefined 真实可达的情况不同，后者必须老老实实做校验。
 */
export function shuffle<T>(items: readonly T[], rng: RngFn): T[] {
  const out = Array.from(items);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(rng, i + 1);
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

/** 从数组里随机取一个。用于 AI 兜底和随机策略 */
export function pick<T>(items: readonly T[], rng: RngFn): T {
  if (items.length === 0) {
    throw new EngineError("不能从空数组里取元素", "INTERNAL");
  }
  return items[randomInt(rng, items.length)] as T;
}
