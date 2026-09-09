import { afterEach, describe, expect, it, vi } from "vitest";
import { createConfig } from "../game/config";
import { getLegalActions } from "../game/legal";
import { createRng } from "../game/rng";
import { createGame, makePlaceholderPersonas } from "../game/setup";
import { toPlayerView } from "../game/view";
import {
  createPending,
  type AiDecisionKind,
  type AiDecisionRequest,
  type GameState,
  type PendingState,
  type Persona,
  type Player,
  type PlayerId,
  type Role,
} from "../game/types";
import {
  createAiClient,
  extractJson,
  providerConfigFromUserConfig,
  readMaxRetries,
  readProviderConfig,
  type FetchFn,
  type LlmProviderConfig,
} from "./client";
import { AiError } from "./errors";
import { buildPrompt } from "./prompt";

// ---------------------------------------------------------------------------
// 夹具
// ---------------------------------------------------------------------------

/** 好人 0(梅林) 2 3(派西维尔) 5；坏人 1(莫甘娜) 4(刺客) */
const SIX: Role[] = [
  "MERLIN",
  "MORGANA",
  "LOYAL_SERVANT",
  "PERCIVAL",
  "ASSASSIN",
  "LOYAL_SERVANT",
];

const seatsOf = (roles: Role[]): Player[] =>
  roles.map((role, id) => ({
    id,
    name: `P${id}`,
    role,
    isHuman: false,
    persona: { name: `P${id}`, traits: ["谨慎"], speechStyle: "短句" },
  }));

function build(
  patch: Partial<GameState> = {},
  pending: Partial<PendingState> = {},
): GameState {
  const base = createGame({
    config: createConfig(SIX.length, { roles: SIX }),
    humanSeat: null,
    personas: makePlaceholderPersonas(SIX.length),
    rng: createRng(5),
  });
  return {
    ...base,
    players: seatsOf(SIX),
    phase: "TEAM_VOTE",
    currentLeaderId: 3,
    proposedTeam: [0, 1],
    ...patch,
    pending: { ...createPending(), ...pending },
  };
}

function requirePersona(state: GameState, playerId: PlayerId): Persona {
  const persona = state.players.find((p) => p.id === playerId)?.persona;
  if (!persona) throw new Error(`座位 ${playerId} 没有人设`);
  return persona;
}

function makeReq<K extends AiDecisionKind>(
  state: GameState,
  playerId: PlayerId,
  kind: K,
  maxRetries = 2,
): AiDecisionRequest<K> {
  return {
    kind,
    view: toPlayerView(state, playerId),
    persona: requirePersona(state, playerId),
    legalActions: getLegalActions(state, playerId),
    maxRetries,
    locale: "zh",
  };
}

// ---------------------------------------------------------------------------
// 假的 provider
// ---------------------------------------------------------------------------

interface Captured {
  url: string;
  init: RequestInit;
  body: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    // 可选：它到底出不出现在请求里，本身就是要断言的东西
    temperature?: number;
    max_tokens?: number;
  };
}

interface FakeProvider {
  fetchFn: FetchFn;
  calls: Captured[];
}

/** 按顺序吐出预设的回合。每个回合要么是一段模型正文，要么是一个 HTTP 状态码/异常 */
type Turn =
  | { content: string }
  | { status: number; error?: { code?: string; param?: string; message?: string } }
  | { throws: string };

function fakeProvider(turns: Turn[]): FakeProvider {
  const calls: Captured[] = [];
  const fetchFn: FetchFn = (url, init) => {
    const raw = typeof init.body === "string" ? init.body : "{}";
    calls.push({ url, init, body: JSON.parse(raw) });
    const turn = turns[calls.length - 1] ?? turns[turns.length - 1];
    if (!turn) throw new Error("fakeProvider 没有预设任何回合");
    if ("throws" in turn) return Promise.reject(new Error(turn.throws));
    if ("status" in turn) {
      // 没给 error 就返回一段非 JSON 的正文：真实 provider 的网关层出错时就是这样，
      // 顺便钉住"读不出 JSON 也不能崩"
      return Promise.resolve(
        turn.error
          ? Response.json({ error: turn.error }, { status: turn.status })
          : new Response("上游的原始错误体，不该出现在任何地方", { status: turn.status }),
      );
    }
    return Promise.resolve(
      Response.json({ choices: [{ message: { content: turn.content } }] }),
    );
  };
  return { fetchFn, calls };
}

