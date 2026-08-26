/**
 * render / parse 的往返测试。
 *
 * 【这个文件存在的唯一理由】transcripts/*.txt 是格式的**唯一真源**：
 * renderTranscript 改了分隔符而 parseTranscript 没跟上，要在这里当场炸，
 * 而不是等页面渲染出乱码才发现。
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createConfig } from "../game/config";
import { createRng } from "../game/rng";
import { createGame, makePlaceholderPersonas } from "../game/setup";
import type { GameState, Player, Role, Speech } from "../game/types";
import type { DecisionRecord } from "./orchestrator";
import {
  parseTranscript,
  renderTranscript,
  selfExposure,
  TranscriptParseError,
} from "./transcript";

const FIVE: Role[] = ["MERLIN", "MORGANA", "LOYAL_SERVANT", "PERCIVAL", "ASSASSIN"];

function seatsOf(roles: Role[]): Player[] {
  const base = createGame({
    config: createConfig(roles.length, { roles }),
    humanSeat: null,
    personas: makePlaceholderPersonas(roles.length),
    rng: createRng(3),
  });
  return base.players.map((player, index) => ({ ...player, role: roles[index] ?? player.role }));
}

function speech(seq: number, playerId: number, content: string, missionIndex = 0): Speech {
  return { seq, playerId, phase: "PROPOSAL_DISCUSSION", missionIndex, attempt: 0, content };
}

/** 一个跑到终局的最小状态。字段只填 renderTranscript 真正读的那些 */
function finished(patch: Partial<GameState> = {}): GameState {
  const base = createGame({
    config: createConfig(5, { roles: FIVE }),
    humanSeat: null,
    personas: makePlaceholderPersonas(5),
    rng: createRng(3),
  });
  return {
    ...base,
    players: seatsOf(FIVE),
    phase: "GAME_OVER",
    winner: "GOOD",
    winReason: "ASSASSINATION_MISS",
    speeches: [speech(0, 0, "我先说两句"), speech(1, 3, "我同意", 1)],
    missionHistory: [
      {
        missionIndex: 0,
        attempt: 0,
        leaderId: 0,
        team: [0, 1],
        cards: [],
        failCount: 0,
        succeeded: true,
      },
    ],
    assassination: {
      opinions: [{ playerId: 1, content: "我怀疑 3 号" }],
      assassinId: 4,
      targetId: 3,
      hit: false,
    },
    ...patch,
  };
}

function record(patch: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    playerId: 0,
    kind: "SPEECH",
    phase: "PROPOSAL_DISCUSSION",
    missionIndex: 0,
    action: { type: "SPEAK", playerId: 0, content: "我先说两句" },
    result: {
      payload: { reasoning: "想了想", content: "我先说两句" },
      fallback: false,
      debug: { prompt: "", raw: "", attempts: 1 },
    },
    rescued: false,
    ...patch,
  };
}

const META = { model: "openai / gpt-5-nano", seed: 94938 };

const roundTrip = (state: GameState, records: DecisionRecord[] = [record()]) =>
  parseTranscript(renderTranscript(state, records, META));

// ---------------------------------------------------------------------------

