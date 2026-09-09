import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const routeMocks = vi.hoisted(() => {
  class MockAuthError extends Error {}
  class MockQuotaError extends Error {
    constructor(
      readonly code: "QUOTA_EXHAUSTED" | "GAME_SESSION_REQUIRED" | "AI_CALL_LIMIT" | "CONFIG_MISSING",
      message: string,
    ) {
      super(message);
    }
  }
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
    QuotaError: MockQuotaError,
    ReviewError: MockReviewError,
    requireAuthenticatedUser: vi.fn(),
    startGameSession: vi.fn(),
    listGameReviewSummaries: vi.fn(),
  };
});

vi.mock("@/lib/supabase/auth", () => ({
  AuthError: routeMocks.AuthError,
  requireAuthenticatedUser: routeMocks.requireAuthenticatedUser,
}));

vi.mock("@/lib/supabase/quota", () => ({
  QuotaError: routeMocks.QuotaError,
  startGameSession: routeMocks.startGameSession,
}));

vi.mock("@/lib/supabase/reviews", () => ({
  ReviewError: routeMocks.ReviewError,
  listGameReviewSummaries: routeMocks.listGameReviewSummaries,
}));

const post = (body?: unknown): Promise<Response> =>
  POST(
    new Request("http://localhost/api/game-sessions", {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
const get = (): Promise<Response> => GET(new Request("http://localhost/api/game-sessions"));

afterEach(() => {
  routeMocks.requireAuthenticatedUser.mockReset();
  routeMocks.startGameSession.mockReset();
  routeMocks.listGameReviewSummaries.mockReset();
});

describe("/api/game-sessions", () => {
  it("未登录时 401", async () => {
    routeMocks.requireAuthenticatedUser.mockRejectedValue(new routeMocks.AuthError("no session"));

    const response = await post();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(routeMocks.startGameSession).not.toHaveBeenCalled();
  });

  it("有额度时返回 gameSessionId", async () => {
    routeMocks.requireAuthenticatedUser.mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
      responseHeaders: new Headers(),
    });
    routeMocks.startGameSession.mockResolvedValue("session-1");

    const response = await post();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ gameSessionId: "session-1" });
    expect(routeMocks.startGameSession).toHaveBeenCalledWith("user-1", "platform");
  });

  it("用户自带 LLM 开局创建 user session，不扣平台局数", async () => {
    routeMocks.requireAuthenticatedUser.mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
      responseHeaders: new Headers(),
    });
    routeMocks.startGameSession.mockResolvedValue("session-1");

    const response = await post({ llmSource: "user" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ gameSessionId: "session-1" });
    expect(routeMocks.startGameSession).toHaveBeenCalledWith("user-1", "user");
  });

  it("llmSource 不合法时 400", async () => {
    routeMocks.requireAuthenticatedUser.mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
      responseHeaders: new Headers(),
    });

    const response = await post({ llmSource: "other" });

    expect(response.status).toBe(400);
    expect(routeMocks.startGameSession).not.toHaveBeenCalled();
  });

  it("没有对局额度时 402", async () => {
    routeMocks.requireAuthenticatedUser.mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
      responseHeaders: new Headers(),
    });
    routeMocks.startGameSession.mockRejectedValue(
      new routeMocks.QuotaError("QUOTA_EXHAUSTED", "NO_GAME_CREDITS"),
    );

    const response = await post();

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({ code: "QUOTA_EXHAUSTED" });
  });

  it("未登录读取历史时 401", async () => {
    routeMocks.requireAuthenticatedUser.mockRejectedValue(new routeMocks.AuthError("no session"));

    const response = await get();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(routeMocks.listGameReviewSummaries).not.toHaveBeenCalled();
  });

  it("登录后只返回当前用户历史复盘", async () => {
    routeMocks.requireAuthenticatedUser.mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
      responseHeaders: new Headers(),
    });
    routeMocks.listGameReviewSummaries.mockResolvedValue([
      {
        id: "session-1",
        endedAt: "2026-09-08T00:00:00.000Z",
        playerCount: 5,
        humanSeat: 0,
        winner: "GOOD",
        winReason: "ASSASSINATION_MISS",
        goodScore: 3,
        evilScore: 1,
        aiCallsUsed: 12,
      },
    ]);

    const response = await get();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      reviews: [{ id: "session-1", winner: "GOOD" }],
    });
    expect(routeMocks.listGameReviewSummaries).toHaveBeenCalledWith("user-1");
  });

  it("历史复盘列未迁移时返回空列表", async () => {
    routeMocks.requireAuthenticatedUser.mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
      responseHeaders: new Headers(),
    });
    routeMocks.listGameReviewSummaries.mockRejectedValue(
      new routeMocks.ReviewError(
        "SCHEMA_MISSING",
        "column game_sessions.player_count does not exist",
      ),
    );

    const response = await get();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ reviews: [] });
  });
});