const CONFIG = (fetchFn: FetchFn): LlmProviderConfig => ({
  provider: "deepseek",
  apiKey: "sk-test-secret-key",
  baseUrl: "https://api.example.com/v1",
  model: "test-model",
  fetchFn,
  // 兜底选动作用固定种子，结果才可复现
  rng: createRng(11),
});

const VOTE_JSON = '{"reasoning":"想了想","approve":true}';

// ---------------------------------------------------------------------------

describe("正常路径", () => {
  it("解析出 payload，fallback 为 false，debug 记下真实的 prompt 与原文", async () => {
    const provider = fakeProvider([{ content: VOTE_JSON }]);
    const req = makeReq(build(), 2, "VOTE");

    const result = await createAiClient(CONFIG(provider.fetchFn)).decide(req);

    expect(result.payload).toEqual({ reasoning: "想了想", approve: true });
    expect(result.fallback).toBe(false);
    expect(result.debug?.attempts).toBe(1);
    expect(result.debug?.raw).toBe(VOTE_JSON);
    // debug.prompt 必须就是 buildPrompt 的输出，复盘面板才不会看到一份假的
    expect(result.debug?.prompt).toBe(buildPrompt(req));
    expect(provider.calls).toHaveLength(1);
  });

  it("请求形状：URL、鉴权头、模型、JSON 模式、prompt 都对", async () => {
    const provider = fakeProvider([{ content: VOTE_JSON }]);
    const req = makeReq(build(), 2, "VOTE");

    await createAiClient(CONFIG(provider.fetchFn)).decide(req);

    const call = provider.calls[0];
    expect(call?.url).toBe("https://api.example.com/v1/chat/completions");
    expect(call?.init.method).toBe("POST");
    expect(call?.init.headers).toMatchObject({
      Authorization: "Bearer sk-test-secret-key",
      "Content-Type": "application/json",
    });
    expect(call?.body.model).toBe("test-model");
    expect(call?.body.messages).toEqual([{ role: "user", content: buildPrompt(req) }]);
    expect(JSON.parse(typeof call?.init.body === "string" ? call.init.body : "{}")).toMatchObject({
      response_format: { type: "json_object" },
    });
  });

  it("baseUrl 末尾多写斜杠也不会拼出双斜杠", async () => {
    const provider = fakeProvider([{ content: VOTE_JSON }]);
    const config = { ...CONFIG(provider.fetchFn), baseUrl: "https://api.example.com/v1//" };

    await createAiClient(config).decide(makeReq(build(), 2, "VOTE"));

    expect(provider.calls[0]?.url).toBe("https://api.example.com/v1/chat/completions");
  });
});

describe("模型座位号边界", () => {
  it("组队结果从显示编号还原为内部 PlayerId，debug.raw 保留模型原文", async () => {
    const raw =
      '{"reasoning":"想了想","team":[1,3,4],"statement":"带这三位"}';
    const provider = fakeProvider([{ content: raw }]);

    const result = await createAiClient(CONFIG(provider.fetchFn)).decide(
      makeReq(build(), 2, "TEAM_PROPOSAL"),
    );

    expect(result.payload.team).toEqual([0, 2, 3]);
    expect(result.debug?.raw).toBe(raw);
  });

  it.each(["SPEECH"] as const)(
    "%s 的 suspicions 使用显示编号，返回后还原为内部 PlayerId",
    async (kind) => {
      const provider = fakeProvider([
        {
          content:
            '{"reasoning":"想了想","content":"公开发言","suspicions":[{"playerId":1,"score":0.8},{"playerId":6,"score":0.2}]}',
        },
      ]);

      const result = await createAiClient(CONFIG(provider.fetchFn)).decide(
        makeReq(build(), 2, kind),
      );

      expect(result.payload.suspicions?.map((item) => item.playerId)).toEqual([0, 5]);
    },
  );

  it("刺杀目标从显示编号还原为内部 PlayerId", async () => {
    const provider = fakeProvider([
      { content: '{"reasoning":"想了想","targetId":6}' },
    ]);

    const result = await createAiClient(CONFIG(provider.fetchFn)).decide(
      makeReq(build(), 2, "ASSASSINATION"),
    );

    expect(result.payload.targetId).toBe(5);
  });

  it("模型返回 0 号时转换为负数，由现有 schema 拒绝并重试", async () => {
    const provider = fakeProvider([
      { content: '{"reasoning":"错用了零基编号","targetId":0}' },
      { content: '{"reasoning":"改成显示编号","targetId":1}' },
    ]);

    const result = await createAiClient(CONFIG(provider.fetchFn)).decide(
      makeReq(build(), 2, "ASSASSINATION", 1),
    );

    expect(result.payload.targetId).toBe(0);
    expect(result.debug?.attempts).toBe(2);
    expect(provider.calls).toHaveLength(2);
  });
});

