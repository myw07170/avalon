/**
 * 座位 identicon 的纯函数生成器。
 *
 * 【这里的 seed 不是 GameConfig.seed】发牌 seed 能重建整桌身份，绝不能进入组件层。
 * 调用方传的是独立的 UI seed；同一局稳定，重开后换一套图案。
 *
 * 图案是一枚 5×5 的左右对称纹章。只生成左半边三列，再镜像到右边；15 个独立格
 * 里有 4 个专门编码座位号，所以 0–9 在任何 seed 下都不会撞图。其余格由 32 位
 * 混合函数打散，让同一个座位在不同局里也会换样子。
 */
import type { PlayerId } from "./game";

export const SEAT_AVATAR_SIZE = 5;
export const PREVIEW_AVATAR_SEED = 0xa11ce;

export interface SeatAvatarCell {
  x: number;
  y: number;
}

const HALF_WIDTH = Math.ceil(SEAT_AVATAR_SIZE / 2);
const INDEPENDENT_CELL_COUNT = SEAT_AVATAR_SIZE * HALF_WIDTH;
const IDENTITY_SLOTS = [0, 4, 10, 14] as const;

/** 32 位 avalanche；只负责把相邻的 seed / 座位号打散，不承担加密。 */
function mix32(value: number): number {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846ca68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

function patternBits(seed: number, id: PlayerId): number {
  const normalizedSeed = seed >>> 0;
  const normalizedId = id >>> 0;
  const decoration = mix32(
    normalizedSeed ^ Math.imul(normalizedId + 1, 0x9e3779b1),
  );
  let bits = decoration & ((1 << INDEPENDENT_CELL_COUNT) - 1);

  // 同一个 seed 下是对 seat id 低四位做同一份 XOR，因此 0–9 仍是一一映射。
  const identity = (normalizedId & 0xf) ^ (normalizedSeed & 0xf);
  IDENTITY_SLOTS.forEach((slot, bit) => {
    const mask = 1 << slot;
    bits = identity & (1 << bit) ? bits | mask : bits & ~mask;
  });

  return bits;
}

/**
 * 生成已经镜像展开的实心格坐标。返回新数组，调用方可以直接映射成 SVG rect。
 */
export function seatAvatarCells(seed: number, id: PlayerId): SeatAvatarCell[] {
  const bits = patternBits(seed, id);
  const cells: SeatAvatarCell[] = [];

  for (let y = 0; y < SEAT_AVATAR_SIZE; y += 1) {
    for (let x = 0; x < HALF_WIDTH; x += 1) {
      const bit = y * HALF_WIDTH + x;
      if ((bits & (1 << bit)) === 0) continue;

      cells.push({ x, y });
      const mirrorX = SEAT_AVATAR_SIZE - 1 - x;
      if (mirrorX !== x) cells.push({ x: mirrorX, y });
    }
  }

  return cells;
}

/** 点击开局时调用；不在渲染期取随机数，避免 SSR 与 hydration 首帧不一致。 */
export function createSeatAvatarSeed(): number {
  const words = new Uint32Array(1);
  globalThis.crypto.getRandomValues(words);
  return words[0]!;
}
