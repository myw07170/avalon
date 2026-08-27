import { describe, expect, it } from "vitest";
import { SEAT_RING_RADIUS, seatRingPositions } from "./seat-ring";

/** 浮点比较到 0.001，够区分方位又不受三角函数误差影响 */
function near(actual: number, expected: number): void {
  expect(actual).toBeCloseTo(expected, 3);
}

describe("seatRingPositions", () => {
  it("0 号位在正下方", () => {
    for (const count of [5, 6, 7, 8, 9, 10]) {
      const first = seatRingPositions(count)[0];
      expect(first).toBeDefined();
      near(first!.leftPercent, 50);
      near(first!.topPercent, 50 + SEAT_RING_RADIUS);
    }
  });

  it("序号顺时针递增：4 人局是 下 左 上 右", () => {
    const [bottom, left, top, right] = seatRingPositions(4);

    near(bottom!.leftPercent, 50);
    near(bottom!.topPercent, 50 + SEAT_RING_RADIUS);

    near(left!.leftPercent, 50 - SEAT_RING_RADIUS);
    near(left!.topPercent, 50);

    near(top!.leftPercent, 50);
    near(top!.topPercent, 50 - SEAT_RING_RADIUS);

    near(right!.leftPercent, 50 + SEAT_RING_RADIUS);
    near(right!.topPercent, 50);
  });

  it("每个座位都落在环上，且 id 就是下标", () => {
    for (const count of [5, 7, 10]) {
      const points = seatRingPositions(count);
      expect(points).toHaveLength(count);
      points.forEach((p, i) => {
        expect(p.id).toBe(i);
        const dx = p.leftPercent - 50;
        const dy = p.topPercent - 50;
        near(Math.sqrt(dx * dx + dy * dy), SEAT_RING_RADIUS);
      });
    }
  });

  it("相邻座位的夹角相等", () => {
    const points = seatRingPositions(6);
    const angles = points.map((p) =>
      Math.atan2(p.topPercent - 50, p.leftPercent - 50),
    );
    const gaps = angles.slice(1).map((a, i) => {
      const raw = a - angles[i]!;
      return ((raw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    });
    for (const gap of gaps) near(gap, (Math.PI * 2) / 6);
  });

  it("半径可调，默认留出节点自身的尺寸", () => {
    expect(SEAT_RING_RADIUS).toBeLessThan(50);
    const tight = seatRingPositions(4, 10)[0];
    near(tight!.topPercent, 60);
  });

  it("非法人数给空数组而不是抛错", () => {
    expect(seatRingPositions(0)).toEqual([]);
    expect(seatRingPositions(-3)).toEqual([]);
    expect(seatRingPositions(5.5)).toEqual([]);
  });
});