describe("max_tokens", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("没配就整个字段不出现——留给 provider 的默认", async () => {
    const provider = fakeProvider([{ content: VOTE_JSON }]);
    await createAiClient(CONFIG(provider.fetchFn)).decide(makeReq(build(), 2, "VOTE"));
    expect(provider.calls[0]?.body).not.toHaveProperty("max_tokens");
  });

  it("配了就照发", async () => {
    const provider = fakeProvider([{ content: VOTE_JSON }]);
    const config = { ...CONFIG(provider.fetchFn), maxTokens: 700 };

    await createAiClient(config).decide(makeReq(build(), 2, "VOTE"));

    expect(provider.calls[0]?.body.max_tokens).toBe(700);
  });

  it("extraBody 仍然排在它后面，能把它覆盖掉", async () => {
    // 「extraBody 是最后一道覆盖」这条语义不能因为新增字段而破掉
    const provider = fakeProvider([{ content: VOTE_JSON }]);
    const config = {
      ...CONFIG(provider.fetchFn),
      maxTokens: 700,
      extraBody: { max_tokens: 120 },
    };

    await createAiClient(config).decide(makeReq(build(), 2, "VOTE"));

    expect(provider.calls[0]?.body.max_tokens).toBe(120);
  });

  it("LLM_MAX_TOKENS：留空是 undefined，正整数照用", () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    vi.stubEnv("LLM_API_KEY", "sk-x");
    vi.stubEnv("LLM_MODEL", "gpt-5-nano");

    vi.stubEnv("LLM_MAX_TOKENS", "");
    expect(readProviderConfig().maxTokens).toBeUndefined();

    vi.stubEnv("LLM_MAX_TOKENS", "700");
    expect(readProviderConfig().maxTokens).toBe(700);
  });

  it("LLM_MAX_TOKENS 填了非法值要报错", () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    vi.stubEnv("LLM_API_KEY", "sk-x");
    vi.stubEnv("LLM_MODEL", "gpt-5-nano");

    for (const bad of ["0", "-1", "7.5", "很多"]) {
      vi.stubEnv("LLM_MAX_TOKENS", bad);
      expect(() => readProviderConfig(), bad).toThrow(AiError);
    }
  });
});

describe("temperature", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("默认发 0.8", async () => {
    const provider = fakeProvider([{ content: VOTE_JSON }]);
    await createAiClient(CONFIG(provider.fetchFn)).decide(makeReq(build(), 2, "VOTE"));
    expect(provider.calls[0]?.body.temperature).toBe(0.8);
  });

  it("temperature 为 null 时请求里根本没有这个字段", async () => {
    // 不是发 null——OpenAI 会把 null 当非法值。gpt-5 系列只有这一条路能走通
    const provider = fakeProvider([{ content: VOTE_JSON }]);
    const config = { ...CONFIG(provider.fetchFn), temperature: null };

    await createAiClient(config).decide(makeReq(build(), 2, "VOTE"));

    expect(provider.calls[0]?.body).not.toHaveProperty("temperature");
  });

  it("temperature 为 0 要照发，不能被当成没配", async () => {
    // 0 是 falsy，用 `config.temperature ?? DEFAULT` 之外的写法很容易在这里出错
    const provider = fakeProvider([{ content: VOTE_JSON }]);
    const config = { ...CONFIG(provider.fetchFn), temperature: 0 };

    await createAiClient(config).decide(makeReq(build(), 2, "VOTE"));

    expect(provider.calls[0]?.body.temperature).toBe(0);
  });

  it("LLM_TEMPERATURE：留空取 0.8，default 表示不发，数字照用", () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    vi.stubEnv("LLM_API_KEY", "sk-x");
    vi.stubEnv("LLM_MODEL", "gpt-5-nano");

    vi.stubEnv("LLM_TEMPERATURE", "");
    expect(readProviderConfig().temperature).toBe(0.8);

    vi.stubEnv("LLM_TEMPERATURE", "default");
    expect(readProviderConfig().temperature).toBeNull();

    vi.stubEnv("LLM_TEMPERATURE", "1.5");
    expect(readProviderConfig().temperature).toBe(1.5);
  });

  it("LLM_TEMPERATURE 填了非法值要报错", () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    vi.stubEnv("LLM_API_KEY", "sk-x");
    vi.stubEnv("LLM_MODEL", "gpt-5-nano");

    for (const bad of ["abc", "-1", "3", "0.8.1"]) {
      vi.stubEnv("LLM_TEMPERATURE", bad);
      expect(() => readProviderConfig(), bad).toThrow(AiError);
    }
  });
});

