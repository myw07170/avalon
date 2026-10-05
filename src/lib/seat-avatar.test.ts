import { describe, expect, it } from "vitest";
import { PREVIEW_AVATAR_SEED, SEAT_PORTRAIT_COUNT, seatPortraitIndex } from "./seat-avatar";

describe("public seat portraits", () => {
  it("keeps a restored UI seed and seat mapped to the same face", () => {
    const saved = JSON.parse(JSON.stringify({ avatarSeed: PREVIEW_AVATAR_SEED }));
    for (let id = 0; id < 10; id += 1) {
      expect(seatPortraitIndex(saved.avatarSeed, id)).toBe(seatPortraitIndex(PREVIEW_AVATAR_SEED, id));
    }
  });
  it("assigns all ten seats distinct portraits for every sampled seed", () => {
    for (const seed of [0, 1, PREVIEW_AVATAR_SEED, 0xffffffff, 0x12345678, 0x87654321]) {
      const indices = Array.from({ length: 10 }, (_, id) => seatPortraitIndex(seed, id));
      expect([...indices].sort((a, b) => a - b)).toEqual(Array.from({ length: SEAT_PORTRAIT_COUNT }, (_, id) => id));
    }
  });
  it("changes the permutation when opening a new game", () => {
    const faces = (seed: number) => Array.from({ length: 10 }, (_, id) => seatPortraitIndex(seed, id));
    expect(faces(0x12345678)).not.toEqual(faces(0x87654321));
  });
  it("depends only on the public seat and independent UI seed", () => {
    // A deal seed or assigned role cannot be passed through this API.
    expect(seatPortraitIndex(1, 2)).toBe(seatPortraitIndex(0x100000001, 2));
    expect(Number.isInteger(seatPortraitIndex(0, 9))).toBe(true);
  });
});