describe("往返", () => {
  it("渲染再读回来，每个字段都对得上", () => {
    const parsed = roundTrip(finished());

    expect(parsed.model).toBe("openai / gpt-5-nano");
    expect(parsed.seed).toBe(94938);

    expect(parsed.seats).toEqual([
      { playerId: 0, name: "AI-1", roleLabel: "梅林" },
      { playerId: 1, name: "AI-2", roleLabel: "莫甘娜" },
      { playerId: 2, name: "AI-3", roleLabel: "忠臣" },
      { playerId: 3, name: "AI-4", roleLabel: "派西维尔" },
      { playerId: 4, name: "AI-5", roleLabel: "刺客" },
    ]);

    // 轮次是 +1 之后的展示值，不是 missionIndex；提议次数同理
    expect(parsed.speeches).toEqual([
      {
        round: 1,
        attempt: 1,
        phaseLabel: "提议讨论",
        playerId: 0,
        name: "AI-1",
        roleLabel: "梅林",
        content: "我先说两句",
      },
      {
        round: 2,
        attempt: 1,
        phaseLabel: "提议讨论",
        playerId: 3,
        name: "AI-4",
        roleLabel: "派西维尔",
        content: "我同意",
      },
    ]);

    expect(parsed.missions).toEqual([{ round: 1, team: [0, 1], failCount: 0, succeeded: true }]);

    expect(parsed.assassination).toEqual({
      opinions: [{ playerId: 1, name: "AI-2", roleLabel: "莫甘娜", content: "我怀疑 3 号" }],
      target: { playerId: 3, name: "AI-4", roleLabel: "派西维尔" },
      hit: false,
    });

    expect(parsed.stats).toEqual({
      winner: "GOOD",
      winReason: "ASSASSINATION_MISS",
      calls: 1,
      fallback: { count: 0, pct: "0.0%" },
      rescued: { count: 0, pct: "0.0%" },
      avgAttempts: 1,
    });
  });

  it("正文里含 ：「」（） 和 === xxx === 也不会切错", () => {
    // 发言是模型自由文本，什么都可能出现。解析靠的是行首那段固定前缀，不是分隔符计数
    const nasty = "他说「我是好人」（存疑）：我不信。另外 === 结果 === 这几个字我也要说";
    const parsed = roundTrip(finished({ speeches: [speech(0, 0, nasty)] }));

    expect(parsed.speeches).toHaveLength(1);
    expect(parsed.speeches[0]?.content).toBe(nasty);
    expect(parsed.speeches[0]?.name).toBe("AI-1");
  });

  it("正文里的换行会被折平，格式不会被撕开", () => {
    // 折平是格式的前提：逐行的文本格式撑不住正文里的换行
    const parsed = roundTrip(finished({ speeches: [speech(0, 0, "第一句\n\n  第二句")] }));

    expect(parsed.speeches).toHaveLength(1);
    expect(parsed.speeches[0]?.content).toBe("第一句 第二句");
  });

  /**
   * 不标环节的话，同一轮的提议讨论与复盘讨论在记录里长得一模一样——
   * real-game-94938.txt 第 1 轮那 10 条就是这么黏在一起的。
   */
  it("发言行标出环节；只有组队与提议讨论带提议次数", () => {
    const text = renderTranscript(
      finished({
        speeches: [
          { seq: 0, playerId: 0, phase: "TEAM_BUILDING", missionIndex: 0, attempt: 1, content: "我带 0、1" },
          { seq: 1, playerId: 1, phase: "PROPOSAL_DISCUSSION", missionIndex: 0, attempt: 1, content: "同意" },
          { seq: 2, playerId: 2, phase: "REVIEW_DISCUSSION", missionIndex: 0, attempt: 1, content: "复盘一下" },
        ],
      }),
      [record()],
      META,
    );
    const lines = text.split("\n").filter((l) => l.trim().startsWith("[第"));

    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("[第 1 轮 第 2 次提议 组队]");
    expect(lines[1]).toContain("[第 1 轮 第 2 次提议 提议讨论]");
    // 复盘的 attempt 是"该轮最后一次提议"，标出来会让人以为复盘也分了好几次
    expect(lines[2]).toContain("[第 1 轮 复盘讨论]");
    expect(lines[2]).not.toContain("次提议");
  });

  /**
   * 三份已落盘的记录不可再生（见 transcript.ts 文件头），
   * 新增的两段必须是可选的，否则它们全部读不回来。
   */
  it("旧格式的发言行（没有提议次数与环节）照样解析得动", () => {
    const old = renderTranscript(finished(), [record()], META).replace(
      / 第 1 次提议 提议讨论]/g,
      "]",
    );
    const parsed = parseTranscript(old);

    expect(parsed.speeches).toHaveLength(2);
    expect(parsed.speeches[0]).toEqual({
      round: 1,
      playerId: 0,
      name: "AI-1",
      roleLabel: "梅林",
      content: "我先说两句",
    });
  });

  /**
   * 推理踩雷是这套记录里唯一的"模型能力指标"：已经能推出必然含坏人的组合，
   * 却仍被提名的次数。它由 deduction.ts 算，**从不进 prompt**——
   * 那是上一版的错误设计，推论人手一份，讨论就退化成装饰了。
   */
  it("踩雷段落把当时已知的依据一并写出来", () => {
    const parsed = roundTrip(
      finished({
        // 第 1 轮 0、1、4 出 2 张失败票 → 至少 2 个坏人（5 人局的全部坏人）
        missionHistory: [
          {
            missionIndex: 0,
            attempt: 0,
            leaderId: 0,
            team: [0, 1, 4],
            cards: [],
            failCount: 2,
            succeeded: false,
          },
        ],
        // 第 2 轮却又把其中两人放一起
        proposalHistory: [
          {
            missionIndex: 1,
            attempt: 0,
            leaderId: 2,
            team: [0, 1],
            votes: {},
            approved: true,
            forced: false,
          },
        ],
      }),
    );
    const text = parsed.deductionMisses.join(" ");

    expect(text).toContain("提名 0、1");
    expect(text).toContain("至少 2 个坏人");
    expect(text).toContain("提名踩雷 1/1 次");
  });

  /**
   * 三份已落盘的记录里没有这一段，而它们不可再生（见 transcript.ts 文件头）。
   * 新增小节必须是可缺席的，否则 parse 会当场把旧记录读废。
   */
  it("旧格式没有「推理踩雷」这一段，照样解析得动", () => {
    // 只挖掉这一段，其余原样保留——这才像一份真正的旧记录
    const old = renderTranscript(finished(), [record()], META).replace(
      /=== 推理踩雷 ===[\s\S]*?(?==== )/,
      "",
    );
    const parsed = parseTranscript(old);

    expect(parsed.deductionMisses).toEqual([]);
    expect(parsed.speeches).toHaveLength(2);
  });

  /**
   * 【这条是变异测试逼出来的】刺杀推测现在同时是一条公开 Speech
   * （phases/assassination.ts：不进 speeches 就谁都读不到，包括刺客自己）。
   * 于是它在对局记录里有两个可能的落点，**必须只印一次**——
   * 【刺杀】段已经连同目标和结果一起呈现了它。
   *
   * 上面那些往返用例都抓不住重复：它们的 fixture 只填了 assassination.opinions，
   * 没有对应的 ASSASSINATION 发言，而真实对局里两者一定同时存在。
   * 把过滤去掉后整个文件照样全绿——**变异测试证伪的不是实现，是测试**。
   */
  it("刺杀推测只在【刺杀】段出现一次，不重复进【全场发言】", () => {
    const state = finished({
      speeches: [
        speech(0, 0, "我先说两句"),
        {
          seq: 1,
          playerId: 1,
          phase: "ASSASSINATION",
          missionIndex: 2,
          attempt: 0,
          content: "我怀疑 3 号",
        },
      ],
    });
    const text = renderTranscript(state, [record()], META);

    expect(text.split("我怀疑 3 号").length - 1).toBe(1);

    const spoken = text.slice(text.indexOf("=== 全场发言 ==="), text.indexOf("=== 任务与提议 ==="));
    expect(spoken).not.toContain("我怀疑 3 号");
    // 统计口径也只算讨论发言，四份记录之间的数字才可比
    expect(text).toContain("共 1 条发言");

    // 格式没变，照样读得回来
    expect(parseTranscript(text).speeches).toHaveLength(1);
  });

  it("没有刺杀阶段（坏人靠任务失败赢）时 assassination 是 null", () => {
    const parsed = roundTrip(
      finished({ assassination: null, winner: "EVIL", winReason: "THREE_MISSIONS" }),
    );
    expect(parsed.assassination).toBeNull();
    expect(parsed.stats.winner).toBe("EVIL");
  });

  it("被拦下的非法动作原样保留", () => {
    const rescued = record({
      kind: "MISSION_CARD",
      action: { type: "CAST_MISSION_CARD", playerId: 0, success: true },
      result: {
        payload: { reasoning: "我要搞破坏", success: false },
        fallback: false,
        debug: { prompt: "", raw: "", attempts: 1 },
      },
      rescued: true,
    });
    const parsed = roundTrip(finished(), [rescued]);

    expect(parsed.rescuedActions).toHaveLength(1);
    // 模型原本想做什么 vs 实际提交了什么，两边都要在
    expect(parsed.rescuedActions[0]).toContain("\"success\":false");
    expect(parsed.rescuedActions[0]).toContain("\"success\":true");
    expect(parsed.stats.rescued.count).toBe(1);
  });
});

