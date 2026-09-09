import { afterEach, describe, expect, it, vi } from "vitest";
import { createConfig } from "@/lib/game/config";
import { getLegalActions } from "@/lib/game/legal";
import { createRng } from "@/lib/game/rng";
import { createGame, makePlaceholderPersonas } from "@/lib/game/setup";
import { toPlayerView } from "@/lib/game/view";
import { createPending, type GameState, type Role } from "@/lib/game/types";
import { POST } from "./route";

const supabaseMocks = vi.hoisted(() => {
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
    authRequired: false,
    AuthError: MockAuthError,
    QuotaError: MockQuotaError,
    requireAuthenticatedUser: vi.fn(),
    consumeAiCall: vi.fn(),
    recordUserAiCall: vi.fn(),
  };
});

vi.mock("@/lib/supabase/config", () => ({
  isAuthRequired: () => supabaseMocks.authRequired,
}));

vi.mock("@/lib/supabase/auth", () => ({
  AuthError: supabaseMocks.AuthError,
  requireAuthenticatedUser: supabaseMocks.requireAuthenticatedUser,
}));

vi.mock("@/lib/supabase/quota", () => ({
  QuotaError: supabaseMocks.QuotaError,
  consumeAiCall: supabaseMocks.consumeAiCall,
  recordUserAiCall: supabaseMocks.recordUserAiCall,
}));

// ---------------------------------------------------------------------------
// 夹具
//
// route handler 用的是 Web 标准的 Request / Response，所以它就是个普通函数——
// 这里直接 new Request(...) 调用，不需要起 Next。
// ---------------------------------------------------------------------------

const SIX: Role[] = [
  "MERLIN",
  "MORGANA",
  "LOYAL_SERVANT",
  "PERCIVAL",
  "ASSASSIN",
  "LOYAL_SERVANT",
];

function voteState(): GameState {
  const base = createGame({
    config: createConfig(SIX.length, { roles: SIX }),
    humanSeat: null,
    personas: makePlaceholderPersonas(SIX.length),
    rng: createRng(5),
  });
  return {
    ...base,
    players: SIX.map((role, id) => ({
      id,
      name: `P${id}`,
      role,
      isHuman: false,
      persona: { name: `P${id}`, traits: ["谨慎"], speechStyle: "短句" },
    })),
    phase: "TEAM_VOTE",
    currentLeaderId: 3,
    proposedTeam: [0, 1],
    pending: createPending(),
  };
}

function validBody(maxRetries = 2): Record<string, unknown> {
  const state = voteState();
  return {
    kind: "VOTE",
    view: toPlayerView(state, 2),
    persona: { name: "P2", traits: ["谨慎"], speechStyle: "短句" },
    legalActions: getLegalActions(state, 2),
    maxRetries,
  };
}

const post = (body: unknown, headers: Record<string, string> = {}): Promise<Response> =>
  POST(
    new Request("http://localhost/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const SECRET = "sk-route-secret-key";

function configureEnv(overrides: Record<string, string> = {}): void {
  const env: Record<string, string> = {
    LLM_PROVIDER: "deepseek",
    LLM_API_KEY: SECRET,
    LLM_MODEL: "test-model",
    LLM_BASE_URL: "https://api.example.com/v1",
    LLM_MAX_RETRIES: "2",
    ...overrides,
  };
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
}

/** 假的上游。返回捕获到的调用次数 */
function stubProvider(content: string, status = 200): { calls: number; requests: RequestInit[] } {
  const state = { calls: 0, requests: [] as RequestInit[] };
  vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
    state.calls += 1;
    state.requests.push(init);
    if (status !== 200) {
      return Promise.resolve(new Response("上游的原始错误体", { status }));
    }
    return Promise.resolve(Response.json({ choices: [{ message: { content } }] }));
  });
  return state;
}

const VOTE_JSON = '{"reasoning":"想了想","approve":true}';

