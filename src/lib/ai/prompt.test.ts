import { describe, expect, it } from "vitest";
import { createConfig } from "../game/config";
import { getAwaitingPlayerIds, getLegalActions } from "../game/legal";
import { createRng } from "../game/rng";
import { createGame, makePlaceholderPersonas } from "../game/setup";
import { toPlayerView } from "../game/view";
import {
  EngineError,
  ROLE_META,
  createPending,
  type AiDecisionKind,
  type GameState,
  type MissionRecord,
  type PendingState,
  type Persona,
  type Player,
  type PlayerId,
  type ProposalRecord,
  type Role,
} from "../game/types";
import { simulateGame } from "../sim/random";
import { decisionKindOf } from "./orchestrator";
import { buildPrompt } from "./prompt";
import { AI_SCHEMAS } from "./schema";

// ---------------------------------------------------------------------------
// 夹具
// ---------------------------------------------------------------------------

/**
 * 10 人局，坏人四种角色齐全（与 view.leak.test.ts 同一排布）。
 * 好人 0(梅林) 2 3(派西维尔) 5 8 9；坏人 1(莫甘娜) 4(莫德雷德) 6(奥伯伦) 7(刺客)。
 * 梅林座位 0 < 莫甘娜座位 1，所以派西维尔那条的升序断言在这局是"看不出差别"的——
 * 专门另建一局把两人的座位号倒过来。
 */
const TEN: Role[] = [
  "MERLIN",
  "MORGANA",
  "LOYAL_SERVANT",
  "PERCIVAL",
  "MORDRED",
  "LOYAL_SERVANT",
  "OBERON",
  "ASSASSIN",
  "LOYAL_SERVANT",
  "LOYAL_SERVANT",
];

/** 第 1 轮失败，失败票来自 1 号（莫甘娜）——这条来源绝不能出现在任何人的 prompt 里 */
const MISSION_0: MissionRecord = {
  missionIndex: 0,
  attempt: 0,
  leaderId: 0,
  team: [0, 1, 2],
  cards: [
    { playerId: 0, success: true },
    { playerId: 1, success: false },
    { playerId: 2, success: true },
  ],
  failCount: 1,
  succeeded: false,
};

const PROPOSAL_0: ProposalRecord = {
  missionIndex: 0,
  attempt: 0,
  leaderId: 0,
  team: [0, 1, 2],
  votes: { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: false, 7: false, 8: false, 9: false },
  approved: true,
  forced: false,
};

const seatsOf = (roles: Role[]): Player[] =>
  roles.map((role, id) => ({
    id,
    name: `P${id}`,
    role,
    isHuman: false,
    persona: {
      name: `P${id}`,
      traits: ["谨慎", "话少"],
      speechStyle: "短句，先摆事实再下判断",
    },
  }));

