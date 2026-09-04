import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const routeMocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  createRouteSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/supabase/route", () => ({
  createRouteSupabaseClient: routeMocks.createRouteSupabaseClient,
}));

function request(url: string): Promise<Response> {
  routeMocks.createRouteSupabaseClient.mockReturnValue({
    supabase: {
      auth: {
        exchangeCodeForSession: routeMocks.exchangeCodeForSession,
      },
    },
    responseHeaders: new Headers(),
  });
  routeMocks.exchangeCodeForSession.mockResolvedValue({ error: null });

  return GET(new Request(url));
}

afterEach(() => {
  routeMocks.createRouteSupabaseClient.mockReset();
  routeMocks.exchangeCodeForSession.mockReset();
});

describe("/auth/callback", () => {
  it("有 code 时交换 session 并跳回站内 next", async () => {
    const response = await request("http://localhost/auth/callback?code=abc&next=/play");

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/play");
    expect(routeMocks.exchangeCodeForSession).toHaveBeenCalledWith("abc");
  });

  it("拒绝外部 next URL", async () => {
    const response = await request(
      "http://localhost/auth/callback?code=abc&next=https%3A%2F%2Fevil.example",
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/");
  });

  it("没有 code 时直接回首页", async () => {
    const response = await GET(new Request("http://localhost/auth/callback"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/");
    expect(routeMocks.createRouteSupabaseClient).not.toHaveBeenCalled();
  });
});
