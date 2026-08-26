/**
 * 信息隔离测试。
 *
 * toPlayerView 是 AI prompt 的唯一合法输入，任何一次泄漏都会让整局失去意义，
 * 而且在表面上看不出来——AI 只会"推理得特别准"。所以这组测试单独成文件，
 * 断言写得比别处啰嗦：宁可重复，也不能让某条泄漏没人守。
 */
import { describe, expect, it } from "vitest";
import { ROLE_ORDER, createConfig, rolesToCounts } from "./config";
import { createRng } from "./rng";
import { createGame, makePlaceholderPersonas } from "./setup";
import { toPlayerView } from "./view";
import { getKnownIdentities } from "./visibility";
import {
  createPending,
  type GameState,
  type MissionRecord,
  type PendingState,
  type Player,
  type PlayerId,
  type PlayerView,
  type ProposalRecord,
  type Role,
  type Speech,
} from "./types";

// ---------------------------------------------------------------------------
// 夹具
// ---------------------------------------------------------------------------

const seat = (roles: Role[]): Player[] =>
  roles.map((role, id) => ({
    id,
    name: `P${id}`,
    role,
    isHuman: false,
    persona: { name: `P${id}`, traits: ["占位"], speechStyle: "占位" },
  }));

/**
 * 10 人局，坏人四种角色齐全——莫德雷德和奥伯伦同时在场，
 * 是唯一能把两个可见性陷阱一次全暴露出来的排布。
 * 好人 0(梅林) 2 3(派西维尔) 5 8 9；坏人 1(莫甘娜) 4(莫德雷德) 6(奥伯伦) 7(刺客)。
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

const ALL_SEATS: PlayerId[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** 第 1 轮失败，失败票来自 1 号（莫甘娜）——这条来源绝不能进任何人的视角 */
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

const SETTLED_PROPOSAL: ProposalRecord = {
  missionIndex: 0,
  attempt: 0,
  leaderId: 0,
  team: [0, 1, 2],
  votes: { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: false, 7: false, 8: false, 9: false },
  approved: true,
  forced: false,
};

const SPEECH: Speech = {
  seq: 0,
  playerId: 3,
  phase: "REVIEW_DISCUSSION",
  missionIndex: 0,
  attempt: 0,
  content: "1 号的票很难解释",
};

function build(
  patch: Partial<GameState> = {},
  pending: Partial<PendingState> = {},
): GameState {
  const base = createGame({
    config: createConfig(TEN.length, { roles: TEN }),
    humanSeat: null,
    personas: makePlaceholderPersonas(TEN.length),
    rng: createRng(5),
  });
  return {
    ...base,
    players: seat(TEN),
    currentLeaderId: 3,
    missionIndex: 1,
    rejectCount: 0,
    goodScore: 0,
    evilScore: 1,
    missionHistory: [MISSION_0],
    proposalHistory: [SETTLED_PROPOSAL],
    speeches: [SPEECH],
    ...patch,
    pending: { ...createPending(), ...pending },
  };
}

const dump = (view: unknown): string => JSON.stringify(view);

/**
 * 剥掉 roleComposition 再做整体 grep。
 *
 * 它是开局公开的角色构成（rules.md §3.2），键就是角色名，会命中下面两条
 * 按角色名 / 按字段名做的钝断言。剥掉的正当性由「角色构成是公开信息」那一组
 * 断言单独证明：那里钉住了它对每个座位完全相同，形状上根本带不了座位号。
 *
 * **不要反过来改那两条断言的判据来迁就它**——它们的价值就在于钝。
 * 键名本身则由那一组里"键集合恰好是 ROLE_ORDER"覆盖。
 */
function withoutComposition(view: PlayerView): Omit<PlayerView, "roleComposition"> {
  const { roleComposition: _roleComposition, ...rest } = view;
  return rest;
}

const countOf = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

/** 递归收集所有非数字键。数字键是 Record<PlayerId, ...> 的座位号，不是字段名 */
function keysOf(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((item) => keysOf(item, found));
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (!/^\d+$/.test(key)) found.add(key);
      keysOf(child, found);
    }
  }
  return found;
}

