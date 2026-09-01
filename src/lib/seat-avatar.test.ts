import { describe, expect, it } from "vitest";
import {
  PREVIEW_AVATAR_SEED,
  SEAT_AVATAR_SIZE,
  seatAvatarCells,
} from "./seat-avatar";

function pattern(seed: number, id: number): string {
  return seatAvatarCells(seed, id)
    .map(({ x, y }) => `${x}:${y}`)
    .sort()
    .join("|");
}

describe("seatAvatarCells", () => {
  it("同一个 UI seed 与座位号总是生成同一枚纹章", () => {
    const first = seatAvatarCells(PREVIEW_AVATAR_SEED, 3);
    const second = seatAvatarCells(PREVIEW_AVATAR_SEED, 3);

    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });

  it("换一局 seed 会换图案", () => {
    expect(pattern(0x12345678, 3)).not.toBe(pattern(0x87654321, 3));
  });

  it("0–9 号在任意一局都互不撞图", () => {
    for (const seed of [0, 1, PREVIEW_AVATAR_SEED, 0xffffffff]) {
      const patterns = Array.from({ length: 10 }, (_, id) => pattern(seed, id));
      expect(new Set(patterns).size).toBe(10);
    }
  });

  it("每个实心格都在 5×5 内，并且有左右镜像", () => {
    for (let id = 0; id < 10; id += 1) {
      const cells = seatAvatarCells(PREVIEW_AVATAR_SEED, id);
      const occupied = new Set(cells.map(({ x, y }) => `${x}:${y}`));

      expect(cells.length).toBeGreaterThan(0);
      for (const { x, y } of cells) {
        expect(Number.isInteger(x)).toBe(true);
        expect(Number.isInteger(y)).toBe(true);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(SEAT_AVATAR_SIZE);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThan(SEAT_AVATAR_SIZE);
        expect(occupied.has(`${SEAT_AVATAR_SIZE - 1 - x}:${y}`)).toBe(true);
      }
    }
  });
});
