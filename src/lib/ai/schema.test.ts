import { describe, expect, it } from "vitest";
import type { AiDecisionKind } from "../game/types";
import {
  AI_SCHEMAS,
  aiAssassinationSchema,
  aiMissionCardSchema,
  aiSpeechSchema,
  aiTeamProposalSchema,
  aiVoteSchema,
  parseAiPayload,
  safeParseAiPayload,
} from "./schema";

/** 独立抄一遍，不从实现里 import——这张表就是用来钉住实现不漏项的 */
const ALL_KINDS: AiDecisionKind[] = [
  "TEAM_PROPOSAL",
  "SPEECH",
  "VOTE",
  "MISSION_CARD",
  "ASSASSIN_OPINION",
  "ASSASSINATION",
];

const VALID: { [K in AiDecisionKind]: unknown } = {
  TEAM_PROPOSAL: { reasoning: "想了想", team: [0, 2, 3], statement: "我带这三个" },
  SPEECH: { reasoning: "想了想", content: "我觉得 2 号有问题" },
  VOTE: { reasoning: "想了想", approve: true },
  MISSION_CARD: { reasoning: "想了想", success: false },
  ASSASSIN_OPINION: { reasoning: "想了想", content: "梅林大概是 4 号" },
  ASSASSINATION: { reasoning: "想了想", targetId: 4 },
};

describe("AI_SCHEMAS 映射表", () => {
  it("每个 AiDecisionKind 都有对应 schema，且没有多余的键", () => {
    expect(new Set(Object.keys(AI_SCHEMAS))).toEqual(new Set(ALL_KINDS));
  });

  it("ASSASSIN_OPINION 与 SPEECH 共用同一个 schema", () => {
    // 不是"内容相同"而是同一个对象：AiDecisionPayload 里它们本就是同一个 AiSpeech
    expect(AI_SCHEMAS.ASSASSIN_OPINION).toBe(AI_SCHEMAS.SPEECH);
    expect(AI_SCHEMAS.SPEECH).toBe(aiSpeechSchema);
  });

  it("其余四项指向各自的 schema", () => {
    expect(AI_SCHEMAS.TEAM_PROPOSAL).toBe(aiTeamProposalSchema);
    expect(AI_SCHEMAS.VOTE).toBe(aiVoteSchema);
    expect(AI_SCHEMAS.MISSION_CARD).toBe(aiMissionCardSchema);
    expect(AI_SCHEMAS.ASSASSINATION).toBe(aiAssassinationSchema);
  });

  it("每个 kind 的合法样例都能通过", () => {
    for (const kind of ALL_KINDS) {
      expect(() => parseAiPayload(kind, VALID[kind]), kind).not.toThrow();
    }
  });
});

describe("宽进：模型多说的不算错", () => {
  it("未知字段被静默剥离，不触发重试", () => {
    const parsed = parseAiPayload("VOTE", {
      reasoning: "想了想",
      approve: false,
      confidence: 0.9,
      notes: "顺手加的",
    });
    expect(parsed).toEqual({ reasoning: "想了想", approve: false });
    expect(Object.keys(parsed)).not.toContain("confidence");
  });

  it("每个 kind 都剥离未知字段", () => {
    for (const kind of ALL_KINDS) {
      const parsed = parseAiPayload(kind, {
        ...(VALID[kind] as object),
        someExtraKey: 1,
      });
      expect(Object.keys(parsed), kind).not.toContain("someExtraKey");
    }
  });

  it("字符串两端空白被 trim", () => {
    const parsed = parseAiPayload("SPEECH", {
      reasoning: "想了想",
      content: "  我觉得 2 号有问题  ",
    });
    expect(parsed.content).toBe("我觉得 2 号有问题");
  });

  it("suspicions 可缺省，缺省时结果里没有这个键", () => {
    const parsed = parseAiPayload("SPEECH", VALID.SPEECH);
    expect(Object.keys(parsed)).toEqual(["reasoning", "content"]);
  });

  it("suspicions 给了就保留，score 不卡 0-1", () => {
    const parsed = parseAiPayload("SPEECH", {
      reasoning: "想了想",
      content: "有话说",
      // 模型给了 0-100 的分，schema 不管，归一化是 UI 的事
      suspicions: [{ playerId: 1, score: 87 }],
    });
    expect(parsed.suspicions).toEqual([{ playerId: 1, score: 87 }]);
  });
});

