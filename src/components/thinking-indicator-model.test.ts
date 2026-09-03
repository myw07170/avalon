import { describe, expect, it } from "vitest";
import { en } from "@/i18n/messages.en";
import { zh } from "@/i18n/messages.zh";
import type { AiDecisionKind } from "@/lib/game";
import type { Thinking } from "@/store/game";
import { describeThinking } from "./thinking-indicator-model";

const KINDS: AiDecisionKind[] = [
  "TEAM_PROPOSAL",
  "SPEECH",
  "VOTE",
  "MISSION_CARD",
  "ASSASSINATION",
];

const players = [
  { id: 0, name: "林一" },
  { id: 1, name: "周二" },
  { id: 2, name: "Ann" },
];

function entry(
  kind: AiDecisionKind,
  playerId = 0,
  startedAt = 1000,
  key = `${playerId}:${kind}`,
): Thinking {
  return { key, playerId, kind, startedAt };
}

describe("describeThinking", () => {
  it("空列表不显示等待提示", () => {
    expect(describeThinking([], players, zh)).toBeNull();
  });

  it("五种 AI 决策都能生成单人提示", () => {
    for (const kind of KINDS) {
      const model = describeThinking([entry(kind)], players, zh);
      expect(model).not.toBeNull();
      expect(model?.line).toContain("1 号");
      expect(model?.line).not.toContain("林一");
      expect(model?.line).toContain(zh.thinking.kind[kind]);
    }
  });

  it("多人并发只显示人数和动作种类，不泄漏任何条目的 key", () => {
    const entries = [
      entry("VOTE", 0, 3000, "approve:true"),
      entry("VOTE", 1, 2000, "approve:false"),
      entry("VOTE", 2, 4000, "reject:false"),
    ];

    const model = describeThinking(entries, players, zh);

    expect(model?.line).toBe("3 位 AI 正在投票");
    expect(model?.line).not.toContain("approve");
  });

  it("多人状态的计时从最早开始的请求算起", () => {
    const model = describeThinking(
      [entry("MISSION_CARD", 0, 5000), entry("MISSION_CARD", 1, 1200)],
      players,
      zh,
    );

    expect(model?.startedAt).toBe(1200);
  });

  it("英文文案覆盖单人和多人状态", () => {
    const single = describeThinking([entry("ASSASSINATION", 2)], players, en);
    expect(single?.line).toBe("Seat 3 is choosing the assassination target");

    const multiple = describeThinking(
      [entry("MISSION_CARD", 0), entry("MISSION_CARD", 1)],
      players,
      en,
    );
    expect(multiple?.line).toBe("2 AIs are submitting mission cards");
  });
});
