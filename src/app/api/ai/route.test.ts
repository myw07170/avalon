import { afterEach, describe, expect, it, vi } from "vitest";
import { createConfig } from "@/lib/game/config";
import { getLegalActions } from "@/lib/game/legal";
import { createRng } from "@/lib/game/rng";
import { createGame, makePlaceholderPersonas } from "@/lib/game/setup";
import { toPlayerView } from "@/lib/game/view";
import { createPending, type GameState, type Role } from "@/lib/game/types";
import { POST } from "./route";

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

const post = (body: unknown): Promise<Response> =>
  POST(
    new Request("http://localhost/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
function stubProvider(content: string, status = 200): { calls: number } {
  const state = { calls: 0 };
  vi.stubGlobal("fetch", () => {
    state.calls += 1;
    if (status !== 200) {
      return Promise.resolve(new Response("上游的原始错误体", { status }));
    }
    return Promise.resolve(Response.json({ choices: [{ message: { content } }] }));
  });
  return state;
}

const VOTE_JSON = '{"reasoning":"想了想","approve":true}';

afterEach(() => {
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

describe("maxRetries 被服务端夹住", () => {
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