describe("严出：形状不对就是不对", () => {
  const bad: Array<[AiDecisionKind, string, unknown]> = [
    ["VOTE", "缺 approve", { reasoning: "想了想" }],
    ["VOTE", "approve 不是 boolean", { reasoning: "x", approve: "yes" }],
    ["VOTE", "整个不是对象", "approve"],
    ["MISSION_CARD", "success 不是 boolean", { reasoning: "x", success: 1 }],
    ["TEAM_PROPOSAL", "team 不是数组", { reasoning: "x", team: 3, statement: "带三个" }],
    ["TEAM_PROPOSAL", "team 为空", { reasoning: "x", team: [], statement: "带三个" }],
    ["TEAM_PROPOSAL", "team 里有非整数", { reasoning: "x", team: [0, 1.5], statement: "带" }],
    ["TEAM_PROPOSAL", "statement 为空白", { reasoning: "x", team: [0], statement: "   " }],
    ["SPEECH", "content 为空串", { reasoning: "x", content: "" }],
    ["SPEECH", "content 全是空白", { reasoning: "x", content: "   " }],
    ["SPEECH", "suspicions 里 score 不是数字", {
      reasoning: "x",
      content: "有话说",
      suspicions: [{ playerId: 0, score: "高" }],
    }],
    ["ASSASSINATION", "targetId 为负", { reasoning: "x", targetId: -1 }],
    ["ASSASSINATION", "targetId 非整数", { reasoning: "x", targetId: 1.5 }],
    ["ASSASSINATION", "targetId 是字符串", { reasoning: "x", targetId: "4" }],
  ];

  for (const [kind, why, raw] of bad) {
    it(`${kind}：${why}`, () => {
      expect(() => parseAiPayload(kind, raw)).toThrow();
      expect(safeParseAiPayload(kind, raw).success).toBe(false);
    });
  }
});

/**
 * 本文件的边界：schema 只管形状，语义合法性归 legal.ts 的 assertLegal。
 *
 * 这一组是**反向**断言——它们全都"应该通过"。写在这里是为了拦住后人
 * 顺手往 schema 里补规则：规则写两遍必然分叉，而分叉的那份一定是这份。
 */
describe("边界：不替 assertLegal 判合法性", () => {
  it("队伍人数明显不对，schema 照样放行", () => {
    expect(() =>
      parseAiPayload("TEAM_PROPOSAL", {
        reasoning: "x",
        team: [0, 1, 2, 3, 4, 5, 6, 7],
        statement: "我全带上",
      }),
    ).not.toThrow();
  });

  it("队伍里有重复座位，schema 照样放行", () => {
    expect(() =>
      parseAiPayload("TEAM_PROPOSAL", {
        reasoning: "x",
        team: [2, 2, 2],
        statement: "就他仨",
      }),
    ).not.toThrow();
  });

  it("好人交上来的失败票，schema 照样放行（由 GOOD_CANNOT_FAIL 拦）", () => {
    expect(() =>
      parseAiPayload("MISSION_CARD", { reasoning: "x", success: false }),
    ).not.toThrow();
  });

  it("刺杀目标是个不存在的大座位号，schema 照样放行（由 INVALID_TARGET 拦）", () => {
    expect(() =>
      parseAiPayload("ASSASSINATION", { reasoning: "x", targetId: 999 }),
    ).not.toThrow();
  });
});

describe("safeParseAiPayload", () => {
  it("成功时给出解析后的数据", () => {
    const result = safeParseAiPayload("VOTE", VALID.VOTE);
    expect(result).toEqual({ success: true, data: { reasoning: "想了想", approve: true } });
  });

  it("失败时给出可读的错误文本，含出错字段路径", () => {
    const result = safeParseAiPayload("ASSASSINATION", { reasoning: "x", targetId: -1 });
    expect(result.success).toBe(false);
    if (result.success) return;
    // client.ts 要把这段塞回下一轮 prompt，所以必须指得出是哪个字段
    expect(result.error).toContain("targetId");
  });

  it("多处出错时全部列出", () => {
    const result = safeParseAiPayload("TEAM_PROPOSAL", { team: "三个人" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("reasoning");
    expect(result.error).toContain("team");
    expect(result.error).toContain("statement");
  });
});
