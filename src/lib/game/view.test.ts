import { describe, expect, it } from "vitest";
import { createConfig } from "./config";
import { getAwaitingPlayerIds } from "./legal";
import { createRng } from "./rng";
import { createGame, makePlaceholderPersonas } from "./setup";
import { toPlayerView } from "./view";
import { getKnownIdentities } from "./visibility";
import {
  EngineError,
  createPending,
  type GameState,
  type MissionRecord,
  type PendingState,
  type Player,
  type PlayerId,
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

/** 7 人局：坏人 1（莫甘娜）、4（奥伯伦）、5（刺客），梅林 0，派西维尔 3 */
const SEVEN: Role[] = [
  "MERLIN",
  "MORGANA",
  "LOYAL_SERVANT",
  "PERCIVAL",
  "OBERON",
  "ASSASSIN",
  "LOYAL_SERVANT",
];

const ALL_SEATS: PlayerId[] = [0, 1, 2, 3, 4, 5, 6];

/** 第 1 轮失败：1 号（莫甘娜）投了失败票。cards 只存在 GameState 里 */
const MISSION_0: MissionRecord = {
  missionIndex: 0,
  attempt: 1,
  leaderId: 1,
  team: [0, 1],
  cards: [
    { playerId: 0, success: true },
    { playerId: 1, success: false },
  ],
  failCount: 1,
  succeeded: false,
};

const PROPOSALS: ProposalRecord[] = [
  {
    missionIndex: 0,
    attempt: 0,
    leaderId: 0,
    team: [0, 3],
    votes: { 0: true, 1: false, 2: false, 3: true, 4: false, 5: false, 6: true },
    approved: false,
    forced: false,
  },
  {
    missionIndex: 0,
    attempt: 1,
    leaderId: 1,
    team: [0, 1],
    votes: { 0: true, 1: true, 2: true, 3: true, 4: true, 5: false, 6: false },
    approved: true,
    forced: false,
  },
];

const SPEECHES: Speech[] = [
  {
    seq: 0,
    playerId: 1,
    phase: "PROPOSAL_DISCUSSION",
    missionIndex: 0,
    attempt: 1,
    content: "这队我信得过",
  },
  {
    seq: 1,
    playerId: 2,
    phase: "PROPOSAL_DISCUSSION",
    missionIndex: 0,
    attempt: 1,
    content: "1 号很可疑",
  },
];

function build(
  patch: Partial<GameState> = {},
  pending: Partial<PendingState> = {},
): GameState {
  const roles = SEVEN;
  const base = createGame({
    config: createConfig(roles.length, { roles }),
    humanSeat: null,
    personas: makePlaceholderPersonas(roles.length),
    rng: createRng(3),
  });
  return {
    ...base,
    players: seat(roles),
    currentLeaderId: 2,
    missionIndex: 1,
    rejectCount: 1,
    goodScore: 0,
    evilScore: 1,
    missionHistory: [MISSION_0],
    proposalHistory: PROPOSALS,
    speeches: SPEECHES,
    ...patch,
    pending: { ...createPending(), ...pending },
  };
}

/** 一局打完的状态，用来测 reveal */
const finished = (): GameState =>
  build({
    phase: "GAME_OVER",
    goodScore: 3,
    evilScore: 1,
    winner: "GOOD",
    winReason: "ASSASSINATION_MISS",
    assassination: {
      assassinId: 5,
      targetId: 2,
      hit: false,
    },
  });

// ---------------------------------------------------------------------------
// 字段映射
// ---------------------------------------------------------------------------

describe("toPlayerView：基础字段", () => {
  it("自己的身份、阵营与配置原样带过来", () => {
    const state = build({ phase: "TEAM_BUILDING" });
    const view = toPlayerView(state, 1);
    expect(view).toMatchObject({
      selfId: 1,
      selfRole: "MORGANA",
      selfTeam: "EVIL",
      phase: "TEAM_BUILDING",
      missionIndex: 1,
      currentLeaderId: 2,
      rejectCount: 1,
      maxRejects: 5,
      goodScore: 0,
      evilScore: 1,
    });
    // 7 人局第 2 轮：3 人队，1 张失败票即失败
    expect(view.currentMission).toEqual({ teamSize: 3, failsRequired: 1 });
    expect(view.missionConfigs).toHaveLength(5);
    expect(view.missionConfigs[3]).toEqual({ teamSize: 4, failsRequired: 2 });
  });

  it("players 只有座位号、名字、是否人类——没有角色也没有人设", () => {
    const view = toPlayerView(build({ phase: "TEAM_BUILDING" }), 6);
    for (const player of view.players) {
      expect(Object.keys(player).sort()).toEqual(["id", "isHuman", "name"]);
    }
    expect(view.players.map((p) => p.id)).toEqual(ALL_SEATS);
  });

  it("knowledge 直接委托给 getKnownIdentities，不在这里重算一遍", () => {
    const state = build({ phase: "TEAM_BUILDING" });
    for (const id of ALL_SEATS) {
      expect(toPlayerView(state, id).knowledge).toEqual(
        getKnownIdentities(id, state.players),
      );
    }
  });

  it("missionHistory 换成公开记录：有失败票数量，没有投票者", () => {
    const view = toPlayerView(build({ phase: "TEAM_BUILDING" }), 0);
    expect(view.missionHistory).toEqual([
      {
        missionIndex: 0,
        attempt: 1,
        team: [0, 1],
        leaderId: 1,
        failCount: 1,
        succeeded: false,
      },
    ]);
  });

  it("已结算的提议投票完全公开", () => {
    const view = toPlayerView(build({ phase: "TEAM_BUILDING" }), 0);
    expect(view.proposalHistory).toEqual(PROPOSALS);
    expect(view.speeches).toEqual(SPEECHES);
  });

  it("awaitingPlayerIds 与 getAwaitingPlayerIds 一致", () => {
    const state = build(
      { phase: "TEAM_VOTE", proposedTeam: [0, 1, 2] },
      { votes: { 3: true } },
    );
    expect(toPlayerView(state, 0).awaitingPlayerIds).toEqual(
      getAwaitingPlayerIds(state),
    );
  });

  it("speakingOrder 只在讨论阶段有值", () => {
    const order = [2, 3, 4, 5, 6, 0, 1];
    const talking = build(
      { phase: "PROPOSAL_DISCUSSION", proposedTeam: [0, 1, 2] },
      { speakingOrder: order, speakerIndex: 2 },
    );
    expect(toPlayerView(talking, 0).speakingOrder).toEqual(order);
    expect(toPlayerView(build({ phase: "TEAM_BUILDING" }), 0).speakingOrder).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// pending 的折算
// ---------------------------------------------------------------------------

describe("toPlayerView：progress 与 selfSubmitted", () => {
  it("ROLE_REVEAL 数确认人数，selfSubmitted 只看自己", () => {
    const state = build({ phase: "ROLE_REVEAL" }, { acknowledged: [1, 3] });
    expect(toPlayerView(state, 3).progress).toEqual({ submitted: 2, required: 7 });
    expect(toPlayerView(state, 3).selfSubmitted).toBe(true);
    expect(toPlayerView(state, 0).selfSubmitted).toBe(false);
  });

  it("TEAM_VOTE 只给数量，投没投过只反映自己", () => {
    const state = build(
      { phase: "TEAM_VOTE", proposedTeam: [0, 1, 2] },
      { votes: { 1: false, 4: true, 5: true } },
    );
    expect(toPlayerView(state, 4).progress).toEqual({ submitted: 3, required: 7 });
    expect(toPlayerView(state, 4).selfSubmitted).toBe(true);
    expect(toPlayerView(state, 0).selfSubmitted).toBe(false);
  });

  it("MISSION_EXECUTION 的分母是队伍人数，不是总人数", () => {
    const state = build(
      { phase: "MISSION_EXECUTION", proposedTeam: [0, 1, 2] },
      { cards: [{ playerId: 1, success: false }] },
    );
    expect(toPlayerView(state, 1).progress).toEqual({ submitted: 1, required: 3 });
    expect(toPlayerView(state, 1).selfSubmitted).toBe(true);
    expect(toPlayerView(state, 2).selfSubmitted).toBe(false);
  });

  it("讨论阶段按发言游标算，已说过的人 selfSubmitted 为 true", () => {
    const state = build(
      { phase: "PROPOSAL_DISCUSSION", proposedTeam: [0, 1, 2] },
      { speakingOrder: [2, 3, 4, 5, 6, 0, 1], speakerIndex: 2 },
    );
    expect(toPlayerView(state, 2).progress).toEqual({ submitted: 2, required: 7 });
    expect(toPlayerView(state, 2).selfSubmitted).toBe(true); // 已说
    expect(toPlayerView(state, 4).selfSubmitted).toBe(false); // 正轮到他
    expect(toPlayerView(state, 1).selfSubmitted).toBe(false); // 还没轮到
  });

  it("刺杀阶段只等待刺客的一次选择", () => {
    const state = build({ phase: "ASSASSINATION", goodScore: 3 });
    expect(toPlayerView(state, 2).progress).toEqual({ submitted: 0, required: 1 });
    expect(toPlayerView(state, 1).selfSubmitted).toBe(false);
    expect(toPlayerView(state, 5).selfSubmitted).toBe(false);
  });

  it("等系统推进的阶段没有人要提交", () => {
    for (const phase of ["SETUP", "MISSION_RESULT"] as const) {
      const view = toPlayerView(build({ phase }), 0);
      expect(view.progress).toEqual({ submitted: 0, required: 0 });
      expect(view.selfSubmitted).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 终局复盘
// ---------------------------------------------------------------------------

describe("toPlayerView：reveal", () => {
  it("非终局阶段一律为 null", () => {
    for (const phase of [
      "SETUP",
      "ROLE_REVEAL",
      "TEAM_BUILDING",
      "TEAM_VOTE",
      "MISSION_RESULT",
      "ASSASSINATION",
    ] as const) {
      expect(toPlayerView(build({ phase }), 0).reveal).toBeNull();
    }
  });

  it("GAME_OVER 时公开全部身份、任务票来源与刺杀结果", () => {
    const view = toPlayerView(finished(), 6);
    expect(view.reveal?.roles).toEqual({
      0: "MERLIN",
      1: "MORGANA",
      2: "LOYAL_SERVANT",
      3: "PERCIVAL",
      4: "OBERON",
      5: "ASSASSIN",
      6: "LOYAL_SERVANT",
    });
    expect(view.reveal?.missions[0]?.cards).toEqual(MISSION_0.cards);
    expect(view.reveal).toMatchObject({
      winner: "GOOD",
      winReason: "ASSASSINATION_MISS",
      assassination: { assassinId: 5, targetId: 2, hit: false },
    });
    // 复盘之外的字段仍然是公开版本：missionHistory 依旧没有 cards
    expect(view.missionHistory[0]).not.toHaveProperty("cards");
  });

  it("GAME_OVER 却没有胜负结果就是引擎 bug", () => {
    const broken = build({ phase: "GAME_OVER", winner: null, winReason: null });
    expect(() => toPlayerView(broken, 0)).toThrow(EngineError);
  });
});

// ---------------------------------------------------------------------------
// 纯函数与边界
// ---------------------------------------------------------------------------

describe("toPlayerView：纯函数与边界", () => {
  it("不改动传入的 state", () => {
    const state = build({ phase: "TEAM_VOTE", proposedTeam: [0, 1, 2] }, { votes: { 3: true } });
    const before = JSON.stringify(state);
    ALL_SEATS.forEach((id) => toPlayerView(state, id));
    expect(JSON.stringify(state)).toBe(before);
  });

  it("返回的数组是拷贝，改 view 改不到引擎状态", () => {
    const state = build({ phase: "TEAM_BUILDING", proposedTeam: [0, 1, 2] });
    const view = toPlayerView(state, 0);

    view.proposedTeam?.push(6);
    view.missionHistory[0]?.team.push(6);
    view.players.pop();
    view.speeches[0]!.content = "改掉了";
    const reveal = toPlayerView(finished(), 0).reveal;
    reveal?.missions[0]?.cards.push({ playerId: 6, success: false });

    expect(state.proposedTeam).toEqual([0, 1, 2]);
    expect(state.missionHistory[0]?.team).toEqual([0, 1]);
    expect(state.players).toHaveLength(7);
    expect(state.speeches[0]?.content).toBe("这队我信得过");
    expect(MISSION_0.cards).toHaveLength(2);
  });

  it("座位号不存在抛 INTERNAL——调用方是引擎自己", () => {
    const state = build({ phase: "TEAM_BUILDING" });
    for (const bad of [7, -1, 1.5]) {
      expect(() => toPlayerView(state, bad)).toThrow(EngineError);
    }
  });
});
