import { describe, expect, it } from "vitest";
import type { Persona } from "../game/types";
import type { FetchFn, LlmProviderConfig } from "./client";
import { generatePersonas } from "./personas";

/** 一个只会吐出预设正文（或直接抛）的假 provider。全程不发网络 */
function fakeProvider(turn: { content: string } | { throws: string }): {
  fetchFn: FetchFn;
  prompts: string[];
} {
  const prompts: string[] = [];
  const fetchFn: FetchFn = (_url, init) => {
    const raw = typeof init.body === "string" ? init.body : "{}";
    const body = JSON.parse(raw) as { messages: Array<{ content: string }> };
    prompts.push(body.messages.map((m) => m.content).join("\n"));
    if ("throws" in turn) return Promise.reject(new Error(turn.throws));
    return Promise.resolve(
      Response.json({ choices: [{ message: { content: turn.content } }] }),
    );
  };
  return { fetchFn, prompts };
}

const CONFIG = (fetchFn: FetchFn): LlmProviderConfig => ({
  provider: "deepseek",
  apiKey: "sk-test-secret-key",
  baseUrl: "https://api.example.com/v1",
  model: "test-model",
  fetchFn,
});

const persona = (name: string): Persona => ({
  name,
  traits: ["谨慎", "话少"],
  speechStyle: "短句，先听后说",
  mind: {
    reasoningStyle: "最先看谁和谁一起上过车",
    speechLengthHabit: "平时一两句，被追问才展开",
    pressureStyle: "被点名会先反问一句",
    mistakePattern: "容易被说话有条理的人带走",
  },
});

const payload = (names: string[]): string =>
  JSON.stringify({ personas: names.map(persona) });

const notes = (): { onNote: (n: string) => void; lines: string[] } => {
  const lines: string[] = [];
  return { onNote: (n) => lines.push(n), lines };
};

describe("正常生成", () => {
  it("拿到数量正确、字段齐全的人设", async () => {
    const { fetchFn } = fakeProvider({ content: payload(["林小雨", "老陈", "阿泽"]) });
    const result = await generatePersonas({ config: CONFIG(fetchFn), count: 3, locale: "zh" });

    expect(result).toHaveLength(3);
    expect(result[0]?.name).toBe("林小雨");
    expect(result[0]?.mind?.reasoningStyle).toContain("上过车");
  });

  it("多给了就截断，不为此重试——多出来的几份只是浪费", async () => {
    const { fetchFn } = fakeProvider({ content: payload(["甲", "乙", "丙", "丁"]) });
    const result = await generatePersonas({ config: CONFIG(fetchFn), count: 2, locale: "zh" });

    expect(result.map((p) => p.name)).toEqual(["甲", "乙"]);
  });

  /**
   * 这三条约束抄自 wolfcha，都是踩出来的：标签会让模型演一个标签而不是演一个人；
   * 字数区间与 rules.md §6 冲突；职场黑话正是 PUBLIC_SPEECH_RULES 刚禁掉的东西，
   * 从人设里漏进来等于白禁。
   */
  it("prompt 里写明了不要标签、不要字数区间、不要职场黑话", async () => {
    const { fetchFn, prompts } = fakeProvider({ content: payload(["甲"]) });
    await generatePersonas({ config: CONFIG(fetchFn), count: 1, locale: "zh" });

    const prompt = prompts[0] ?? "";
    expect(prompt).toContain("不要写 high/low/aggressive");
    expect(prompt).toContain("不要出现任何字数区间");
    expect(prompt).toContain("行业术语");
    expect(prompt).toContain("**每个人都要有缺陷**");
  });
});

// ---------------------------------------------------------------------------
// 回退
// ---------------------------------------------------------------------------

/**
 * 人设是锦上添花，不是开局的必要条件——生成失败不该让整局跑不起来。
 * 但**不能静默**：悄悄换成占位人设，你会对着一桌说话雷同的 AI 找半天 prompt 的毛病。
 */
describe("失败一律回退占位人设，并说明原因", () => {
  const cases: Array<[string, { content: string } | { throws: string }, string]> = [
    ["网络不通", { throws: "connect ECONNREFUSED" }, "ECONNREFUSED"],
    ["返回的不是 JSON", { content: "我先想想……" }, "不合格式"],
    ["字段缺斤少两", { content: '{"personas":[{"name":"甲"}]}', }, "不合格式"],
    ["数量不够", { content: payload(["甲"]) }, "只给了 1 份"],
    ["有重名", { content: payload(["甲", "甲"]) }, "重名"],
  ];

  for (const [label, turn, expected] of cases) {
    it(`${label} → 占位人设 + 打点`, async () => {
      const { fetchFn } = fakeProvider(turn);
      const { onNote, lines } = notes();
      const result = await generatePersonas({ config: CONFIG(fetchFn), count: 2, locale: "zh", onNote });

      expect(result).toHaveLength(2);
      // 占位人设的标记，makePlaceholderPersonas 给的就是这个
      expect(result[0]?.traits).toEqual(["占位"]);
      expect(lines.join(" ")).toContain(expected);
    });
  }
});