describe("LLM_EXTRA_BODY", () => {
  const stubBase = (): void => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    vi.stubEnv("LLM_API_KEY", "sk-x");
    vi.stubEnv("LLM_MODEL", "gpt-5-nano");
  };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("原样并进请求体", async () => {
    const provider = fakeProvider([{ content: VOTE_JSON }]);
    const config = {
      ...CONFIG(provider.fetchFn),
      extraBody: { reasoning_effort: "minimal" },
    };

    await createAiClient(config).decide(makeReq(build(), 2, "VOTE"));

    expect(provider.calls[0]?.body).toMatchObject({ reasoning_effort: "minimal" });
  });

  it("放在最后，能覆盖 response_format", async () => {
    // 不支持 json_object 的模型必须能把它换掉，否则这个口子等于没开
    const provider = fakeProvider([{ content: VOTE_JSON }]);
    const config = {
      ...CONFIG(provider.fetchFn),
      extraBody: { response_format: { type: "text" } },
    };

    await createAiClient(config).decide(makeReq(build(), 2, "VOTE"));

    expect(provider.calls[0]?.body).toMatchObject({ response_format: { type: "text" } });
  });

  it("留空时不往请求体里加任何东西", () => {
    stubBase();
    vi.stubEnv("LLM_EXTRA_BODY", "");
    expect(readProviderConfig().extraBody).toBeUndefined();
  });

  it("不是合法 JSON、不是对象，都要报错", () => {
    stubBase();
    for (const bad of ["{oops}", "[1,2]", '"minimal"', "3"]) {
      vi.stubEnv("LLM_EXTRA_BODY", bad);
      expect(() => readProviderConfig(), bad).toThrow(AiError);
    }
  });

  it("不许覆盖 model 与 messages", () => {
    // 覆盖了就等于换了个问题去问模型，而 debug.prompt 里记的还是原来那份，查起来能查一天
    stubBase();
    for (const bad of ['{"model":"别的"}', '{"messages":[]}']) {
      vi.stubEnv("LLM_EXTRA_BODY", bad);
      expect(() => readProviderConfig(), bad).toThrow(AiError);
    }
  });
});

describe("用户自带 LLM 配置", () => {
  it("provider 默认 baseUrl 与请求字段按现有协议发送", async () => {
    const provider = fakeProvider([{ content: VOTE_JSON }]);
    const config = {
      ...providerConfigFromUserConfig({
        provider: "openai",
        apiKey: "sk-user-secret-key",
        model: "gpt-test",
        temperature: null,
        maxTokens: 120,
        extraBody: { reasoning_effort: "minimal" },
      }),
      fetchFn: provider.fetchFn,
    };

    await createAiClient(config).decide(makeReq(build(), 2, "VOTE"));

    expect(provider.calls[0]?.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(provider.calls[0]?.init.headers).toMatchObject({
      Authorization: "Bearer sk-user-secret-key",
    });
    expect(provider.calls[0]?.body.model).toBe("gpt-test");
    expect(provider.calls[0]?.body).not.toHaveProperty("temperature");
    expect(provider.calls[0]?.body.max_tokens).toBe(120);
    expect(provider.calls[0]?.body).toMatchObject({ reasoning_effort: "minimal" });
  });

  it("custom provider 必须显式提供 baseUrl", () => {
    expect(() =>
      providerConfigFromUserConfig({
        provider: "custom",
        apiKey: "sk-user-secret-key",
        model: "gpt-test",
      }),
    ).toThrow(AiError);
  });

  it("extraBody 不能覆盖 model 与 messages", () => {
    expect(() =>
      providerConfigFromUserConfig({
        provider: "openai",
        apiKey: "sk-user-secret-key",
        model: "gpt-test",
        extraBody: { model: "other" },
      }),
    ).toThrow(AiError);
  });
});

describe("readTimeoutMs", () => {
  const stubBase = (): void => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    vi.stubEnv("LLM_API_KEY", "sk-x");
    vi.stubEnv("LLM_MODEL", "gpt-5-nano");
  };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("留空取 30s，配了就用配的", () => {
    stubBase();
    vi.stubEnv("LLM_TIMEOUT_MS", "");
    expect(readProviderConfig().timeoutMs).toBe(30_000);

    vi.stubEnv("LLM_TIMEOUT_MS", "120000");
    expect(readProviderConfig().timeoutMs).toBe(120_000);
  });

  it("非正整数要报错", () => {
    stubBase();
    for (const bad of ["0", "-1", "abc", "1.5"]) {
      vi.stubEnv("LLM_TIMEOUT_MS", bad);
      expect(() => readProviderConfig(), bad).toThrow(AiError);
    }
  });
});