describe("解析失败要炸，不能返回半份数据", () => {
  it("没有文件头就抛", () => {
    expect(() => parseTranscript("=== 结果 ===\n  好人获胜（X）")).toThrow(TranscriptParseError);
  });

  it("不认识的小节就抛——render 加了新段而这里没跟上，要立刻知道", () => {
    const text = renderTranscript(finished(), [record()], META).replace(
      "=== 结果 ===",
      "=== 我是新来的 ===\n=== 结果 ===",
    );
    expect(() => parseTranscript(text)).toThrow(/不认识的小节/);
  });

  it("小节标题结尾少个空格也认——早期的记录就是那样落的盘", () => {
    // 第 2 局那份写的是 "=== 疑似自曝身份（…）===" 而不是 "=== … ==="。
    // 落盘的记录不可再生，历史格式只能在解析这边兼容
    const text = renderTranscript(finished(), [record()], META).replace(
      "=== 说话人提到了自己的角色名 ===",
      "=== 疑似自曝身份（说话人在自己发言里提到了自己的角色名）===",
    );
    expect(parseTranscript(text).speeches).toHaveLength(2);
  });

  it("座位行格式坏了就抛", () => {
    const text = renderTranscript(finished(), [record()], META).replace(
      "0 号「AI-1」（梅林）",
      "0 号 AI-1 梅林",
    );
    expect(() => parseTranscript(text)).toThrow(TranscriptParseError);
  });
});

