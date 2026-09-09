import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createConfig } from "../game/config";
import { getLegalActions } from "../game/legal";
import { createRng } from "../game/rng";
import { createGame, makePlaceholderPersonas } from "../game/setup";
import { toPlayerView } from "../game/view";
import {
  createPending,
  type AiDecisionRequest,
  type AiDecisionResult,
  type GameState,
  type Role,
} from "../game/types";
import { AiError } from "./errors";
import { createRemoteAiClient, type FetchFn } from "./remote";

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

function makeReq(): AiDecisionRequest<"VOTE"> {
  const state = voteState();
  return {
    kind: "VOTE",
    view: toPlayerView(state, 2),
    persona: { name: "P2", traits: ["谨慎"], speechStyle: "短句" },
    legalActions: getLegalActions(state, 2),
    maxRetries: 2,
    locale: "zh",
  };
}

const RESULT: AiDecisionResult<"VOTE"> = {
  payload: { reasoning: "想了想", approve: true },
  fallback: false,
  debug: { prompt: "（服务端建的）", raw: "{...}", attempts: 1 },
};

describe("正常路径", () => {
  it("把整个 AiDecisionRequest POST 过去，结果原样透传", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn: FetchFn = (url, init) => {
      calls.push({ url, init });
      return Promise.resolve(Response.json(RESULT));
    };

    const req = makeReq();
    const result = await createRemoteAiClient({ fetchFn }).decide(req);

    expect(result).toEqual(RESULT);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("/api/ai");
    expect(calls[0]?.init.method).toBe("POST");
    // 请求体就是完整的 req——服务端要靠它建 prompt
    const sent = JSON.parse(typeof calls[0]?.init.body === "string" ? calls[0].init.body : "{}");
    expect(sent).toEqual(JSON.parse(JSON.stringify(req)));
  });

  it("endpoint 可以换", async () => {
    const calls: string[] = [];
    const fetchFn: FetchFn = (url) => {
      calls.push(url);
      return Promise.resolve(Response.json(RESULT));
    };

    await createRemoteAiClient({ endpoint: "/custom/ai", fetchFn }).decide(makeReq());

    expect(calls).toEqual(["/custom/ai"]);
  });

  it("有 gameSessionId 时只放进请求头，不写进请求体", async () => {
    const calls: RequestInit[] = [];
    const fetchFn: FetchFn = (_url, init) => {
      calls.push(init);
      return Promise.resolve(Response.json(RESULT));
    };

    await createRemoteAiClient({ fetchFn, gameSessionId: "session-1" }).decide(makeReq());

    expect(calls[0]?.headers).toMatchObject({
      "Content-Type": "application/json",
      "X-Game-Session-Id": "session-1",
    });
    const sent = JSON.parse(typeof calls[0]?.body === "string" ? calls[0].body : "{}");
    expect(sent).not.toHaveProperty("gameSessionId");
  });

  it("有用户 LLM 配置时只放进请求体，不写进请求头或 prompt 字段", async () => {
    const calls: RequestInit[] = [];
    const fetchFn: FetchFn = (_url, init) => {
      calls.push(init);
      return Promise.resolve(Response.json(RESULT));
    };
    const userLlmConfig = {
      provider: "openai" as const,
      apiKey: "sk-user-secret-key",
      model: "gpt-test",
    };

    await createRemoteAiClient({ fetchFn, userLlmConfig }).decide(makeReq());

    expect(calls[0]?.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(calls[0]?.headers).not.toMatchObject({ Authorization: expect.any(String) });
    const sent = JSON.parse(typeof calls[0]?.body === "string" ? calls[0].body : "{}");
    expect(sent.userLlmConfig).toEqual(userLlmConfig);
    expect(JSON.stringify(sent.view)).not.toContain("sk-user-secret-key");
    expect(JSON.stringify(sent.persona)).not.toContain("sk-user-secret-key");
  });
});

describe("失败就抛，不兜底", () => {
  it("非 2xx 抛 AiError，并带上服务端给的那句话", async () => {
    const fetchFn: FetchFn = () =>
      Promise.resolve(Response.json({ error: "上游模型调用失败（PROVIDER_REJECTED）" }, { status: 502 }));

    const call = createRemoteAiClient({ fetchFn }).decide(makeReq());

    await expect(call).rejects.toBeInstanceOf(AiError);
    await expect(call).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      message: expect.stringContaining("PROVIDER_REJECTED"),
    });
  });

  it("错误响应体不是 JSON 时也不会崩", async () => {
    const fetchFn: FetchFn = () => Promise.resolve(new Response("502 Bad Gateway", { status: 502 }));

    await expect(createRemoteAiClient({ fetchFn }).decide(makeReq())).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
    });
  });

  it("错误响应体是 JSON 但没有 error 字段时也不会崩", async () => {
    const fetchFn: FetchFn = () => Promise.resolve(Response.json({ 别的字段: 1 }, { status: 500 }));

    await expect(createRemoteAiClient({ fetchFn }).decide(makeReq())).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      message: expect.stringContaining("500"),
    });
  });

  it("网络不通时抛，而不是转成随机兜底", async () => {
    const fetchFn: FetchFn = () => Promise.reject(new Error("Failed to fetch"));

    const call = createRemoteAiClient({ fetchFn }).decide(makeReq());

    // 兜底只服务于"模型说了胡话"。把网络故障也算进 fallback 率，那个指标就废了
    await expect(call).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });
});

describe("中止", () => {
  it("配了 signal 就挂到 fetch 上——「重开」要真的掐断在途请求", async () => {
    // 不挂的话，玩家点了重开，这次请求仍在跑，服务端也仍在向 provider 要结果
    const seen: RequestInit[] = [];
    const fetchFn: FetchFn = (_url, init) => {
      seen.push(init);
      return Promise.resolve(Response.json(RESULT));
    };
    const controller = new AbortController();

    await createRemoteAiClient({ fetchFn, signal: controller.signal }).decide(makeReq());

    expect(seen[0]?.signal).toBe(controller.signal);
  });

  it("没配 signal 时请求里根本没有这个字段", async () => {
    const seen: RequestInit[] = [];
    const fetchFn: FetchFn = (_url, init) => {
      seen.push(init);
      return Promise.resolve(Response.json(RESULT));
    };

    await createRemoteAiClient({ fetchFn }).decide(makeReq());

    expect(seen[0]).not.toHaveProperty("signal");
  });
});

describe("边界", () => {
  it("整个模块不 import client.ts，也不认识任何 key", () => {
    // 这是浏览器侧的文件。import 一次 client.ts 就会把 provider 配置和
    // apiKey 的读取路径拖进浏览器包
    const source = readFileSync(new URL("./remote.ts", import.meta.url), "utf8");
    expect(source).not.toContain("./client");
    expect(source).not.toContain("apiKey");
    expect(source).not.toContain("process.env");
  });
});
