import { describe, expect, it } from "vitest";
import { createConfig } from "./config";
import {
  assertLegal,
  getAwaitingPlayerIds,
  getLegalActions,
  getSystemActions,
  getTeamConstraint,
} from "./legal";
import { createRng } from "./rng";
import { createGame, makePlaceholderPersonas } from "./setup";
import {
  EngineError,
  createPending,
  type GameAction,
  type GameState,
  type PendingState,
  type Player,
  type PlayerId,
  type Role,
} from "./types";

// ---------------------------------------------------------------------------
// 夹具
// ---------------------------------------------------------------------------

/** 手工排座位，座位号即下标。legal.ts 的每条判定都跟"谁坐几号"有关，不能靠洗牌 */
const seat = (roles: Role[]): Player[] =>
  roles.map((role, id) => ({
    id,
    name: `P${id}`,
    role,
    isHuman: false,
    persona: { name: `P${id}`, traits: [], speechStyle: "" },
  }));

/**
 * 10 人局固定排座，坏人四种角色齐全。
 * 好人：0(梅林) 2 3(派西维尔) 5 8 9；坏人：1(莫甘娜) 4(莫德雷德) 6(奥伯伦) 7(刺客)。
 */
const TEN: Role[] = [
  "MERLIN", // 0
  "MORGANA", // 1
  "LOYAL_SERVANT", // 2
  "PERCIVAL", // 3
  "MORDRED", // 4
  "LOYAL_SERVANT", // 5
  "OBERON", // 6
  "ASSASSIN", // 7
  "LOYAL_SERVANT", // 8
  "LOYAL_SERVANT", // 9
];

const GOOD_SEATS: PlayerId[] = [0, 2, 3, 5, 8, 9];
const EVIL_SEATS: PlayerId[] = [1, 4, 6, 7];
const ASSASSIN_SEAT = 7;

