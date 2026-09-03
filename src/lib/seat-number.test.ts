import { describe, expect, it } from "vitest";
import { fromDisplaySeatNumber, toDisplaySeatNumber } from "./seat-number";

describe("座位显示编号", () => {
  it("把内部 0..9 显示为 1..10", () => {
    expect(toDisplaySeatNumber(0)).toBe(1);
    expect(toDisplaySeatNumber(9)).toBe(10);
  });

  it("把显示编号还原为内部 PlayerId", () => {
    expect(fromDisplaySeatNumber(1)).toBe(0);
    expect(fromDisplaySeatNumber(10)).toBe(9);
  });
});