/** PlayerView 允许出现的全部字段名。多出任何一个都要先想清楚它会不会泄漏 */
const ALLOWED_KEYS = new Set([
  // 顶层
  "selfId", "selfRole", "selfTeam", "knowledge",
  "phase", "missionIndex", "currentLeaderId", "rejectCount", "maxRejects",
  "players", "missionConfigs", "currentMission",
  "proposedTeam", "proposalHistory", "missionHistory", "speeches",
  "goodScore", "evilScore",
  "awaitingPlayerIds", "speakingOrder", "progress", "selfSubmitted", "reveal",
  // knowledge
  "kind", "playerId", "playerIds",
  // players / missionConfigs
  "id", "name", "isHuman", "teamSize", "failsRequired",
  // 公开的提议与任务记录
  "attempt", "leaderId", "team", "votes", "approved", "forced",
  "failCount", "succeeded",
  // speeches
  "seq", "content",
  // progress
  "submitted", "required",
]);

// ---------------------------------------------------------------------------
// 身份不外泄
// ---------------------------------------------------------------------------

describe("身份", () => {
  const OTHER_ROLES = (self: Role): Role[] => ROLE_ORDER.filter((r) => r !== self);

  it("非终局时，视角里不出现自己以外的任何角色名", () => {
    for (const phase of [
      "ROLE_REVEAL",
      "TEAM_BUILDING",
      "PROPOSAL_DISCUSSION",
      "TEAM_VOTE",
      "MISSION_EXECUTION",
      "MISSION_RESULT",
      "REVIEW_DISCUSSION",
      "ASSASSINATION",
    ] as const) {
      const state = build(
        { phase, proposedTeam: [0, 1, 2] },
        { speakingOrder: ALL_SEATS, speakerIndex: 2 },
      );
      for (const player of state.players) {
        const json = dump(withoutComposition(toPlayerView(state, player.id)));
        for (const role of OTHER_ROLES(player.role)) {
          // 连引号一起找，比对的是完整的 JSON 字符串值。
          // 裸着找 ASSASSIN 会被阶段名 ASSASSINATION 命中，
          // 找 MERLIN 会被派西维尔那条 kind: MERLIN_OR_MORGANA 命中——
          // 后者恰恰是"分不清谁是谁"，不是泄漏
          expect(json, `${phase} 阶段座位 ${player.id} 泄漏了 ${role}`).not.toContain(
            `"${role}"`,
          );
        }
      }
    }
  });

  it("knowledge 与可见性矩阵完全一致，一条不多一条不少", () => {
    const state = build({ phase: "TEAM_BUILDING" });
    for (const id of ALL_SEATS) {
      expect(toPlayerView(state, id).knowledge).toEqual(
        getKnownIdentities(id, state.players),
      );
    }
  });

  it("两个盲区在视角层依然成立：梅林看不到莫德雷德，坏人看不到奥伯伦", () => {
    const state = build({ phase: "TEAM_BUILDING" });
    const evilSeatsSeenBy = (id: PlayerId): PlayerId[] =>
      toPlayerView(state, id)
        .knowledge.filter((k) => k.kind === "IS_EVIL")
        .map((k) => k.playerId);

    expect(evilSeatsSeenBy(0)).toEqual([1, 6, 7]); // 梅林：没有 4 号莫德雷德，有 6 号奥伯伦
    expect(evilSeatsSeenBy(1)).toEqual([4, 7]); // 莫甘娜：没有 6 号奥伯伦
    expect(evilSeatsSeenBy(6)).toEqual([]); // 奥伯伦谁也看不到
    expect(evilSeatsSeenBy(2)).toEqual([]); // 忠臣谁也看不到
  });

  it("派西维尔拿到的两人按座位升序，看不出谁是梅林", () => {
    const state = build({ phase: "TEAM_BUILDING" });
    expect(toPlayerView(state, 3).knowledge).toEqual([
      { kind: "MERLIN_OR_MORGANA", playerIds: [0, 1] },
    ]);
  });
});

// ---------------------------------------------------------------------------
// 角色构成
// ---------------------------------------------------------------------------

/**
 * roleComposition 是本文件里唯一被 withoutComposition 排除在整体 grep 之外的字段。
 * 这一组就是那个排除的正当性来源，所以断言写得比别处更死。
 */
