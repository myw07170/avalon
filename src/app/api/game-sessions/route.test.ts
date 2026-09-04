import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

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

  return {
    AuthError: MockAuthError,
    QuotaError: MockQuotaError,
    requireAuthenticatedUser: vi.fn(),
    startGameSession: vi.fn(),
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

const post = (): Promise<Response> =>
  POST(new Request("http://localhost/api/game-sessions", { method: "POST" }));

afterEach(() => {
  routeMocks.requireAuthenticatedUser.mockReset();
  routeMocks.startGameSession.mockReset();
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
    expect(routeMocks.startGameSession).toHaveBeenCalledWith("user-1");
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
});
