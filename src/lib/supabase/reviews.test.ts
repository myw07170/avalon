import { describe, expect, it } from "vitest";
import { isMissingReviewColumnsError } from "./reviews";

describe("isMissingReviewColumnsError", () => {
  it("识别缺失的复盘历史列", () => {
    expect(
      isMissingReviewColumnsError({
        code: "42703",
        message: "column game_sessions.player_count does not exist",
      }),
    ).toBe(true);
  });

  it("不会把其他数据库错误当作复盘历史未迁移", () => {
    expect(
      isMissingReviewColumnsError({
        code: "42703",
        message: "column game_sessions.unrelated_column does not exist",
      }),
    ).toBe(false);
    expect(isMissingReviewColumnsError({ code: "42501", message: "permission denied" })).toBe(
      false,
    );
  });
});