afterEach(() => {
  supabaseMocks.authRequired = false;
  supabaseMocks.requireAuthenticatedUser.mockReset();
  supabaseMocks.consumeAiCall.mockReset();
  supabaseMocks.recordUserAiCall.mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------

describe("正常路径", () => {
  it("200，返回完整的 AiDecisionResult", async () => {
    configureEnv();
    stubProvider(VOTE_JSON);

    const response = await post(validBody());

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({
      payload: { reasoning: "想了想", approve: true },
      fallback: false,
    });
    expect(result.debug.attempts).toBe(1);
    expect(typeof result.debug.prompt).toBe("string");
  });
});

/**
 * 【全项目最容易静默失效的一条链路】`aiDecisionRequestSchema` 是 `z.object`，
 * 会**剥掉**没声明的键。漏在那里加 locale 的话，服务端拿到的永远是默认值，
 * 英文模式下每一条 prompt 都是中文——而且不报任何错、状态码 200、结果格式完好。
 *
 * 所以这一条不查响应格式，查的是**真正发给模型的那份 prompt 是哪种语言**。
 * `debug.prompt` 就是它，route 已经原样返回了。
 */
describe("locale 穿过 HTTP 边界", () => {
  const promptOf = async (body: unknown): Promise<string> => {
    const response = await post(body);
    expect(response.status).toBe(200);
    const result = (await response.json()) as { debug: { prompt: string } };
    return result.debug.prompt;
  };

  it('locale: "en" 时 buildPrompt 拿到的是英文语料', async () => {
    configureEnv();
    stubProvider(VOTE_JSON);

    const prompt = await promptOf({ ...validBody(), locale: "en" });

    // 段头换成了 markdown 标题，正文是英文规则
    expect(prompt.startsWith("## ")).toBe(true);
    expect(prompt).toContain("You are playing Avalon");
    // 中文段头一个都不该剩
    expect(prompt).not.toContain("【游戏】");
  });

  it('locale: "zh" 时是中文语料', async () => {
    configureEnv();
    stubProvider(VOTE_JSON);

    const prompt = await promptOf({ ...validBody(), locale: "zh" });

    expect(prompt.startsWith("【游戏】")).toBe(true);
    expect(prompt).not.toContain("You are playing Avalon");
  });

  it("请求里没有 locale 时回退中文，而不是 400", async () => {
    // 缓存住的旧页面不带这个字段。为它 400 掉一整局不值得——
    // 这是**协议边界上的兼容默认**，与"内部代码里 locale 必填"不矛盾
    configureEnv();
    stubProvider(VOTE_JSON);

    const prompt = await promptOf(validBody());

    expect(prompt.startsWith("【游戏】")).toBe(true);
  });

  it("locale 不是认识的值时 400", async () => {
    configureEnv();
    stubProvider(VOTE_JSON);

    const response = await post({ ...validBody(), locale: "fr" });

    expect(response.status).toBe(400);
  });
});

describe("400：请求体的问题", () => {
  it("不是合法 JSON", async () => {
    configureEnv();
    const response = await post("{ 这不是 JSON");
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringContaining("JSON") });
  });

  it("kind 不认识", async () => {
    configureEnv();
    const response = await post({ ...validBody(), kind: "PLAY_MUSIC" });
    expect(response.status).toBe(400);
  });

  it("legalActions 为空", async () => {
    configureEnv();
    const response = await post({ ...validBody(), legalActions: [] });
    expect(response.status).toBe(400);
  });

  it("maxRetries 是负数", async () => {
    configureEnv();
    const response = await post({ ...validBody(), maxRetries: -1 });
    expect(response.status).toBe(400);
  });

  it("view 不是对象", async () => {
    configureEnv();
    const response = await post({ ...validBody(), view: "梅林" });
    expect(response.status).toBe(400);
  });

  it("view 是对象但字段残缺 → 由 buildPrompt 抱怨，转成 400 而不是 500", async () => {
    configureEnv();
    stubProvider(VOTE_JSON);
    const response = await post({ ...validBody(), view: { selfId: 99 } });
    expect(response.status).toBe(400);
  });

  it("浅 schema 不会把 view 的字段剥光", async () => {
    configureEnv();
    const provider = stubProvider(VOTE_JSON);
    await post(validBody());
    // 剥光了的话 buildPrompt 会抛，根本走不到上游
    expect(provider.calls).toBe(1);
  });
});

describe("503：服务端没配好", () => {
  it("LLM_PROVIDER=mock 要报得响亮", async () => {
    configureEnv({ LLM_PROVIDER: "mock" });

    const response = await post(validBody());

    expect(response.status).toBe(503);
    // 这说明调用方选错了 client，不是"暂时不可用"，消息必须指得出问题
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("mock"),
    });
  });

  it("缺 LLM_API_KEY", async () => {
    configureEnv({ LLM_API_KEY: "" });
    const response = await post(validBody());
    expect(response.status).toBe(503);
  });

  it("provider 不认识且没给 baseUrl", async () => {
    configureEnv({ LLM_PROVIDER: "某个没听过的服务", LLM_BASE_URL: "" });
    const response = await post(validBody());
    expect(response.status).toBe(503);
  });
});

describe("502：上游失败", () => {
  it("provider 401 时不泄漏 key，也不回传上游的响应体", async () => {
    configureEnv();
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubProvider("", 401);

    const response = await post(validBody());

    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("上游的原始错误体");
  });
});

