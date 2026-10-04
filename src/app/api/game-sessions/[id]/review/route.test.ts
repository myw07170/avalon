import { afterEach, describe, expect, it, vi } from "vitest";
import { REVIEW_SCHEMA_VERSION, type SavedReviewSnapshot } from "@/lib/reviews";
import { DELETE, GET, POST } from "./route";
vi.mock("@/lib/supabase/active-games", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/supabase/active-games")>(),
  finishActiveGameFromReviewRequest: vi.fn().mockResolvedValue(false),
}));

const routeMocks = vi.hoisted(() => {
  class MockAuthError extends Error {}
  class MockReviewError extends Error {
    constructor(
      readonly code: "NOT_FOUND" | "CONFIG_MISSING" | "SCHEMA_MISSING",
      message: string,
    ) {
      super(message);
    }
  }

  return {
    AuthError: MockAuthError,
    ReviewError: MockReviewError,
    requireAuthenticatedUser: vi.fn(),
    deleteGameReview: vi.fn(),
    readGameReview: vi.fn(),
    saveGameReview: vi.fn(),
  };
});

vi.mock("@/lib/supabase/auth", () => ({
  AuthError: routeMocks.AuthError,
  requireAuthenticatedUser: routeMocks.requireAuthenticatedUser,
}));

vi.mock("@/lib/supabase/reviews", () => ({
  ReviewError: routeMocks.ReviewError,
  deleteGameReview: routeMocks.deleteGameReview,
  readGameReview: routeMocks.readGameReview,
  saveGameReview: routeMocks.saveGameReview,
}));

const context = { params: Promise.resolve({ id: "session-1" }) };

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
  routeMocks.requireAuthenticatedUser.mockReset();
  routeMocks.deleteGameReview.mockReset();
  routeMocks.readGameReview.mockReset();
  routeMocks.saveGameReview.mockReset();
});

describe("/api/game-sessions/[id]/review", () => {
  it("未登录读取复盘时 401", async () => {
    routeMocks.requireAuthenticatedUser.mockRejectedValue(new routeMocks.AuthError("no session"));

    const response = await GET(new Request("http://localhost/api/game-sessions/session-1/review"), context);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(routeMocks.readGameReview).not.toHaveBeenCalled();
  });

  it("登录后只读取当前用户自己的复盘", async () => {
    routeMocks.requireAuthenticatedUser.mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
      responseHeaders: new Headers(),
    });
    routeMocks.readGameReview.mockResolvedValue(snapshot);

    const response = await GET(new Request("http://localhost/api/game-sessions/session-1/review"), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ review: snapshot });
    expect(routeMocks.readGameReview).toHaveBeenCalledWith("user-1", "session-1");
  });

  it("未登录保存复盘时 401", async () => {
    routeMocks.requireAuthenticatedUser.mockRejectedValue(new routeMocks.AuthError("no session"));

    const response = await POST(
      new Request("http://localhost/api/game-sessions/session-1/review", {
        method: "POST",
        body: JSON.stringify({ review: snapshot }),
      }),
      context,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(routeMocks.saveGameReview).not.toHaveBeenCalled();
  });

  it("保存复盘只更新当前用户对应 session", async () => {
    routeMocks.requireAuthenticatedUser.mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
      responseHeaders: new Headers(),
    });
    routeMocks.saveGameReview.mockResolvedValue({ id: "session-1" });

    const response = await POST(
      new Request("http://localhost/api/game-sessions/session-1/review", {
        method: "POST",
        body: JSON.stringify({ review: snapshot }),
      }),
      context,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: "session-1" });
    expect(routeMocks.saveGameReview).toHaveBeenCalledWith({
      userId: "user-1",
      sessionId: "session-1",
      snapshot,
    });
  });

  it("保存复盘遇到缺失复盘列时不返回数据库原始错误", async () => {
    routeMocks.requireAuthenticatedUser.mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
      responseHeaders: new Headers(),
    });
    routeMocks.saveGameReview.mockRejectedValue(
      new routeMocks.ReviewError(
        "SCHEMA_MISSING",
        "Could not find the 'evil_score' column of 'game_sessions' in the schema cache",
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/game-sessions/session-1/review", {
        method: "POST",
        body: JSON.stringify({ review: snapshot }),
      }),
      context,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: "CONFIG_MISSING",
      error: "对局已结束，但复盘保存失败",
    });
  });

  it("快照形状不合法时不写库", async () => {
    routeMocks.requireAuthenticatedUser.mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
      responseHeaders: new Headers(),
    });

    const response = await POST(
      new Request("http://localhost/api/game-sessions/session-1/review", {
        method: "POST",
        body: JSON.stringify({ review: { schemaVersion: 99 } }),
      }),
      context,
    );

    expect(response.status).toBe(400);
    expect(routeMocks.saveGameReview).not.toHaveBeenCalled();
  });

  it("其他用户或不存在的复盘返回 404", async () => {
    routeMocks.requireAuthenticatedUser.mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
      responseHeaders: new Headers(),
    });
    routeMocks.readGameReview.mockRejectedValue(
      new routeMocks.ReviewError("NOT_FOUND", "review snapshot not found"),
    );

    const response = await GET(new Request("http://localhost/api/game-sessions/session-1/review"), context);

    expect(response.status).toBe(404);
  });

  it("未登录删除复盘时 401", async () => {
    routeMocks.requireAuthenticatedUser.mockRejectedValue(new routeMocks.AuthError("no session"));

    const response = await DELETE(
      new Request("http://localhost/api/game-sessions/session-1/review", { method: "DELETE" }),
      context,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(routeMocks.deleteGameReview).not.toHaveBeenCalled();
  });

  it("删除复盘只更新当前用户对应 session", async () => {
    routeMocks.requireAuthenticatedUser.mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
      responseHeaders: new Headers(),
    });
    routeMocks.deleteGameReview.mockResolvedValue({ id: "session-1" });

    const response = await DELETE(
      new Request("http://localhost/api/game-sessions/session-1/review", { method: "DELETE" }),
      context,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: "session-1" });
    expect(routeMocks.deleteGameReview).toHaveBeenCalledWith({
      userId: "user-1",
      sessionId: "session-1",
    });
  });

  it("其他用户或不存在的复盘删除返回 404", async () => {
    routeMocks.requireAuthenticatedUser.mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
      responseHeaders: new Headers(),
    });
    routeMocks.deleteGameReview.mockRejectedValue(
      new routeMocks.ReviewError("NOT_FOUND", "review snapshot not found"),
    );

    const response = await DELETE(
      new Request("http://localhost/api/game-sessions/session-1/review", { method: "DELETE" }),
      context,
    );

    expect(response.status).toBe(404);
  });
});
