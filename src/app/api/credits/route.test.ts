import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

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
    readUserCredits: vi.fn(),
  };
});

vi.mock("@/lib/supabase/auth", () => ({
  AuthError: routeMocks.AuthError,
  requireAuthenticatedUser: routeMocks.requireAuthenticatedUser,
}));

vi.mock("@/lib/supabase/quota", () => ({
  QuotaError: routeMocks.QuotaError,
  readUserCredits: routeMocks.readUserCredits,
}));

const get = (): Promise<Response> => GET(new Request("http://localhost/api/credits"));

afterEach(() => {
  routeMocks.requireAuthenticatedUser.mockReset();
  routeMocks.readUserCredits.mockReset();
});

describe("/api/credits", () => {
  it("未登录时 401", async () => {
    routeMocks.requireAuthenticatedUser.mockRejectedValue(new routeMocks.AuthError("no session"));

    const response = await get();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(routeMocks.readUserCredits).not.toHaveBeenCalled();
  });

  it("登录后只读取当前用户额度", async () => {
    routeMocks.requireAuthenticatedUser.mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
      responseHeaders: new Headers(),
    });
    routeMocks.readUserCredits.mockResolvedValue({
      gamesRemaining: 3,
    });

    const response = await get();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      gamesRemaining: 3,
    });
    expect(routeMocks.readUserCredits).toHaveBeenCalledWith("user-1");
  });

  it("额度读取失败时返回 503", async () => {
    routeMocks.requireAuthenticatedUser.mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
      responseHeaders: new Headers(),
    });
    routeMocks.readUserCredits.mockRejectedValue(
      new routeMocks.QuotaError("CONFIG_MISSING", "database unavailable"),
    );

    const response = await get();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "CONFIG_MISSING",
      error: "database unavailable",
    });
  });
});