describe("公开部署鉴权与额度", () => {
  it("未登录时 401，且不读模型配置", async () => {
    supabaseMocks.authRequired = true;
    supabaseMocks.requireAuthenticatedUser.mockRejectedValue(new supabaseMocks.AuthError("no session"));

    const response = await post(validBody());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(supabaseMocks.consumeAiCall).not.toHaveBeenCalled();
  });

  it("登录但没有 X-Game-Session-Id 时 403", async () => {
    supabaseMocks.authRequired = true;
    supabaseMocks.requireAuthenticatedUser.mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
      responseHeaders: new Headers(),
    });

    const response = await post(validBody());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "GAME_SESSION_REQUIRED" });
    expect(supabaseMocks.consumeAiCall).not.toHaveBeenCalled();
  });

  it("有效 session 会先扣一次 AI 调用额度再请求 provider", async () => {
    supabaseMocks.authRequired = true;
    supabaseMocks.requireAuthenticatedUser.mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
      responseHeaders: new Headers(),
    });
    supabaseMocks.consumeAiCall.mockResolvedValue(1);
    configureEnv();
    const provider = stubProvider(VOTE_JSON);

    const response = await post(validBody(), { "X-Game-Session-Id": "session-1" });

    expect(response.status).toBe(200);
    expect(supabaseMocks.consumeAiCall).toHaveBeenCalledWith("user-1", "session-1");
    expect(provider.calls).toBe(1);
  });

  it("用户自带 LLM 时不读平台模型配置，只记录调用次数", async () => {
    supabaseMocks.authRequired = true;
    supabaseMocks.requireAuthenticatedUser.mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
      responseHeaders: new Headers(),
    });
    supabaseMocks.recordUserAiCall.mockResolvedValue(1);
    const provider = stubProvider(VOTE_JSON);
    const userLlmConfig = {
      provider: "openai",
      apiKey: "sk-user-secret-key",
      model: "gpt-test",
    };

    const response = await post(
      { ...validBody(), userLlmConfig },
      { "X-Game-Session-Id": "session-1" },
    );

    expect(response.status).toBe(200);
    expect(supabaseMocks.recordUserAiCall).toHaveBeenCalledWith("user-1", "session-1");
    expect(supabaseMocks.consumeAiCall).not.toHaveBeenCalled();
    expect(provider.calls).toBe(1);
    expect(provider.requests[0]?.headers).toMatchObject({
      Authorization: "Bearer sk-user-secret-key",
    });
  });

  it("用户自带 LLM 被 provider 拒绝时不泄漏用户 key 或上游原始响应体", async () => {
    supabaseMocks.authRequired = true;
    supabaseMocks.requireAuthenticatedUser.mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
      responseHeaders: new Headers(),
    });
    supabaseMocks.recordUserAiCall.mockResolvedValue(1);
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubProvider("", 401);

    const response = await post(
      {
        ...validBody(),
        userLlmConfig: {
          provider: "openai",
          apiKey: "sk-user-secret-key",
          model: "gpt-test",
        },
      },
      { "X-Game-Session-Id": "session-1" },
    );

    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).not.toContain("sk-user-secret-key");
    expect(text).not.toContain("上游的原始错误体");
  });

  it("单局 AI 调用达到上限时 429，且不请求 provider", async () => {
    supabaseMocks.authRequired = true;
    supabaseMocks.requireAuthenticatedUser.mockResolvedValue({
      userId: "user-1",
      email: "user@example.com",
      responseHeaders: new Headers(),
    });
    supabaseMocks.consumeAiCall.mockRejectedValue(
      new supabaseMocks.QuotaError("AI_CALL_LIMIT", "AI_CALL_LIMIT_REACHED"),
    );
    configureEnv();
    const provider = stubProvider(VOTE_JSON);

    const response = await post(validBody(), { "X-Game-Session-Id": "session-1" });

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ code: "AI_CALL_LIMIT" });
    expect(provider.calls).toBe(0);
  });
});

describe("maxRetries 被服务端夹住", () => {
  it("provider timeout 会按 Vercel 函数时长预算夹住，避免 60s 硬超时", async () => {
    configureEnv({ LLM_TIMEOUT_MS: "120000", LLM_MAX_RETRIES: "2" });
    stubProvider(VOTE_JSON);
    const timeouts: number[] = [];
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      timeouts.push(ms);
      return new AbortController().signal;
    });

    const response = await post(validBody(2));

    expect(response.status).toBe(200);
    expect(timeouts).toEqual([18_000]);
  });

  it("不重试时把更多预算留给单次 provider 调用", async () => {
    configureEnv({ LLM_TIMEOUT_MS: "120000", LLM_MAX_RETRIES: "2" });
    stubProvider(VOTE_JSON);
    const timeouts: number[] = [];
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      timeouts.push(ms);
      return new AbortController().signal;
    });

    const response = await post(validBody(0));

    expect(response.status).toBe(200);
    expect(timeouts).toEqual([54_000]);
  });

  it("请求里写 99，实际调用次数仍按 LLM_MAX_RETRIES 算", async () => {
    configureEnv({ LLM_MAX_RETRIES: "1" });
    const provider = stubProvider("永远不合格");

    const response = await post(validBody(99));

    expect(response.status).toBe(200);
    // 不夹的话这里会是 100 次，一个请求就能烧光预算
    expect(provider.calls).toBe(2);
    await expect(response.json()).resolves.toMatchObject({ fallback: true });
  });

  it("请求里写 0 时不会被服务端放大", async () => {
    configureEnv({ LLM_MAX_RETRIES: "5" });
    const provider = stubProvider("永远不合格");

    await post(validBody(0));

    expect(provider.calls).toBe(1);
  });
});