const ALL_SEATS: PlayerId[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function makeState(
  roles: Role[],
  patch: Partial<GameState> = {},
  pending: Partial<PendingState> = {},
): GameState {
  const playerCount = roles.length;
  const base = createGame({
    config: createConfig(playerCount, { roles }),
    humanSeat: null,
    personas: makePlaceholderPersonas(playerCount),
    rng: createRng(1),
  });
  return {
    ...base,
    // createGame 会洗牌，这里换成固定排座
    players: seat(roles),
    ...patch,
    pending: { ...createPending(), ...pending },
  };
}

const ten = (patch: Partial<GameState> = {}, pending: Partial<PendingState> = {}) =>
  makeState(TEN, patch, pending);

/** 从当前队长开始绕一圈的座位序，讨论阶段的发言顺序（rules.md §4.4） */
const orderFrom = (leaderId: PlayerId, playerCount = 10): PlayerId[] =>
  Array.from({ length: playerCount }, (_, i) => (leaderId + i) % playerCount);

const typesOf = (actions: GameAction[]): string[] => actions.map((a) => a.type);

/** 覆盖全部 10 个阶段的状态集合，供不变量测试逐个跑 */
const SCENARIOS: Array<{ name: string; state: GameState }> = [
  { name: "SETUP", state: ten() },
  {
    name: "ROLE_REVEAL（部分已确认）",
    state: ten({ phase: "ROLE_REVEAL" }, { acknowledged: [0, 3] }),
  },
  {
    name: "TEAM_BUILDING",
    state: ten({ phase: "TEAM_BUILDING", currentLeaderId: 4 }),
  },
  {
    name: "PROPOSAL_DISCUSSION（第 3 个人在说）",
    state: ten(
      { phase: "PROPOSAL_DISCUSSION", currentLeaderId: 4, proposedTeam: [1, 2, 3] },
      { speakingOrder: orderFrom(4), speakerIndex: 2 },
    ),
  },
  {
    name: "PROPOSAL_DISCUSSION（已说完，等转阶段）",
    state: ten(
      { phase: "PROPOSAL_DISCUSSION", currentLeaderId: 4, proposedTeam: [1, 2, 3] },
      { speakingOrder: orderFrom(4), speakerIndex: 10 },
    ),
  },
  {
    name: "TEAM_VOTE（两人已投）",
    state: ten(
      { phase: "TEAM_VOTE", currentLeaderId: 4, proposedTeam: [1, 2, 3] },
      { votes: { 0: true, 1: false } },
    ),
  },
  {
    name: "MISSION_EXECUTION（一人已交）",
    state: ten(
      { phase: "MISSION_EXECUTION", currentLeaderId: 4, proposedTeam: [1, 2, 3] },
      { cards: [{ playerId: 2, success: true }] },
    ),
  },
  { name: "MISSION_RESULT", state: ten({ phase: "MISSION_RESULT" }) },
  {
    name: "REVIEW_DISCUSSION",
    state: ten(
      { phase: "REVIEW_DISCUSSION", currentLeaderId: 4 },
      { speakingOrder: orderFrom(4), speakerIndex: 0 },
    ),
  },
  {
    name: "ASSASSINATION（无人发表推测）",
    state: ten({ phase: "ASSASSINATION", goodScore: 3 }),
  },
  {
    name: "ASSASSINATION（坏人已说完）",
    state: ten(
      { phase: "ASSASSINATION", goodScore: 3 },
      {
        assassinOpinions: EVIL_SEATS.map((playerId) => ({ playerId, content: "x" })),
      },
    ),
  },
  {
    name: "GAME_OVER",
    state: ten({ phase: "GAME_OVER", winner: "GOOD", winReason: "ASSASSINATION_MISS" }),
  },
];

// ---------------------------------------------------------------------------
// 不变量
// ---------------------------------------------------------------------------

describe("不变量：能选的就是能做的", () => {
  for (const { name, state } of SCENARIOS) {
    it(`${name}：getLegalActions 的每一项都通过 assertLegal`, () => {
      for (const player of state.players) {
        for (const action of getLegalActions(state, player.id)) {
          expect(() => assertLegal(state, action)).not.toThrow();
        }
      }
      for (const action of getSystemActions(state)) {
        expect(() => assertLegal(state, action)).not.toThrow();
      }
    });

    it(`${name}：有动作的人恰好是 awaiting 里的人`, () => {
      const actors = state.players
        .filter((p) => getLegalActions(state, p.id).length > 0)
        .map((p) => p.id);
      expect(actors).toEqual(getAwaitingPlayerIds(state));
    });

    it(`${name}：三个查询函数都不改动 state`, () => {
      const before = JSON.stringify(state);
      state.players.forEach((p) => getLegalActions(state, p.id));
      getAwaitingPlayerIds(state);
      getSystemActions(state);
      expect(JSON.stringify(state)).toBe(before);
    });
  }
});

// ---------------------------------------------------------------------------
// 轮到谁
// ---------------------------------------------------------------------------

describe("getAwaitingPlayerIds", () => {
  it("SETUP 等 START_GAME，MISSION_RESULT 等 NEXT，两者都没有玩家动作", () => {
    const setup = ten();
    expect(getAwaitingPlayerIds(setup)).toEqual([]);
    expect(getSystemActions(setup)).toEqual([{ type: "START_GAME" }]);

    const result = ten({ phase: "MISSION_RESULT" });
    expect(getAwaitingPlayerIds(result)).toEqual([]);
    expect(getSystemActions(result)).toEqual([{ type: "NEXT" }]);
  });

  it("GAME_OVER 既没有玩家动作也没有系统动作", () => {
    const over = ten({ phase: "GAME_OVER", winner: "EVIL", winReason: "THREE_MISSIONS" });
    expect(getAwaitingPlayerIds(over)).toEqual([]);
    expect(getSystemActions(over)).toEqual([]);
  });

  it("ROLE_REVEAL 等所有还没确认的人，按座位升序", () => {
    const state = ten({ phase: "ROLE_REVEAL" }, { acknowledged: [7, 0, 3] });
    expect(getAwaitingPlayerIds(state)).toEqual([1, 2, 4, 5, 6, 8, 9]);
  });

  it("TEAM_BUILDING 只等队长", () => {
    expect(
      getAwaitingPlayerIds(ten({ phase: "TEAM_BUILDING", currentLeaderId: 6 })),
    ).toEqual([6]);
  });

  it("讨论阶段只等当前发言人，游标走到头则等系统转阶段", () => {
    const speaking = ten(
      { phase: "PROPOSAL_DISCUSSION", currentLeaderId: 8, proposedTeam: [0, 1, 2] },
      { speakingOrder: orderFrom(8), speakerIndex: 3 },
    );
    expect(getAwaitingPlayerIds(speaking)).toEqual([1]); // 8,9,0,1

    const done = ten(
      { phase: "REVIEW_DISCUSSION", currentLeaderId: 8 },
      { speakingOrder: orderFrom(8), speakerIndex: 10 },
    );
    expect(getAwaitingPlayerIds(done)).toEqual([]);
  });

  it("TEAM_VOTE 等所有还没投的人——含队长与未上队者（rules.md §4.2）", () => {
    const state = ten(
      { phase: "TEAM_VOTE", currentLeaderId: 4, proposedTeam: [1, 2, 3] },
      { votes: { 9: true, 4: false } },
    );
    expect(getAwaitingPlayerIds(state)).toEqual([0, 1, 2, 3, 5, 6, 7, 8]);
  });

  it("MISSION_EXECUTION 只等还没交票的队员", () => {
    const state = ten(
      { phase: "MISSION_EXECUTION", proposedTeam: [7, 2, 5] },
      { cards: [{ playerId: 5, success: false }] },
    );
    expect(getAwaitingPlayerIds(state)).toEqual([2, 7]);
  });

  it("提交顺序不影响 awaiting 的顺序", () => {
    const a = ten(
      { phase: "TEAM_VOTE", proposedTeam: [1, 2, 3] },
      { votes: { 0: true, 5: false } },
    );
    const b = ten(
      { phase: "TEAM_VOTE", proposedTeam: [1, 2, 3] },
      { votes: { 5: false, 0: true } },
    );
    expect(getAwaitingPlayerIds(a)).toEqual(getAwaitingPlayerIds(b));
  });

  it("刺杀阶段按座位升序逐个坏人发表推测，含奥伯伦", () => {
    const opinions: Array<{ playerId: PlayerId; content: string }> = [];
    for (const expected of EVIL_SEATS) {
      const state = ten({ phase: "ASSASSINATION" }, { assassinOpinions: [...opinions] });
      expect(getAwaitingPlayerIds(state)).toEqual([expected]);
      opinions.push({ playerId: expected, content: "x" });
    }
    // 坏人全部说完，才轮到刺客动手
    const strike = ten({ phase: "ASSASSINATION" }, { assassinOpinions: opinions });
    expect(getAwaitingPlayerIds(strike)).toEqual([ASSASSIN_SEAT]);
  });
});

// ---------------------------------------------------------------------------
// 合法动作
// ---------------------------------------------------------------------------

describe("getLegalActions：任务票（防作弊主战场）", () => {
  /** 第 4 轮 teamSize 为 5，两支队伍正好覆盖全部 10 个座位 */
  const missionState = (team: PlayerId[]) =>
    ten({ phase: "MISSION_EXECUTION", missionIndex: 3, proposedTeam: team });

  it("好人的合法动作里根本没有失败票", () => {
    for (const state of [missionState([0, 1, 2, 3, 4]), missionState([5, 6, 7, 8, 9])]) {
      for (const id of GOOD_SEATS.filter((s) => state.proposedTeam?.includes(s))) {
        const actions = getLegalActions(state, id);
        expect(actions).toEqual([
          { type: "CAST_MISSION_CARD", playerId: id, success: true },
        ]);
      }
    }
  });

  it("坏人两个选项都有，奥伯伦也不例外（rules.md §5.8）", () => {
    for (const state of [missionState([0, 1, 2, 3, 4]), missionState([5, 6, 7, 8, 9])]) {
      for (const id of EVIL_SEATS.filter((s) => state.proposedTeam?.includes(s))) {
        expect(getLegalActions(state, id)).toEqual([
          { type: "CAST_MISSION_CARD", playerId: id, success: true },
          { type: "CAST_MISSION_CARD", playerId: id, success: false },
        ]);
      }
    }
  });

  it("非队员没有任何动作，已交票的队员也没有", () => {
    const state = ten(
      { phase: "MISSION_EXECUTION", proposedTeam: [1, 2, 3] },
      { cards: [{ playerId: 1, success: false }] },
    );
    expect(getLegalActions(state, 9)).toEqual([]); // 不在队伍里
    expect(getLegalActions(state, 1)).toEqual([]); // 已经交过
    // 2 号是忠臣，还没交票，所以只有"成功"一项
    expect(typesOf(getLegalActions(state, 2))).toEqual(["CAST_MISSION_CARD"]);
  });
});

describe("getLegalActions：其余阶段", () => {
  it("TEAM_BUILDING 只有队长有动作，且模板队伍人数正确、无重复、升序", () => {
    for (let missionIndex = 0; missionIndex < 5; missionIndex += 1) {
      const state = ten({ phase: "TEAM_BUILDING", currentLeaderId: 8, missionIndex });
      const actions = getLegalActions(state, 8);
      expect(actions).toHaveLength(1);
      const [action] = actions;
      if (action?.type !== "PROPOSE_TEAM") throw new Error("模板动作类型不对");

      const { teamSize } = getTeamConstraint(state);
      expect(action.team).toHaveLength(teamSize);
      expect(new Set(action.team).size).toBe(teamSize);
      expect([...action.team].sort((a, b) => a - b)).toEqual(action.team);
      // 队长自己一定在模板队伍里，不需要额外判断就能直接提交
      expect(action.team).toContain(8);

      expect(getLegalActions(state, 7)).toEqual([]);
    }
  });

  it("getTeamConstraint 给出人数约束与全体候选人，而不是穷举组合", () => {
    const state = ten({ phase: "TEAM_BUILDING", missionIndex: 3 });
    expect(getTeamConstraint(state)).toEqual({ teamSize: 5, candidateIds: ALL_SEATS });
  });

  it("ROLE_REVEAL 每人一个 ACKNOWLEDGE，确认过的人拿到空列表", () => {
    const state = ten({ phase: "ROLE_REVEAL" }, { acknowledged: [2] });
    expect(getLegalActions(state, 0)).toEqual([{ type: "ACKNOWLEDGE", playerId: 0 }]);
    expect(getLegalActions(state, 2)).toEqual([]);
  });

  it("讨论阶段只有当前发言人拿到 SPEAK 模板，内容留空由调用方填", () => {
    const state = ten(
      { phase: "PROPOSAL_DISCUSSION", currentLeaderId: 4, proposedTeam: [1, 2, 3] },
      { speakingOrder: orderFrom(4), speakerIndex: 0 },
    );
    expect(getLegalActions(state, 4)).toEqual([
      { type: "SPEAK", playerId: 4, content: "" },
    ]);
    expect(getLegalActions(state, 5)).toEqual([]);
  });

  it("TEAM_VOTE 每个没投的人都有同意和反对两项", () => {
    const state = ten(
      { phase: "TEAM_VOTE", proposedTeam: [1, 2, 3] },
      { votes: { 3: true } },
    );
    expect(getLegalActions(state, 0)).toEqual([
      { type: "CAST_VOTE", playerId: 0, approve: true },
      { type: "CAST_VOTE", playerId: 0, approve: false },
    ]);
    expect(getLegalActions(state, 3)).toEqual([]);
  });

  it("刺杀目标枚举全部座位，含刺客自己和坏人队友（rules.md §4.5）", () => {
    const state = ten(
      { phase: "ASSASSINATION" },
      { assassinOpinions: EVIL_SEATS.map((playerId) => ({ playerId, content: "x" })) },
    );
    const actions = getLegalActions(state, ASSASSIN_SEAT);
    expect(actions).toHaveLength(10);
    expect(
      actions.map((a) => (a.type === "ASSASSINATE" ? a.targetId : -1)),
    ).toEqual(ALL_SEATS);
  });

  it("推测没说完时刺客拿到的是 ASSASSIN_OPINION 而不是 ASSASSINATE", () => {
    const state = ten(
      { phase: "ASSASSINATION" },
      {
        assassinOpinions: [1, 4, 6].map((playerId) => ({ playerId, content: "x" })),
      },
    );
    expect(getLegalActions(state, ASSASSIN_SEAT)).toEqual([
      { type: "ASSASSIN_OPINION", playerId: ASSASSIN_SEAT, content: "" },
    ]);
    // 好人在刺杀阶段完全没有动作
    for (const id of GOOD_SEATS) expect(getLegalActions(state, id)).toEqual([]);
  });

  it("越界或非整数座位号抛 INTERNAL——调用方是引擎自己，这只可能是 bug", () => {
    const state = ten({ phase: "TEAM_BUILDING" });
    for (const bad of [10, -1, 1.5]) {
      expectCode(() => getLegalActions(state, bad), "INTERNAL");
    }
  });
});

// ---------------------------------------------------------------------------
// 校验
// ---------------------------------------------------------------------------

/** 断言抛出的是带指定 code 的 EngineError，而不是随便什么 Error */
function expectCode(fn: () => void, code: string): void {
  expect(fn).toThrow(EngineError);
  try {
    fn();
  } catch (error) {
    expect((error as EngineError).code).toBe(code);
  }
}

describe("assertLegal：阶段", () => {
  it("阶段对不上抛 ILLEGAL_PHASE", () => {
    const vote = ten({ phase: "TEAM_VOTE", proposedTeam: [1, 2, 3] });
    expectCode(
      () => assertLegal(vote, { type: "PROPOSE_TEAM", playerId: 0, team: [0, 1, 2] }),
      "ILLEGAL_PHASE",
    );
    expectCode(() => assertLegal(vote, { type: "NEXT" }), "ILLEGAL_PHASE");
  });

  it("GAME_OVER 之后什么都不接受，包括系统动作", () => {
    const over = ten({ phase: "GAME_OVER", winner: "GOOD", winReason: "ASSASSINATION_MISS" });
    expectCode(() => assertLegal(over, { type: "NEXT" }), "ILLEGAL_PHASE");
    expectCode(
      () => assertLegal(over, { type: "SPEAK", playerId: 0, content: "复盘" }),
      "ILLEGAL_PHASE",
    );
  });

  it("系统动作在对的阶段就合法，不需要行动人", () => {
    expect(() => assertLegal(ten(), { type: "START_GAME" })).not.toThrow();
    expect(() =>
      assertLegal(ten({ phase: "MISSION_RESULT" }), { type: "NEXT" }),
    ).not.toThrow();
  });
});

describe("assertLegal：轮到谁", () => {
  it("非队长提议抛 NOT_YOUR_TURN", () => {
    const state = ten({ phase: "TEAM_BUILDING", currentLeaderId: 4 });
    expectCode(
      () => assertLegal(state, { type: "PROPOSE_TEAM", playerId: 5, team: [0, 1, 2] }),
      "NOT_YOUR_TURN",
    );
    expect(() =>
      assertLegal(state, { type: "PROPOSE_TEAM", playerId: 4, team: [0, 1, 2] }),
    ).not.toThrow();
  });

  it("非当前发言人 SPEAK 抛 NOT_YOUR_TURN", () => {
    const state = ten(
      { phase: "REVIEW_DISCUSSION", currentLeaderId: 4 },
      { speakingOrder: orderFrom(4), speakerIndex: 1 },
    );
    expectCode(
      () => assertLegal(state, { type: "SPEAK", playerId: 4, content: "抢麦" }),
      "NOT_YOUR_TURN",
    );
    expect(() =>
      assertLegal(state, { type: "SPEAK", playerId: 5, content: "轮到我" }),
    ).not.toThrow();
  });

  it("非队员提交任务票抛 NOT_YOUR_TURN", () => {
    const state = ten({ phase: "MISSION_EXECUTION", proposedTeam: [1, 2, 3] });
    expectCode(
      () =>
        assertLegal(state, { type: "CAST_MISSION_CARD", playerId: 6, success: false }),
      "NOT_YOUR_TURN",
    );
  });

  it("不存在的座位号抛 NOT_YOUR_TURN——外部输入错误，不是引擎 bug", () => {
    const state = ten({ phase: "ROLE_REVEAL" });
    expectCode(
      () => assertLegal(state, { type: "ACKNOWLEDGE", playerId: 99 }),
      "NOT_YOUR_TURN",
    );
  });

  it("坏人推测没说完，刺客就动手抛 NOT_YOUR_TURN", () => {
    const state = ten(
      { phase: "ASSASSINATION" },
      {
        assassinOpinions: [1, 4, 6].map((playerId) => ({ playerId, content: "x" })),
      },
    );
    // 此刻 awaiting 恰好就是刺客本人，只判"在不在 awaiting 里"会放过去
    expect(getAwaitingPlayerIds(state)).toEqual([ASSASSIN_SEAT]);
    expectCode(
      () => assertLegal(state, { type: "ASSASSINATE", playerId: ASSASSIN_SEAT, targetId: 0 }),
      "NOT_YOUR_TURN",
    );
  });

  it("非刺客的坏人不能执行刺杀", () => {
    const state = ten(
      { phase: "ASSASSINATION" },
      { assassinOpinions: EVIL_SEATS.map((playerId) => ({ playerId, content: "x" })) },
    );
    expectCode(
      () => assertLegal(state, { type: "ASSASSINATE", playerId: 1, targetId: 0 }),
      "NOT_YOUR_TURN",
    );
  });
});

describe("assertLegal：重复提交", () => {
  it("重复确认身份 / 重复投票 / 重复交任务票 / 重复推测都抛 DUPLICATE_SUBMISSION", () => {
    expectCode(
      () =>
        assertLegal(
          ten({ phase: "ROLE_REVEAL" }, { acknowledged: [3] }),
          { type: "ACKNOWLEDGE", playerId: 3 },
        ),
      "DUPLICATE_SUBMISSION",
    );

    expectCode(
      () =>
        assertLegal(
          ten({ phase: "TEAM_VOTE", proposedTeam: [1, 2, 3] }, { votes: { 3: true } }),
          { type: "CAST_VOTE", playerId: 3, approve: false },
        ),
      "DUPLICATE_SUBMISSION",
    );

    expectCode(
      () =>
        assertLegal(
          ten(
            { phase: "MISSION_EXECUTION", proposedTeam: [1, 2, 3] },
            { cards: [{ playerId: 1, success: false }] },
          ),
          { type: "CAST_MISSION_CARD", playerId: 1, success: true },
        ),
      "DUPLICATE_SUBMISSION",
    );

    expectCode(
      () =>
        assertLegal(
          ten(
            { phase: "ASSASSINATION" },
            { assassinOpinions: [{ playerId: 1, content: "x" }] },
          ),
          { type: "ASSASSIN_OPINION", playerId: 1, content: "再说一次" },
        ),
      "DUPLICATE_SUBMISSION",
    );
  });
});

describe("assertLegal：载荷", () => {
  it("队伍人数不符抛 INVALID_TEAM", () => {
    const state = ten({ phase: "TEAM_BUILDING", currentLeaderId: 0, missionIndex: 3 });
    expectCode(
      () => assertLegal(state, { type: "PROPOSE_TEAM", playerId: 0, team: [0, 1, 2, 3] }),
      "INVALID_TEAM",
    );
    expect(() =>
      assertLegal(state, { type: "PROPOSE_TEAM", playerId: 0, team: [0, 1, 2, 3, 4] }),
    ).not.toThrow();
  });

  it("队伍里有重复或不存在的座位抛 INVALID_TEAM", () => {
    const state = ten({ phase: "TEAM_BUILDING", currentLeaderId: 0 });
    expectCode(
      () => assertLegal(state, { type: "PROPOSE_TEAM", playerId: 0, team: [1, 1, 2] }),
      "INVALID_TEAM",
    );
    expectCode(
      () => assertLegal(state, { type: "PROPOSE_TEAM", playerId: 0, team: [1, 2, 10] }),
      "INVALID_TEAM",
    );
  });

  it("队长可以把自己排除在队伍外（rules.md §5.1）", () => {
    const state = ten({ phase: "TEAM_BUILDING", currentLeaderId: 0 });
    expect(() =>
      assertLegal(state, { type: "PROPOSE_TEAM", playerId: 0, team: [1, 2, 3] }),
    ).not.toThrow();
  });

  it("好人投失败抛 GOOD_CANNOT_FAIL，坏人不抛", () => {
    const state = ten({ phase: "MISSION_EXECUTION", proposedTeam: [1, 2, 3] });
    for (const id of [2, 3]) {
      expectCode(
        () =>
          assertLegal(state, { type: "CAST_MISSION_CARD", playerId: id, success: false }),
        "GOOD_CANNOT_FAIL",
      );
      expect(() =>
        assertLegal(state, { type: "CAST_MISSION_CARD", playerId: id, success: true }),
      ).not.toThrow();
    }
    expect(() =>
      assertLegal(state, { type: "CAST_MISSION_CARD", playerId: 1, success: false }),
    ).not.toThrow();
  });

  it("刺杀不存在的座位抛 INVALID_TARGET，指自己或队友合法", () => {
    const state = ten(
      { phase: "ASSASSINATION" },
      { assassinOpinions: EVIL_SEATS.map((playerId) => ({ playerId, content: "x" })) },
    );
    expectCode(
      () =>
        assertLegal(state, { type: "ASSASSINATE", playerId: ASSASSIN_SEAT, targetId: 10 }),
      "INVALID_TARGET",
    );
    for (const targetId of [ASSASSIN_SEAT, 1, 0]) {
      expect(() =>
        assertLegal(state, { type: "ASSASSINATE", playerId: ASSASSIN_SEAT, targetId }),
      ).not.toThrow();
    }
  });
});

describe("其他人数配置", () => {
  it("5-10 人局的模板队伍都符合各自的 teamSize 表", () => {
    for (const playerCount of [5, 6, 7, 8, 9, 10]) {
      for (let missionIndex = 0; missionIndex < 5; missionIndex += 1) {
        const state = makeState(createConfig(playerCount).roles, {
          phase: "TEAM_BUILDING",
          currentLeaderId: 0,
          missionIndex,
        });
        const [action] = getLegalActions(state, 0);
        if (action?.type !== "PROPOSE_TEAM") throw new Error("模板动作类型不对");
        expect(action.team).toHaveLength(getTeamConstraint(state).teamSize);
        expect(() => assertLegal(state, action)).not.toThrow();
      }
    }
  });

  it("5 人局只有莫甘娜和刺客，任务票的好坏人划分依然正确", () => {
    const roles = createConfig(5).roles;
    const state = makeState(roles, {
      phase: "MISSION_EXECUTION",
      proposedTeam: [0, 1, 2, 3, 4],
    });
    for (const player of state.players) {
      const expected = player.role === "MORGANA" || player.role === "ASSASSIN" ? 2 : 1;
      expect(getLegalActions(state, player.id)).toHaveLength(expected);
    }
  });
});
