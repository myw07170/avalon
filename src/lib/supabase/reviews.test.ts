import { afterEach, describe, expect, it, vi } from "vitest";
import { REVIEW_SCHEMA_VERSION, type SavedReviewSnapshot } from "@/lib/reviews";
import { isMissingReviewColumnsError, ReviewError, saveGameReview } from "./reviews";

const routeMocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("./route", () => ({
  createSupabaseAdminClient: routeMocks.createSupabaseAdminClient,
}));

const snapshot: SavedReviewSnapshot = {
  schemaVersion: REVIEW_SCHEMA_VERSION,
  savedAt: "2026-09-08T00:00:00.000Z",
  summary: {
    playerCount: 5,
    humanSeat: 0,
    winner: "GOOD",
    winReason: "ASSASSINATION_MISS",
    goodScore: 3,
    evilScore: 1,
    aiCallsUsed: 12,
  },
  view: {} as SavedReviewSnapshot["view"],
  decisions: [],
  avatarSeed: 123,
};

afterEach(() => {
  routeMocks.createSupabaseAdminClient.mockReset();
});

describe("isMissingReviewColumnsError", () => {
  it("识别缺失的复盘历史列", () => {
    expect(
      isMissingReviewColumnsError({
        code: "42703",
        message: "column game_sessions.player_count does not exist",
      }),
    ).toBe(true);
    expect(
      isMissingReviewColumnsError({
        code: "PGRST204",
        message: "Could not find the 'evil_score' column of 'game_sessions' in the schema cache",
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

  it("保存复盘时把缺失复盘列转换成稳定错误码", async () => {
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "PGRST204",
        message: "Could not find the 'evil_score' column of 'game_sessions' in the schema cache",
      },
    });
    const select = vi.fn(() => ({ single }));
    const eqUserId = vi.fn(() => ({ select }));
    const eqSessionId = vi.fn(() => ({ eq: eqUserId }));
    const update = vi.fn(() => ({ eq: eqSessionId }));
    const from = vi.fn(() => ({ update }));
    routeMocks.createSupabaseAdminClient.mockReturnValue({ from });

    await expect(
      saveGameReview({
        userId: "user-1",
        sessionId: "session-1",
        snapshot,
      }),
    ).rejects.toMatchObject({
      code: "SCHEMA_MISSING",
      message: "Could not find the 'evil_score' column of 'game_sessions' in the schema cache",
    });
    await expect(
      saveGameReview({
        userId: "user-1",
        sessionId: "session-1",
        snapshot,
      }),
    ).rejects.toBeInstanceOf(ReviewError);
  });
});
