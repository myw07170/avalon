import { describe, expect, it } from "vitest";
import { en } from "@/i18n/messages.en";
import { zh } from "@/i18n/messages.zh";
import type { ReviewSummary } from "@/lib/reviews";
import { describeHistoryItem } from "./account-sidebar-model";

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