describe("readMaxRetries", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("没配时用默认值 2", () => {
    vi.stubEnv("LLM_MAX_RETRIES", "");
    expect(readMaxRetries()).toBe(2);
  });

  it("配了就用配的", () => {
    vi.stubEnv("LLM_MAX_RETRIES", "5");
    expect(readMaxRetries()).toBe(5);
  });

  it("填了非法值要报错，不能默默当 0 用", () => {
    // 默默降级的后果是"我明明配了重试"和实际行为对不上，查起来很费劲
    for (const bad of ["abc", "-1", "2.5"]) {
      vi.stubEnv("LLM_MAX_RETRIES", bad);
      expect(() => readMaxRetries(), bad).toThrow(AiError);
    }
  });
});

describe("模型输出的清洗", () => {
  const cases: Array<[string, string]> = [
    ["markdown 围栏", "```json\n" + VOTE_JSON + "\n```"],
    ["不带语言标记的围栏", "```\n" + VOTE_JSON + "\n```"],
    ["<think> 推理块", `<think>我先想想 1 号可疑</think>\n${VOTE_JSON}`],
    ["推理块 + 围栏", `<thinking>嗯</thinking>\n\`\`\`json\n${VOTE_JSON}\n\`\`\``],
    // 推理块里出现花括号是常态——模型经常先在里面把 JSON 草拟一遍。
    // 这时"取第一个 { 到最后一个 }"会把废话一起圈进来，只有真的剥掉标签才救得回来
    [
      "带花括号的推理块",
      `<think>我大概要输出 {"approve": false} 吧，再想想</think>\n${VOTE_JSON}`,
    ],
    ["未闭合的推理标签", `<think>\n想了很久\n${VOTE_JSON}`],
    ["JSON 前后的废话", `好的，这是我的决定：\n${VOTE_JSON}\n希望有帮助。`],
    ["尾随逗号", '{"reasoning":"想了想","approve":true,}'],
  ];

  for (const [what, raw] of cases) {
    it(`能吃下${what}`, async () => {
      const provider = fakeProvider([{ content: raw }]);
      const result = await createAiClient(CONFIG(provider.fetchFn)).decide(
        makeReq(build(), 2, "VOTE"),
      );
      expect(result.payload).toEqual({ reasoning: "想了想", approve: true });
      // 一次过，没有走重试
      expect(provider.calls).toHaveLength(1);
      expect(result.fallback).toBe(false);
    });
  }

  it("extractJson 抠不出东西时返回 undefined", () => {
    expect(extractJson("我不想回答")).toBeUndefined();
    expect(extractJson("")).toBeUndefined();
    expect(extractJson("{ 这不是 JSON }")).toBeUndefined();
  });
});