function build(
  roles: Role[],
  patch: Partial<GameState> = {},
  pending: Partial<PendingState> = {},
): GameState {
  const base = createGame({
    config: createConfig(roles.length, { roles }),
    humanSeat: null,
    personas: makePlaceholderPersonas(roles.length),
    rng: createRng(5),
  });
  return {
    ...base,
    players: seatsOf(roles),
    phase: "TEAM_BUILDING",
    currentLeaderId: 3,
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
): { kind: K; view: ReturnType<typeof toPlayerView>; persona: Persona; legalActions: ReturnType<typeof getLegalActions>; maxRetries: number } {
  return {
    kind,
    view: toPlayerView(state, playerId),
    persona: requirePersona(state, playerId),
    legalActions: getLegalActions(state, playerId),
    maxRetries: 2,
  };
}

const promptFor = <K extends AiDecisionKind>(
  state: GameState,
  playerId: PlayerId,
  kind: K,
): string => buildPrompt(makeReq(state, playerId, kind));

// ---------------------------------------------------------------------------
// 分节
// ---------------------------------------------------------------------------

/** 把 prompt 按【标题】切成段。测试全靠它做精确断言，而不是对整串做模糊 grep */
function sectionsOf(prompt: string): Map<string, string> {
  const result = new Map<string, string>();
  let current: string | null = null;
  const buffer: string[] = [];
  const flush = (): void => {
    if (current !== null) result.set(current, buffer.join("\n").trim());
    buffer.length = 0;
  };
  for (const line of prompt.split("\n")) {
    const header = /^【(.+)】$/.exec(line);
    if (header?.[1]) {
      flush();
      current = header[1];
    } else if (current !== null) {
      buffer.push(line);
    }
  }
  flush();
  return result;
}

const ALL_ROLE_LABELS = Object.values(ROLE_META).map((meta) => meta.label);

/**
 * 这四段由 view 的结构化数据渲染而来，天然不该出现任何角色名。
 *
 * 剩下几段可以合法出现角色名：【游戏】【本局配置】是公开规则与公开构成，
 * 【你的身份】【你知道的】是本人该知道的，【本次决策】刺杀那条要点名梅林，
 * 【全场发言】是别人说的自由文本（"我觉得 3 号是梅林"不是泄漏，是玩游戏）。
 *
 * 泄漏一旦发生，几乎必然落在【历史】里——把任务票的投票人渲染出来是最典型的一种。
 */
const CLEAN_SECTIONS = ["当前局势", "历史", "你的人设", "输出格式"];

const ALL_KINDS: AiDecisionKind[] = [
  "TEAM_PROPOSAL",
  "SPEECH",
  "VOTE",
  "MISSION_CARD",
  "ASSASSIN_OPINION",
  "ASSASSINATION",
];

// ---------------------------------------------------------------------------
// 信息隔离
// ---------------------------------------------------------------------------

describe("信息隔离", () => {
  it("【当前局势】【历史】【你的人设】【输出格式】四段里不出现任何角色名", () => {
    const state = build(TEN, {
      phase: "TEAM_BUILDING",
      missionIndex: 1,
      goodScore: 0,
      evilScore: 1,
      missionHistory: [MISSION_0],
      proposalHistory: [PROPOSAL_0],
    });

    for (const player of state.players) {
      // TEAM_PROPOSAL 的决策段不读 legalActions，所以非队长也能建，正好用来遍历全部身份
      const sections = sectionsOf(promptFor(state, player.id, "TEAM_PROPOSAL"));
      for (const name of CLEAN_SECTIONS) {
        const body = sections.get(name);
        expect(body, `缺了【${name}】段`).toBeDefined();
        for (const label of ALL_ROLE_LABELS) {
          expect(body, `座位 ${player.id} 的【${name}】里出现了「${label}」`).not.toContain(
            label,
          );
        }
      }
    }
  });

  it("【你知道的】与 view.knowledge 逐条对得上", () => {
    const state = build(TEN, { phase: "TEAM_BUILDING", currentLeaderId: 0 });
    for (const player of state.players) {
      const view = toPlayerView(state, player.id);
      const body = sectionsOf(promptFor(state, player.id, "SPEECH")).get("你知道的") ?? "";

      if (view.knowledge.length === 0) {
        expect(body, `座位 ${player.id}`).toContain("没有任何额外的身份信息");
        // 空知识的人，这一段里连座位号都不该有
        expect(body, `座位 ${player.id}`).not.toMatch(/座位 \d/);
        continue;
      }

      // 期望值在测试里独立算一遍，不复用实现里的渲染函数
      for (const item of view.knowledge) {
        if (item.kind === "IS_EVIL") {
          expect(body).toContain(`座位 ${item.playerId} 是坏人`);
        } else {
          expect(body).toContain(`座位 ${item.playerIds[0]} 和 座位 ${item.playerIds[1]} 中`);
        }
      }
      // 条数也要对得上，多一条就是凭空多知道了一个人
      expect(body.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(
        view.knowledge.length,
      );
    }
  });

  it("派西维尔看到的两个座位号按升序渲染", () => {
    // 梅林在 5 号、莫甘娜在 1 号：若实现按 [梅林, 莫甘娜] 渲染，这里就会看到 5 在前
    const roles: Role[] = [
      "LOYAL_SERVANT",
      "MORGANA",
      "PERCIVAL",
      "LOYAL_SERVANT",
      "ASSASSIN",
      "MERLIN",
    ];
    const state = build(roles, { phase: "TEAM_BUILDING", currentLeaderId: 2 });
    const body = sectionsOf(promptFor(state, 2, "SPEECH")).get("你知道的") ?? "";
    expect(body).toContain("座位 1 和 座位 5 中");
    expect(body).not.toContain("座位 5 和 座位 1 中");
  });

  it("【全场发言】原样转录 view.speeches，不加工也不添油加醋", () => {
    const state = build(TEN, {
      phase: "TEAM_BUILDING",
      speeches: [
        {
          seq: 0,
          playerId: 3,
          phase: "PROPOSAL_DISCUSSION",
          missionIndex: 0,
          attempt: 0,
          content: "1 号的票很难解释",
        },
        {
          seq: 1,
          playerId: 7,
          phase: "REVIEW_DISCUSSION",
          missionIndex: 0,
          attempt: 0,
          content: "我觉得 3 号是梅林",
        },
      ],
    });
    const body = sectionsOf(promptFor(state, 3, "TEAM_PROPOSAL")).get("全场发言") ?? "";
    const lines = body.split("\n").filter((l) => l.startsWith("- "));
    expect(lines).toHaveLength(2);
    expect(body).toContain("1 号的票很难解释");
    // 别人在发言里点名"梅林"是玩游戏，不是泄漏——这一段刻意不在 CLEAN_SECTIONS 里
    expect(body).toContain("我觉得 3 号是梅林");
  });

  /**
   * 一轮里被否决两次，就有三批发言堆在【全场发言】里。
   * 不标"第几次提议"，模型分不清哪句话是冲着哪个队伍说的。
   */
  it("组队与提议讨论的发言标出第几次提议，复盘讨论不标", () => {
    const state = build(TEN, {
      phase: "TEAM_BUILDING",
      speeches: [
        {
          seq: 0,
          playerId: 3,
          phase: "TEAM_BUILDING",
          missionIndex: 0,
          attempt: 1,
          content: "这次我带 0、1、2、4",
        },
        {
          seq: 1,
          playerId: 7,
          phase: "PROPOSAL_DISCUSSION",
          missionIndex: 0,
          attempt: 1,
          content: "换掉 4 号我就同意",
        },
        {
          seq: 2,
          playerId: 7,
          phase: "REVIEW_DISCUSSION",
          missionIndex: 0,
          // 复盘的 attempt 是"该轮最后一次提议"（types.ts 的约定），
          // 渲染出来会让模型以为复盘也分了好几次
          attempt: 1,
          content: "那张失败票只可能来自车上",
        },
      ],
    });
    const lines = (sectionsOf(promptFor(state, 3, "TEAM_PROPOSAL")).get("全场发言") ?? "")
      .split("\n")
      .filter((l) => l.startsWith("- "));

    expect(lines[0]).toContain("第 1 轮第 2 次提议 队长组队 座位 3");
    expect(lines[1]).toContain("第 1 轮第 2 次提议 提议讨论 座位 7");
    expect(lines[2]).toContain("第 1 轮复盘讨论 座位 7");
    expect(lines[2]).not.toContain("次提议");
  });
});

// ---------------------------------------------------------------------------
// 与 schema / legal 不分叉
// ---------------------------------------------------------------------------

describe("与 schema 不分叉", () => {
  const state = build(TEN, { phase: "TEAM_BUILDING", currentLeaderId: 3 });

  for (const kind of ALL_KINDS) {
    it(`${kind} 的输出示例能通过 AI_SCHEMAS[${kind}]`, () => {
      const body = sectionsOf(promptFor(state, 3, kind)).get("输出格式") ?? "";
      const example = body.split("\n").find((line) => line.startsWith("{"));
      expect(example, "【输出格式】里没有以 { 开头的示例行").toBeDefined();
      expect(() => AI_SCHEMAS[kind].parse(JSON.parse(example ?? ""))).not.toThrow();
    });
  }
});

describe("合法选项只从 legalActions 渲染", () => {
  /** 座位 2 是忠臣、座位 1 是莫甘娜，两人都在队伍里 */
  const missionState = build(
    TEN,
    { phase: "MISSION_EXECUTION", proposedTeam: [1, 2, 3] },
    { cards: [] },
  );

  it("好人的任务票决策段里根本不出现「失败」这个选项", () => {
    const body = sectionsOf(promptFor(missionState, 2, "MISSION_CARD")).get("本次决策") ?? "";
    expect(body).toContain("成功（success = true）");
    expect(body).not.toContain("失败（success = false）");
    expect(body).toContain("这是你唯一的合法选项");
  });

  it("坏人的任务票决策段里两个选项都在", () => {
    const body = sectionsOf(promptFor(missionState, 1, "MISSION_CARD")).get("本次决策") ?? "";
    expect(body).toContain("成功（success = true）");
    expect(body).toContain("失败（success = false）");
    expect(body).not.toContain("这是你唯一的合法选项");
  });

  it("刺杀的可选目标与 legalActions 完全一致", () => {
    const state = build(TEN, { phase: "ASSASSINATION", goodScore: 3 }, {
      assassinOpinions: state0Opinions(),
    });
    const body = sectionsOf(promptFor(state, 7, "ASSASSINATION")).get("本次决策") ?? "";
    // 候选目标必须与 legalActions 逐一对上：少一个是漏掉合法动作，
    // 多一个是凭空造了一个引擎会拒绝的选项
    const targets = getLegalActions(state, 7).map((action) =>
      action.type === "ASSASSINATE" ? action.targetId : -1,
    );
    expect(targets).toEqual(state.players.map((p) => p.id));
    expect(body).toContain(`座位 ${targets.join("、")}`);
  });

  it("强制通过的提议在历史里注明未投票", () => {
    // forcePassOnLastAttempt 变体下 votes 是空的，照常规写法渲染会印出"同意：无；反对：无"
    const state = build(TEN, {
      phase: "TEAM_BUILDING",
      missionIndex: 1,
      proposalHistory: [{ ...PROPOSAL_0, forced: true, votes: {} }],
    });
    const body = sectionsOf(promptFor(state, 3, "TEAM_PROPOSAL")).get("历史") ?? "";
    expect(body).toContain("强制通过（未投票）");
    expect(body).not.toContain("同意：无");
  });

  /**
   * 【本组钉住的是一个设计决定，不是一段代码】
   *
   * 曾经有一版把结论算好塞进 prompt（"这 3 人里至少 2 个坏人""2、3 号必然清白"），
   * 技术上没错，设计上错得离谱：推论人手一份，讨论就退化成装饰了。
   * 现在 prompt 只给**方法**（失败票只可能来自坏人），本局的结论必须由模型自己推、
   * 自己在发言里说出来。下面几条防的就是后人又顺手把答案塞回去。
   */
  it("规则段写明失败票数意味着什么——这是方法，不是本局情报", () => {
    const body = sectionsOf(promptFor(build(TEN), 3, "TEAM_PROPOSAL")).get("游戏") ?? "";

    expect(body).toContain("只有坏人能投失败票");
    expect(body).toContain("那车上至少有几个坏人");
    // 反向也要说，否则模型会把成功记录当免罪符
    expect(body).toContain("任务成功**不代表**车上没有坏人");
  });

  it("整份 prompt 里不出现任何算好的本局结论", () => {
    // 3 人队 2 张失败票，正是"至少 2 个坏人、任挑 2 人必带坏人"那种局面
    const state = build(TEN, {
      phase: "TEAM_BUILDING",
      missionIndex: 1,
      missionHistory: [{ ...MISSION_0, failCount: 2, cards: [] }],
    });

    for (const kind of ALL_KINDS) {
      const prompt = promptFor(state, 3, kind);
      expect(prompt, kind).not.toContain("推理线索");
      expect(prompt, kind).not.toContain("至少有 2 个坏人");
      expect(prompt, kind).not.toContain("必然都是好人");
      expect(prompt, kind).not.toContain("必然至少带上");
    }
  });

  it("组队、投票、提议讨论三处只说去哪儿看，不给结论", () => {
    const proposing = sectionsOf(promptFor(build(TEN), 3, "TEAM_PROPOSAL")).get("本次决策") ?? "";
    const voting =
      sectionsOf(
        promptFor(build(TEN, { phase: "TEAM_VOTE", proposedTeam: [0, 1, 2] }), 3, "VOTE"),
      ).get("本次决策") ?? "";
    const speaking =
      sectionsOf(
        promptFor(
          build(TEN, { phase: "PROPOSAL_DISCUSSION", proposedTeam: [0, 1, 2] }, {
            speakingOrder: [3, 4, 5, 6, 7, 8, 9, 0, 1, 2],
            speakerIndex: 0,
          }),
          3,
          "SPEECH",
        ),
      ).get("本次决策") ?? "";

    expect(proposing).toContain("回顾【历史】");
    expect(voting).toContain("上过出失败票的车");
    // 这一句是整次改动的题眼：推理靠说才能传播
    expect(speaking).toContain("得自己说出来");
  });

  it("六个 kind 都能建出非空的【本次决策】段", () => {
    for (const kind of ALL_KINDS) {
      const body = sectionsOf(promptFor(missionState, 1, kind)).get("本次决策");
      expect(body, kind).toBeTruthy();
    }
  });
});

/** 刺杀阶段：四个坏人都发表过推测，轮到刺客动手 */
function state0Opinions(): Array<{ playerId: PlayerId; content: string }> {
  return [1, 4, 6, 7].map((playerId) => ({ playerId, content: "我猜梅林是 0 号" }));
}

// ---------------------------------------------------------------------------
// 发言长度与角色提醒
// ---------------------------------------------------------------------------

describe("不许自曝身份", () => {
  // 首次真实对局里，刺客在公开发言里说"作为刺客，我会观察……"，梅林说"作为梅林……"。
  // view 给的信息是对的，是 prompt 没说清楚这段话谁能看见
  const state = build(TEN, { phase: "PROPOSAL_DISCUSSION", proposedTeam: [1, 2, 3] });

  it("会公开的两种决策都带上公开发言约束", () => {
    for (const kind of ["SPEECH", "TEAM_PROPOSAL"] as const) {
      const source = kind === "SPEECH" ? state : build(TEN, { currentLeaderId: 3 });
      const body = sectionsOf(promptFor(source, 3, kind)).get("本次决策") ?? "";
      expect(body, kind).toContain("所有人都看得见");
      expect(body, kind).toContain("不要说出自己的真实角色");
      // 抽象规则对弱模型不够用，反例是实测之后补的
      expect(body, kind).toContain("给自己贴标签");
    }
  });

  it("**不**禁止撒谎和冒充——莫甘娜冒充梅林是这个游戏的玩法", () => {
    // 把约束写成"不许撒谎"会当场毁掉莫甘娜和派西维尔的整条对局线，
    // 和"不许自曝"只差一个字，效果差一整局
    const body = sectionsOf(promptFor(state, 1, "SPEECH")).get("本次决策") ?? "";
    expect(body).toContain("冒充别的身份都可以");
  });

  it("不公开的决策不带这段，别白烧 token", () => {
    const voteState = build(TEN, { phase: "TEAM_VOTE", proposedTeam: [1, 2, 3] });
    const body = sectionsOf(promptFor(voteState, 3, "VOTE")).get("本次决策") ?? "";
    expect(body).not.toContain("所有人都看得见");
  });

  it("每个座位、每种决策的身份段都标明了这几行是私有的", () => {
    for (const player of state.players) {
      for (const kind of ["SPEECH", "VOTE"] as const) {
        const body = sectionsOf(promptFor(state, player.id, kind)).get("你的身份") ?? "";
        expect(body, `${player.id} ${kind}`).toContain("只有你自己知道");
      }
    }
  });
});

describe("好人不能投失败票，说三遍", () => {
  const missionState = build(
    TEN,
    { phase: "MISSION_EXECUTION", proposedTeam: [1, 2, 3] },
    { cards: [] },
  );

  it("好人的身份段就钉了一次，不用等到轮到他出票", () => {
    // 首次真实对局里好人试了 4 次失败票（合法性兜底 7.5%），
    // 只在【本次决策】那一刻说来不及——那时模型已经想好要破坏了
    const body = sectionsOf(promptFor(missionState, 2, "MISSION_CARD")).get("你的身份") ?? "";
    expect(body).toContain("任务票就只能是成功");
  });

  it("坏人的身份段里没有这句", () => {
    const body = sectionsOf(promptFor(missionState, 1, "MISSION_CARD")).get("你的身份") ?? "";
    expect(body).not.toContain("任务票就只能是成功");
  });

  it("输出格式段是最后读到的，那里再钉一次", () => {
    const body = sectionsOf(promptFor(missionState, 2, "MISSION_CARD")).get("输出格式") ?? "";
    expect(body).toContain("success 只能填 true");
  });

  it("坏人的输出格式段不钉——他两种票都能出", () => {
    const body = sectionsOf(promptFor(missionState, 1, "MISSION_CARD")).get("输出格式") ?? "";
    expect(body).not.toContain("只能填");
  });

  it("那句话的值取自 legalActions，不是写死的 true", () => {
    // 好人的唯一合法值本来就是 true，拿真实局面去断言"只能填 true"是**验不出**写死的——
    // 所以这里手搓一个"唯一合法值是 false"的假请求。engine 造不出这种局面，
    // 但 buildPrompt 的契约就是"照 legalActions 渲染"，喂什么就该说什么
    const req = makeReq(missionState, 2, "MISSION_CARD");
    const body =
      sectionsOf(
        buildPrompt({
          ...req,
          legalActions: [{ type: "CAST_MISSION_CARD", playerId: 2, success: false }],
        }),
      ).get("输出格式") ?? "";
    expect(body).toContain("success 只能填 false");
  });
});

describe("发言长度", () => {
  const state = build(TEN, { phase: "TEAM_BUILDING", currentLeaderId: 3 });

  it("三个要产出自由文本的 kind 都写了长度要求", () => {
    for (const kind of ["TEAM_PROPOSAL", "SPEECH", "ASSASSIN_OPINION"] as const) {
      const body = sectionsOf(promptFor(state, 3, kind)).get("本次决策") ?? "";
      expect(body, kind).toContain("2-5 句");
    }
  });

  it("整个 prompt 里不出现任何字数区间", () => {
    // 刻意用句子数而非字数：中文模型对字数感知很差，卡字数只会推高 fallback 率。
    // 这条钉住这个决定不被后人"顺手改回 80-150 字"
    for (const kind of ALL_KINDS) {
      const prompt = promptFor(state, 3, kind);
      expect(prompt, kind).not.toMatch(/\d+\s*[-–~至到]\s*\d+\s*字/);
      expect(prompt, kind).not.toContain("字数");
    }
  });
});

describe("角色专属提醒", () => {
  const state = build(TEN, { phase: "TEAM_BUILDING", currentLeaderId: 3 });

  it("梅林拿到「别把名单说太明」，忠臣拿不到", () => {
    const merlin = sectionsOf(promptFor(state, 0, "SPEECH")).get("你的身份") ?? "";
    const servant = sectionsOf(promptFor(state, 9, "SPEECH")).get("你的身份") ?? "";
    expect(merlin).toContain("说得越准，死得越快");
    expect(servant).not.toContain("说得越准，死得越快");
    expect(servant).toContain("没有任何额外信息");
  });

  it("每个角色拿到的提醒各不相同", () => {
    const hints = new Set(
      state.players.map(
        (p) => sectionsOf(promptFor(state, p.id, "SPEECH")).get("你的身份") ?? "",
      ),
    );
    // 10 个座位、7 种角色（忠臣 4 个），身份段里还带座位号，所以应该 10 段全不同
    expect(hints.size).toBe(state.players.length);
  });
});

// ---------------------------------------------------------------------------
// 纯函数
// ---------------------------------------------------------------------------

describe("纯函数", () => {
  const state = build(TEN, { phase: "TEAM_BUILDING", currentLeaderId: 3 });

  it("同一个 req 两次结果完全相同", () => {
    const req = makeReq(state, 3, "TEAM_PROPOSAL");
    expect(buildPrompt(req)).toBe(buildPrompt(req));
  });

  it("不改动传入的 req", () => {
    const req = makeReq(state, 3, "TEAM_PROPOSAL");
    const before = JSON.stringify(req);
    buildPrompt(req);
    expect(JSON.stringify(req)).toBe(before);
  });

  it("手搓出来的、自己不在 players 里的 view 抛 INTERNAL", () => {
    const req = makeReq(state, 3, "TEAM_PROPOSAL");
    const broken = { ...req, view: { ...req.view, selfId: 99 } };
    expect(() => buildPrompt(broken)).toThrow(EngineError);
  });
});

// ---------------------------------------------------------------------------
// 整局
// ---------------------------------------------------------------------------

/**
 * 在真实对局产出的每一个中间状态上建 prompt，而不是只验手工摆出来的局面。
 *
 * 借 sim/random.ts 的随机策略驱动引擎，prompt 只在旁边搭一次——
 * 这样这组断言不依赖 AI 层的任何东西，引擎怎么走都能覆盖到。
 * 内层不用 expect：几十万次断言的开销全在框架上，先收集违规、最后统一断言。
 */
describe("整局", () => {
  it("每一步、每个待行动玩家的 prompt 都不在干净段里泄漏身份", () => {
    const leaks: string[] = [];
    const kindsSeen = new Set<AiDecisionKind>();
    let longest = 0;

    for (let seed = 0; seed < 20; seed += 1) {
      simulateGame(5 + (seed % 6), seed, {
        onStep: (state) => {
          for (const playerId of getAwaitingPlayerIds(state)) {
            const first = getLegalActions(state, playerId)[0];
            if (!first) continue;
            const kind = decisionKindOf(first);
            // ROLE_REVEAL 的 ACKNOWLEDGE 不需要模型，没有对应的决策种类
            if (!kind) continue;
            kindsSeen.add(kind);

            const prompt = promptFor(state, playerId, kind);
            longest = Math.max(longest, prompt.length);
            const sections = sectionsOf(prompt);
            const where = `seed ${seed} ${state.phase} 座位 ${playerId}`;

            for (const name of CLEAN_SECTIONS) {
              const body = sections.get(name);
              if (body === undefined) {
                leaks.push(`${where}：缺了【${name}】段`);
                continue;
              }
              for (const label of ALL_ROLE_LABELS) {
                if (body.includes(label)) leaks.push(`${where}：【${name}】里出现了「${label}」`);
              }
            }
          }
        },
      });
    }

    expect(leaks).toEqual([]);
    // 顺带确认这一趟确实覆盖到了全部六种决策
    expect(kindsSeen.size).toBe(ALL_KINDS.length);
    // 长度上界。120 局（6 种人数）实测最长 13001 字符，取 16000 留一点余量。
    // 撞到它说明该考虑截断历史了——但那是届时的决定，不是现在就写进实现的容错
    expect(longest).toBeLessThan(16000);
  });
});

// ---------------------------------------------------------------------------
// 快照
// ---------------------------------------------------------------------------

/**
 * 三个代表性视角。任何人改 prompt 的结构或措辞都会炸——
 * 这不是为了拦住改动，是为了逼着改的人**读一遍 diff**：
 * prompt 是唯一能靠"读起来像在教模型作弊"发现问题的地方，自动化测不出语气。
 */
describe("快照", () => {
  const rich = build(TEN, {
    phase: "TEAM_BUILDING",
    missionIndex: 1,
    currentLeaderId: 3,
    rejectCount: 1,
    goodScore: 0,
    evilScore: 1,
    missionHistory: [MISSION_0],
    proposalHistory: [PROPOSAL_0],
    speeches: [
      {
        seq: 0,
        playerId: 3,
        phase: "REVIEW_DISCUSSION",
        missionIndex: 0,
        attempt: 0,
        content: "1 号的票很难解释",
      },
    ],
  });

  it("梅林在组队阶段的完整 prompt", () => {
    expect(promptFor({ ...rich, currentLeaderId: 0 }, 0, "TEAM_PROPOSAL")).toMatchSnapshot();
  });

  it("忠臣在提议讨论的完整 prompt", () => {
    const state = build(
      TEN,
      { phase: "PROPOSAL_DISCUSSION", proposedTeam: [0, 1, 2] },
      { speakingOrder: [3, 4, 5, 6, 7, 8, 9, 0, 1, 2], speakerIndex: 6 },
    );
    expect(promptFor(state, 9, "SPEECH")).toMatchSnapshot();
  });

  it("刺客在刺杀阶段的完整 prompt", () => {
    const state = build(TEN, { phase: "ASSASSINATION", goodScore: 3 }, {
      assassinOpinions: state0Opinions(),
    });
    expect(promptFor(state, 7, "ASSASSINATION")).toMatchSnapshot();
  });
});