describe("selfExposure", () => {
  it("给自己贴标签算 blatant", () => {
    for (const content of ["作为梅林，我建议", "我是梅林", "身为梅林", "作为 梅林 我说"]) {
      expect(selfExposure({ roleLabel: "梅林", content })?.kind, content).toBe("blatant");
    }
  });

  it("梅林谈论「梅林」只算 mention——那是正常推理，甚至是好牌", () => {
    // 第 3 局 35 条发言里 14 条 mention、0 条 blatant。一刀切会把那 14 条全误报成事故
    expect(selfExposure({ roleLabel: "梅林", content: "别急于指认梅林" })?.kind).toBe("mention");
  });

  it("提到别人的角色名不算——判定必须按说话人的身份来", () => {
    expect(selfExposure({ roleLabel: "忠臣", content: "我怀疑谁是梅林" })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 真实文件
// ---------------------------------------------------------------------------

const REAL = "transcripts/real-game-94938.txt";

/** 没有这个目录是正常情况（CI、新克隆），跳过而不是失败 */
describe.skipIf(!existsSync(REAL))("解析第 1 局那份真实记录", () => {
  it("老格式（没有「被拦下的非法动作」那一段）照样解析得动", () => {
    const parsed = parseTranscript(readFileSync(REAL, "utf8"));

    expect(parsed.seed).toBe(94938);
    expect(parsed.seats).toHaveLength(5);
    expect(parsed.speeches).toHaveLength(25);
    expect(parsed.missions).toHaveLength(3);
    expect(parsed.assassination?.hit).toBe(false);
    expect(parsed.stats.rescued.count).toBe(4);
    // 那一版还没有落"被拦下的非法动作"这一段，所以是空的，但统计数字仍然在
    expect(parsed.rescuedActions).toEqual([]);
  });

  it("那两处自曝能被认出来", () => {
    const parsed = parseTranscript(readFileSync(REAL, "utf8"));
    const blatant = parsed.speeches.filter((s) => selfExposure(s)?.kind === "blatant");

    expect(blatant.map((s) => `${s.playerId}/${s.roleLabel}`)).toEqual(["2/刺客", "3/梅林"]);
  });
});