describe("重试", () => {
  it("第一次不合 schema，第二次成功 → attempts 2，不算 fallback", async () => {
    const provider = fakeProvider([
      { content: '{"reasoning":"忘了投票字段"}' },
      { content: VOTE_JSON },
    ]);

    const result = await createAiClient(CONFIG(provider.fetchFn)).decide(
      makeReq(build(), 2, "VOTE"),
    );

    expect(result.fallback).toBe(false);
    expect(result.debug?.attempts).toBe(2);
    expect(provider.calls).toHaveLength(2);
  });

  it("重试是带着反馈重问，不是原样再发一遍", async () => {
    const badOutput = '{"reasoning":"忘了投票字段"}';
    const provider = fakeProvider([{ content: badOutput }, { content: VOTE_JSON }]);

    await createAiClient(CONFIG(provider.fetchFn)).decide(makeReq(build(), 2, "VOTE"));

    const messages = provider.calls[1]?.body.messages ?? [];
    expect(messages).toHaveLength(3);
    // 上一次的原文原样回给模型
    expect(messages[1]).toEqual({ role: "assistant", content: badOutput });
    // 以及它到底哪里不合格——safeParseAiPayload 返回字符串就是为了这一步
    expect(messages[2]?.role).toBe("user");
    expect(messages[2]?.content).toContain("approve");
  });

  it("JSON 都抠不出来时，反馈里说的是「找不到 JSON」", async () => {
    const provider = fakeProvider([{ content: "我拒绝回答" }, { content: VOTE_JSON }]);

    await createAiClient(CONFIG(provider.fetchFn)).decide(makeReq(build(), 2, "VOTE"));

    expect(provider.calls[1]?.body.messages[2]?.content).toContain("找不到合法的 JSON");
  });

  it("maxRetries 为 0 时恰好只调一次", async () => {
    const provider = fakeProvider([{ content: "永远不合格" }]);

    const result = await createAiClient(CONFIG(provider.fetchFn)).decide(
      makeReq(build(), 2, "VOTE", 0),
    );

    expect(provider.calls).toHaveLength(1);
    expect(result.fallback).toBe(true);
  });
});

describe("兜底", () => {
  it("重试用尽 → fallback true，且交出的是一个合法动作", async () => {
    const provider = fakeProvider([{ content: "永远不合格" }]);
    const req = makeReq(build(), 2, "VOTE");

    const result = await createAiClient(CONFIG(provider.fetchFn)).decide(req);

    expect(result.fallback).toBe(true);
    expect(provider.calls).toHaveLength(3); // maxRetries 2 → 一共 3 次
    expect(result.debug?.attempts).toBe(3);
    // approve 必须落在 legalActions 给出的取值里
    const allowed = req.legalActions.map((a) =>
      a.type === "CAST_VOTE" ? a.approve : undefined,
    );
    expect(allowed).toContain(result.payload.approve);
  });

  it("好人的任务票兜底永远是成功票", async () => {
    // 座位 2 是忠臣，在队伍里；legalActions 里根本没有 success: false
    const state = build({ phase: "MISSION_EXECUTION", proposedTeam: [1, 2] });
    const provider = fakeProvider([{ content: "永远不合格" }]);

    const result = await createAiClient(CONFIG(provider.fetchFn)).decide(
      makeReq(state, 2, "MISSION_CARD"),
    );

    expect(result.fallback).toBe(true);
    // 兜底借的是 mock，而 mock 只从 legalActions 里选——引擎级硬约束在这条链路上依然成立
    expect(result.payload.success).toBe(true);
  });

  it("坏人的任务票兜底两种都可能，但一定来自 legalActions", async () => {
    const state = build({ phase: "MISSION_EXECUTION", proposedTeam: [1, 2] });
    const seen = new Set<boolean>();
    for (let seed = 0; seed < 20; seed += 1) {
      const provider = fakeProvider([{ content: "永远不合格" }]);
      const config = { ...CONFIG(provider.fetchFn), rng: createRng(seed) };
      const result = await createAiClient(config).decide(makeReq(state, 1, "MISSION_CARD"));
      seen.add(result.payload.success);
    }
    expect(seen).toEqual(new Set([true, false]));
  });
});