describe("角色构成是公开信息", () => {
  it("每个座位拿到的 roleComposition 完全相同", () => {
    const state = build();
    const first = JSON.stringify(toPlayerView(state, 0).roleComposition);
    for (const id of ALL_SEATS) {
      // 结构上就带不了 per-viewer 信息——这条一旦不成立，上面的排除立刻失效
      expect(JSON.stringify(toPlayerView(state, id).roleComposition), `座位 ${id}`).toBe(
        first,
      );
    }
  });

  it("等于 config.roles 的数量表", () => {
    const state = build();
    expect(toPlayerView(state, 0).roleComposition).toEqual(rolesToCounts(state.config.roles));
  });

  it("键集合恰好是 ROLE_ORDER，值全为数字，求和等于人数", () => {
    const composition = toPlayerView(build(), 0).roleComposition;
    expect(Object.keys(composition)).toEqual([...ROLE_ORDER]);
    const values = Object.values(composition);
    expect(values.every((v) => Number.isInteger(v))).toBe(true);
    expect(values.reduce((a, b) => a + b, 0)).toBe(ALL_SEATS.length);
  });

  it("序列化后不含任何座位号绑定", () => {
    const json = dump(toPlayerView(build(), 0).roleComposition);
    // {"MERLIN":1,...} 这种形状带不了座位；这里钉住的是"将来别改成带座位的形状"
    expect(json).not.toContain("playerId");
    expect(json).not.toContain("id");
    for (const id of ALL_SEATS) {
      expect(json).not.toContain(`"${id}"`);
    }
  });

  it("自定义配置也如实反映（没有莫德雷德就是 0）", () => {
    const state = build();
    const composition = toPlayerView(state, 0).roleComposition;
    // 本局排布里莫德雷德和奥伯伦都在场，各 1 个
    expect(composition.MORDRED).toBe(1);
    expect(composition.OBERON).toBe(1);
    expect(composition.MINION).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 任务票来源
// ---------------------------------------------------------------------------

describe("任务票", () => {
  it("任何一条任务记录都没有 cards / playerId 字段", () => {
    const state = build({ phase: "REVIEW_DISCUSSION" }, { speakingOrder: ALL_SEATS });
    for (const id of ALL_SEATS) {
      for (const record of toPlayerView(state, id).missionHistory) {
        expect(Object.keys(record).sort()).toEqual([
          "attempt",
          "failCount",
          "leaderId",
          "missionIndex",
          "succeeded",
          "team",
        ]);
      }
    }
  });

  it("未结算的任务票查不到——连 success 这个字段名都不该出现", () => {
    const state = build(
      { phase: "MISSION_EXECUTION", proposedTeam: [0, 1, 2] },
      {
        cards: [
          { playerId: 1, success: false },
          { playerId: 2, success: true },
        ],
      },
    );
    for (const id of ALL_SEATS) {
      const json = dump(toPlayerView(state, id));
      expect(json).not.toContain("cards");
      expect(json).not.toContain("success");
    }
    // 只剩下"交了 2 张"这个数字
    expect(toPlayerView(state, 0).progress).toEqual({ submitted: 2, required: 3 });
  });
});

// ---------------------------------------------------------------------------
// 未结算的中间态
// ---------------------------------------------------------------------------

describe("pending", () => {
  it("TEAM_VOTE 未结算时，任何人的视角里都查不到投票内容", () => {
    const votes = { 0: true, 1: false, 4: false, 7: false };
    const clean = build(
      { phase: "TEAM_VOTE", proposedTeam: [3, 4, 5], proposalHistory: [] },
      { votes },
    );
    for (const id of ALL_SEATS) {
      // 历史里一条已结算提议都没有，所以整个视角里就不该有 votes 这个字段
      expect(dump(toPlayerView(clean, id))).not.toContain("votes");
    }

    // 有历史的情况下，votes 只能来自那条已结算的记录，不能多出一份
    const withHistory = build({ phase: "TEAM_VOTE", proposedTeam: [3, 4, 5] }, { votes });
    for (const id of ALL_SEATS) {
      const view = toPlayerView(withHistory, id);
      expect(countOf(dump(view), '"votes"')).toBe(1);
      expect(view.proposalHistory).toEqual([SETTLED_PROPOSAL]);
      // 自己投没投是可以知道的，别人投没投只剩一个总数
      expect(view.progress).toEqual({ submitted: 4, required: 10 });
    }
    expect(toPlayerView(withHistory, 1).selfSubmitted).toBe(true);
    expect(toPlayerView(withHistory, 2).selfSubmitted).toBe(false);
  });

  it("刺杀阶段坏人的推测内容不进任何人的视角", () => {
    const state = build(
      { phase: "ASSASSINATION", goodScore: 3 },
      {
        assassinOpinions: [
          { playerId: 1, content: "梅林是 0 号" },
          { playerId: 4, content: "我同意" },
        ],
      },
    );
    for (const id of ALL_SEATS) {
      const json = dump(toPlayerView(state, id));
      expect(json).not.toContain("梅林是 0 号");
      expect(json).not.toContain("我同意");
      expect(json).not.toContain("assassinOpinions");
    }
  });

  it("ROLE_REVEAL 的确认名单不进视角，只剩一个数字", () => {
    const state = build({ phase: "ROLE_REVEAL" }, { acknowledged: [0, 1, 2, 3] });
    const json = dump(toPlayerView(state, 9));
    expect(json).not.toContain("acknowledged");
    expect(toPlayerView(state, 9).progress).toEqual({ submitted: 4, required: 10 });
  });

  it("视角里出现的字段名全都在白名单内", () => {
    for (const phase of [
      "ROLE_REVEAL",
      "TEAM_VOTE",
      "MISSION_EXECUTION",
      "PROPOSAL_DISCUSSION",
      "ASSASSINATION",
    ] as const) {
      const state = build(
        { phase, proposedTeam: [0, 1, 2] },
        { speakingOrder: ALL_SEATS, speakerIndex: 1, votes: { 5: true } },
      );
      for (const key of keysOf(withoutComposition(toPlayerView(state, 8)))) {
        expect(ALLOWED_KEYS, `${phase} 阶段冒出了字段 ${key}`).toContain(key);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 终局
// ---------------------------------------------------------------------------

describe("GAME_OVER", () => {
  const finished = (): GameState =>
    build({
      phase: "GAME_OVER",
      goodScore: 3,
      evilScore: 2,
      winner: "EVIL",
      winReason: "ASSASSINATION_HIT",
      assassination: {
        opinions: [
          { playerId: 1, content: "打 0 号" },
          { playerId: 4, content: "同意" },
          { playerId: 6, content: "不知道" },
          { playerId: 7, content: "就他了" },
        ],
        assassinId: 7,
        targetId: 0,
        hit: true,
      },
    });

  it("复盘时才公开身份与任务票来源", () => {
    const view = toPlayerView(finished(), 9);
    expect(view.reveal?.roles[4]).toBe("MORDRED");
    expect(view.reveal?.missions[0]?.cards).toEqual(MISSION_0.cards);
    expect(view.reveal?.assassination?.opinions).toHaveLength(4);
  });

  it("公开的仍然只是 reveal 那一块，missionHistory 照旧没有 cards", () => {
    const view = toPlayerView(finished(), 9);
    expect(view.missionHistory[0]).not.toHaveProperty("cards");
    expect(view.knowledge).toEqual([]); // 忠臣的 knowledge 不因终局而变
  });
});

// ---------------------------------------------------------------------------
// 快照：改动 toPlayerView 会立刻炸
// ---------------------------------------------------------------------------

describe("快照", () => {
  it("梅林在投票阶段的完整视角", () => {
    const state = build({ phase: "TEAM_VOTE", proposedTeam: [3, 4, 5] }, { votes: { 0: true, 6: false } });
    expect(toPlayerView(state, 0)).toMatchSnapshot();
  });

  it("忠臣在提议讨论阶段的完整视角", () => {
    const state = build(
      { phase: "PROPOSAL_DISCUSSION", proposedTeam: [3, 4, 5] },
      { speakingOrder: [3, 4, 5, 6, 7, 8, 9, 0, 1, 2], speakerIndex: 3 },
    );
    expect(toPlayerView(state, 9)).toMatchSnapshot();
  });

  it("奥伯伦在刺杀阶段的完整视角", () => {
    const state = build(
      { phase: "ASSASSINATION", goodScore: 3 },
      { assassinOpinions: [{ playerId: 1, content: "梅林是 0 号" }] },
    );
    expect(toPlayerView(state, 6)).toMatchSnapshot();
  });
});
