import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

// ---------------------------------------------------------------------------
// 夹具。与 api/ai/route.test.ts 同源：Web 标准 Request，不需要起 Next
// ---------------------------------------------------------------------------

const post = (body: unknown): Promise<Response> =>
  POST(
    new Request("http://localhost/api/personas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const SECRET = "sk-personas-secret-key";

function configureEnv(overrides: Record<string, string> = {}): void {
  const env: Record<string, string> = {
    LLM_PROVIDER: "deepseek",
    LLM_API_KEY: SECRET,
    LLM_MODEL: "test-model",
    LLM_BASE_URL: "https://api.example.com/v1",
    ...overrides,
  };
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
}

/** 假的上游。记下发出去的请求体，好断言 max_tokens 那条 */
function stubProvider(content: string, status = 200): { bodies: unknown[] } {
  const state: { bodies: unknown[] } = { bodies: [] };
  vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
    state.bodies.push(JSON.parse(typeof init.body === "string" ? init.body : "{}"));
    if (status !== 200) {
      return Promise.resolve(new Response("上游的原始错误体", { status }));
    }
    return Promise.resolve(Response.json({ choices: [{ message: { content } }] }));
  });
  return state;
}

function personasJson(count: number): string {
  return JSON.stringify({
    personas: Array.from({ length: count }, (_, i) => ({
      name: `名字${i}`,
      traits: ["谨慎", "话少"],
      speechStyle: "短句",
      mind: {
        reasoningStyle: "先看票型",
        speechLengthHabit: "平时一句话",
        pressureStyle: "被点名会急",
        mistakePattern: "容易信第一个表态的人",
      },
    })),
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------

describe("正常路径", () => {
  it("200，返回人设与打点", async () => {
    configureEnv();
    stubProvider(personasJson(4));

    const response = await post({ count: 4 });
    const body = (await response.json()) as { personas: unknown[]; notes: string[] };

    expect(response.status).toBe(200);
    expect(body.personas).toHaveLength(4);
    expect(body.notes.join("\n")).toContain("已生成 4 份人设");
  });

  it("上游挂了也返回 200 —— 回退到占位人设，原因写在 notes 里", async () => {
    // 【这里刻意没有 502 分支】人设是锦上添花不是前置条件，
    // 为它中断开局是本末倒置。但回退绝不能静默（rules.md §6）
    configureEnv();
    stubProvider("", 500);

    const response = await post({ count: 5 });
    const body = (await response.json()) as {
      personas: Array<{ traits: string[] }>;
      notes: string[];
    };

    expect(response.status).toBe(200);
    expect(body.personas).toHaveLength(5);
    expect(body.personas[0]?.traits).toEqual(["占位"]);
    expect(body.notes.join("\n")).toContain("回退到占位人设");
  });

  it("人设那一次调用不发 max_tokens —— 一桌人设装不进 700 token", async () => {
    // 切到占位人设正是这个模块要修的症状，让一个提速开关把它悄悄退回去
    // 是最难查的一类坑，所以这条单独钉着
    configureEnv({ LLM_MAX_TOKENS: "700" });
    const provider = stubProvider(personasJson(9));

    await post({ count: 9 });

    expect(provider.bodies[0]).not.toHaveProperty("max_tokens");
  });
});

describe("请求体不合法", () => {
  it("不是 JSON → 400", async () => {
    configureEnv();
    const response = await post("这不是 JSON");
    expect(response.status).toBe(400);
  });

  it("count 越界 → 400，一个字都不发给上游", async () => {
    // 请求来自浏览器，是不可信输入。count: 9999 会让模型去编一万份人设
    configureEnv();
    const provider = stubProvider(personasJson(4));

    for (const count of [0, 3, 11, 9999, 4.5, "四"]) {
      const response = await post({ count });
      expect(response.status, String(count)).toBe(400);
    }
    expect(provider.bodies).toHaveLength(0);
  });

  it("count 的合法区间是 4-10（AI 座位数比总人数少 1）", async () => {
    configureEnv();
    stubProvider(personasJson(10));

    for (const count of [4, 10]) {
      expect((await post({ count })).status, String(count)).toBe(200);
    }
  });
});

describe("服务端没配好", () => {
  it("缺 key → 503，且响应体里没有密钥", async () => {
    // generatePersonas 会把配置错误也吞成占位回退，所以这一支必须由 route 自己判——
    // 否则"没配 key"会伪装成"模型不听话"
    configureEnv({ LLM_API_KEY: "" });
    const provider = stubProvider(personasJson(4));

    const response = await post({ count: 4 });
    const text = await response.text();

    expect(response.status).toBe(503);
    expect(text).toContain("LLM_API_KEY");
    expect(text).not.toContain(SECRET);
    expect(provider.bodies).toHaveLength(0);
  });

  it("LLM_PROVIDER=mock → 503", async () => {
    configureEnv({ LLM_PROVIDER: "mock" });
    expect((await post({ count: 4 })).status).toBe(503);
  });
});