describe("错误边界", () => {
  it("401 立即抛 PROVIDER_REJECTED，一次都不重试", async () => {
    const provider = fakeProvider([{ status: 401 }]);

    await expect(
      createAiClient(CONFIG(provider.fetchFn)).decide(makeReq(build(), 2, "VOTE")),
    ).rejects.toMatchObject({ name: "AiError", code: "PROVIDER_REJECTED" });
    // key 配错了要立刻看得见，重试和兜底都只会把它藏起来
    expect(provider.calls).toHaveLength(1);
  });

  it("404（模型名写错）同样不重试", async () => {
    const provider = fakeProvider([{ status: 404 }]);
    await expect(
      createAiClient(CONFIG(provider.fetchFn)).decide(makeReq(build(), 2, "VOTE")),
    ).rejects.toBeInstanceOf(AiError);
    expect(provider.calls).toHaveLength(1);
  });

  it("429 会重试，用尽后抛 PROVIDER_UNAVAILABLE 而不是兜底", async () => {
    const provider = fakeProvider([{ status: 429 }]);

    await expect(
      createAiClient(CONFIG(provider.fetchFn)).decide(makeReq(build(), 2, "VOTE")),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    expect(provider.calls).toHaveLength(3);
  });

  it("5xx 之后恢复正常，照样能给出结果", async () => {
    const provider = fakeProvider([{ status: 503 }, { content: VOTE_JSON }]);

    const result = await createAiClient(CONFIG(provider.fetchFn)).decide(
      makeReq(build(), 2, "VOTE"),
    );

    expect(result.fallback).toBe(false);
    expect(result.debug?.attempts).toBe(2);
    // 网络类失败是原样重发，不该往 messages 里塞反馈
    expect(provider.calls[1]?.body.messages).toHaveLength(1);
  });

  it("网络不通（fetch 直接抛）重试后仍然抛", async () => {
    const provider = fakeProvider([{ throws: "ECONNREFUSED" }]);

    await expect(
      createAiClient(CONFIG(provider.fetchFn)).decide(makeReq(build(), 2, "VOTE")),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    expect(provider.calls).toHaveLength(3);
  });

  it("响应里没有 choices[0].message.content 时按可重试处理", async () => {
    const calls: string[] = [];
    const fetchFn: FetchFn = (url) => {
      calls.push(url);
      return Promise.resolve(Response.json({ error: "什么都没有" }));
    };

    await expect(
      createAiClient(CONFIG(fetchFn)).decide(makeReq(build(), 2, "VOTE")),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    expect(calls).toHaveLength(3);
  });

  it("把上游的 error.code / error.param 带进消息里，光看 HTTP 401 查不出东西", async () => {
    // 真实踩过的两次：401 + invalid_api_key（key 是错的，不是没配）、
    // 400 + unsupported_value / temperature（gpt-5 不接受自定义温度）
    const provider = fakeProvider([
      { status: 400, error: { code: "unsupported_value", param: "temperature" } },
    ]);

    await expect(
      createAiClient(CONFIG(provider.fetchFn)).decide(makeReq(build(), 2, "VOTE")),
    ).rejects.toMatchObject({
      code: "PROVIDER_REJECTED",
      message: "deepseek 返回 HTTP 400（unsupported_value / temperature）",
      context: { status: 400, code: "unsupported_value", param: "temperature" },
    });
  });

  it("上游的 error.message 是自由文本，一个字都不带出来", async () => {
    // code/param 是短枚举串，白名单正则卡得住；message 可能带组织名、配额数字
    const provider = fakeProvider([
      {
        status: 429,
        error: {
          code: "rate_limit_exceeded",
          message: "Rate limit reached for org org-SECRET-NAME on tokens per min",
        },
      },
    ]);

    try {
      await createAiClient(CONFIG(provider.fetchFn)).decide(makeReq(build(), 2, "VOTE"));
      expect.unreachable("应该抛错");
    } catch (error) {
      const dump = `${(error as Error).message} ${JSON.stringify((error as AiError).context)}`;
      expect(dump).toContain("rate_limit_exceeded");
      expect(dump).not.toContain("org-SECRET-NAME");
    }
  });

  it("不像枚举串的 code 一律丢掉，不进消息", async () => {
    const provider = fakeProvider([
      { status: 400, error: { code: "出错了：账号 foo@bar.com 余额不足" } },
    ]);

    await expect(
      createAiClient(CONFIG(provider.fetchFn)).decide(makeReq(build(), 2, "VOTE")),
    ).rejects.toMatchObject({ message: "deepseek 返回 HTTP 400" });
  });

  it("抛出的错误里不含 apiKey，也不含上游的原始响应体", async () => {
    const provider = fakeProvider([{ status: 401 }]);

    try {
      await createAiClient(CONFIG(provider.fetchFn)).decide(makeReq(build(), 2, "VOTE"));
      expect.unreachable("应该抛错");
    } catch (error) {
      const dump = `${(error as Error).message} ${JSON.stringify((error as AiError).context)}`;
      expect(dump).not.toContain("sk-test-secret-key");
      expect(dump).not.toContain("上游的原始错误体");
    }
  });
});
