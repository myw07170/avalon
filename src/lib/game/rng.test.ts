import { describe, expect, it } from "vitest";
import { createRng, pick, randomInt, shuffle } from "./rng";
import { EngineError } from "./types";

describe("createRng", () => {
  it("同一种子产出同一序列", () => {
    const a = Array.from({ length: 50 }, createRng(12345));
    const b = Array.from({ length: 50 }, createRng(12345));
    expect(a).toEqual(b);
  });

  it("不同种子产出不同序列", () => {
    const a = Array.from({ length: 20 }, createRng(1));
    const b = Array.from({ length: 20 }, createRng(2));
    expect(a).not.toEqual(b);
  });

  it("取值落在 [0, 1)", () => {
    const rng = createRng(7);
    for (let i = 0; i < 10000; i += 1) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("分布大致均匀：10000 次分 10 桶，每桶都在 800-1200 之间", () => {
    const rng = createRng(2026);
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 10000; i += 1) {
      const b = Math.floor(rng() * 10);
      buckets[b] = (buckets[b] ?? 0) + 1;
    }
    for (const [i, n] of buckets.entries()) {
      expect(n, `第 ${i} 桶的数量 ${n} 偏离太多`).toBeGreaterThan(800);
      expect(n, `第 ${i} 桶的数量 ${n} 偏离太多`).toBeLessThan(1200);
    }
  });

  it("种子为 0 也能正常工作", () => {
    const rng = createRng(0);
    const values = Array.from({ length: 10 }, rng);
    expect(new Set(values).size).toBeGreaterThan(1);
  });
});

describe("randomInt", () => {
  it("落在 [0, maxExclusive) 且能取到两端", () => {
    const rng = createRng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i += 1) seen.add(randomInt(rng, 5));
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it("上界非正整数时抛 EngineError", () => {
    const rng = createRng(1);
    for (const bad of [0, -1, 2.5, Number.NaN]) {
      expect(() => randomInt(rng, bad)).toThrow(EngineError);
    }
  });
});

describe("shuffle", () => {
  it("不改传入的数组，返回新数组", () => {
    const input = [1, 2, 3, 4, 5];
    const copy = [...input];
    const out = shuffle(input, createRng(3));
    expect(input).toEqual(copy);
    expect(out).not.toBe(input);
  });

  it("元素不增不减，只换顺序", () => {
    const input = ["a", "b", "c", "d", "e", "f"];
    for (let seed = 0; seed < 50; seed += 1) {
      expect([...shuffle(input, createRng(seed))].sort()).toEqual([...input].sort());
    }
  });

  it("同一种子洗出同一结果", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(shuffle(input, createRng(42))).toEqual(shuffle(input, createRng(42)));
  });

  it("确实在洗：500 次里每个元素都出现在过每个位置", () => {
    const input = [0, 1, 2, 3, 4];
    const seenAt = input.map(() => new Set<number>());
    for (let seed = 0; seed < 500; seed += 1) {
      shuffle(input, createRng(seed)).forEach((value, pos) => {
        seenAt[pos]?.add(value);
      });
    }
    for (const [pos, seen] of seenAt.entries()) {
      expect(seen.size, `位置 ${pos} 只出现过 ${seen.size} 种元素，可能没真的洗`).toBe(
        input.length,
      );
    }
  });

  it("空数组和单元素数组不出错", () => {
    expect(shuffle([], createRng(1))).toEqual([]);
    expect(shuffle([9], createRng(1))).toEqual([9]);
  });
});

describe("pick", () => {
  it("取出的元素来自原数组", () => {
    const rng = createRng(11);
    const items = ["x", "y", "z"];
    for (let i = 0; i < 100; i += 1) expect(items).toContain(pick(items, rng));
  });

  it("空数组抛 EngineError", () => {
    expect(() => pick([], createRng(1))).toThrow(EngineError);
  });
});
