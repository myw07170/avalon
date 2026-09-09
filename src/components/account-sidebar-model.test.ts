import { describe, expect, it } from "vitest";
import { en } from "@/i18n/messages.en";
import { zh } from "@/i18n/messages.zh";
import type { ReviewSummary } from "@/lib/reviews";
import {
  draftFromUserLlmConfig,
  describeHistoryItem,
  parseUserLlmConfigDraft,
} from "./account-sidebar-model";

const review: ReviewSummary = {
  id: "session-1",
  endedAt: "2026-09-08T12:34:00.000Z",
  playerCount: 5,
  humanSeat: 0,
  winner: "GOOD",
  winReason: "ASSASSINATION_MISS",
  goodScore: 3,
  evilScore: 1,
  aiCallsUsed: 12,
};

describe("describeHistoryItem", () => {
  it("生成中文历史摘要", () => {
    const item = describeHistoryItem(review, zh, "zh");

    expect(item.title).toContain("好人阵营获胜");
    expect(item.detail).toContain("好人 3 / 坏人 1");
    expect(item.detail).toContain("5 人");
    expect(item.meta).toBe("模型调用 12 次");
  });

  it("生成英文历史摘要", () => {
    const item = describeHistoryItem({ ...review, humanSeat: null }, en, "en");

    expect(item.title).toContain("Good won");
    expect(item.detail).toContain("Good 3 / Evil 1");
    expect(item.detail).toContain("watched");
    expect(item.meta).toBe("12 model calls");
  });
});

describe("user LLM config draft", () => {
  it("把表单草稿解析为用户 LLM 配置", () => {
    const parsed = parseUserLlmConfigDraft({
      provider: "openai",
      apiKey: " sk-user ",
      model: " gpt-test ",
      baseUrl: "",
      temperature: "default",
      maxTokens: "120",
      extraBody: '{ "reasoning_effort": "minimal" }',
    });

    expect(parsed).toEqual({
      success: true,
      data: {
        provider: "openai",
        apiKey: "sk-user",
        model: "gpt-test",
        temperature: null,
        maxTokens: 120,
        extraBody: { reasoning_effort: "minimal" },
      },
    });
  });

  it("custom provider 必须填写 baseUrl", () => {
    expect(
      parseUserLlmConfigDraft({
        provider: "custom",
        apiKey: "sk-user",
        model: "gpt-test",
        baseUrl: "",
        temperature: "",
        maxTokens: "",
        extraBody: "",
      }),
    ).toEqual({ success: false, error: "BASE_URL_REQUIRED" });
  });

  it("不允许 extraBody 覆盖 model 或 messages", () => {
    expect(
      parseUserLlmConfigDraft({
        provider: "openai",
        apiKey: "sk-user",
        model: "gpt-test",
        baseUrl: "",
        temperature: "",
        maxTokens: "",
        extraBody: '{ "model": "other" }',
      }),
    ).toEqual({ success: false, error: "EXTRA_BODY_RESERVED" });
  });

  it("配置回填不会写入任何持久化存储", () => {
    const draft = draftFromUserLlmConfig({
      provider: "qwen",
      apiKey: "sk-user",
      model: "qwen-plus",
    });

    expect(draft).toMatchObject({
      provider: "qwen",
      apiKey: "sk-user",
      model: "qwen-plus",
    });
  });
});
