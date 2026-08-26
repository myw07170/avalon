import { describe, expect, it } from "vitest";
import { createConfig } from "./config";
import {
  getAwaitingPlayerIds,
  getCurrentMission,
  getLegalActions,
  getSystemActions,
} from "./legal";
import { reduce } from "./reduce";
import { createRng } from "./rng";
import { createGame, makePlaceholderPersonas } from "./setup";
import {
  EngineError,
  type GameAction,
  type GameState,
  type Player,
  type PlayerId,
  type Role,
} from "./types";
import { toPlayerView } from "./view";

// ---------------------------------------------------------------------------
// 夹具
// ---------------------------------------------------------------------------

/** 手工排座位。状态机的每条判定都跟"谁坐几号、谁是坏人"有关，不能靠洗牌 */
const seat = (roles: Role[]): Player[] =>
  roles.map((role, id) => ({
    id,
    name: `P${id}`,
    role,
    isHuman: false,
    persona: { name: `P${id}`, traits: [], speechStyle: "" },
  }));

/** 5 人局：坏人 3、4，梅林 0 */
const FIVE: Role[] = ["MERLIN", "PERCIVAL", "LOYAL_SERVANT", "MORGANA", "ASSASSIN"];
/** 6 人局：坏人 2、4，梅林 0 */
const SIX: Role[] = [
  "MERLIN",
  "LOYAL_SERVANT",
  "MORGANA",
  "PERCIVAL",
  "ASSASSIN",
  "LOYAL_SERVANT",
];
/** 7 人局：坏人 1、4（奥伯伦）、5，梅林 0 */
const SEVEN: Role[] = [
  "MERLIN",
  "MORGANA",
  "LOYAL_SERVANT",
  "PERCIVAL",
  "OBERON",
  "ASSASSIN",
  "LOYAL_SERVANT",
];

const MERLIN_SEAT = 0;

const evilSeatsOf = (state: GameState): PlayerId[] =>
  state.players
    .filter((p) => p.role !== "MERLIN" && p.role !== "PERCIVAL" && p.role !== "LOYAL_SERVANT")
    .map((p) => p.id);

interface GameOptions {
  leaderId?: PlayerId;
  maxRejects?: number;
  forcePassOnLastAttempt?: boolean;
}

/** 停在 SETUP 的初始状态，队长固定为 0（createGame 是随机选的，测试要可复现） */
function newGame(roles: Role[], options: GameOptions = {}): GameState {
  const playerCount = roles.length;
  const base = createGame({
    config: createConfig(playerCount, {
      roles,
      maxRejects: options.maxRejects,
      forcePassOnLastAttempt: options.forcePassOnLastAttempt,
    }),
    humanSeat: null,
    personas: makePlaceholderPersonas(playerCount),
    rng: createRng(1),
  });
  return { ...base, players: seat(roles), currentLeaderId: options.leaderId ?? 0 };
}

// ---------------------------------------------------------------------------
// 驱动
// ---------------------------------------------------------------------------

/** reduce 目前用不到随机源，但签名要求给一个 */
const rng = createRng(7);

const step = (state: GameState, action: GameAction): GameState =>
  reduce(state, action, rng);

type Policy = (
  state: GameState,
  playerId: PlayerId,
  actions: GameAction[],
) => GameAction;

interface Strategy {
  /** 组队投票：默认全部同意 */
  vote?: (state: GameState, playerId: PlayerId) => boolean;
  /** 任务票：默认全投成功。好人即使返回 true 也拿不到失败选项 */
  fail?: (state: GameState, playerId: PlayerId) => boolean;
  /** 队长选人：默认用 getLegalActions 给的模板队伍 */
  team?: (state: GameState, leaderId: PlayerId) => PlayerId[];
  /** 刺杀目标：默认打 0 号 */
  target?: (state: GameState) => PlayerId;
}

const first = (actions: GameAction[]): GameAction => {
  const [action] = actions;
  if (!action) throw new Error("合法动作列表为空");
  return action;
};

/** 把 Strategy 翻译成"从 getLegalActions 里挑一个"的策略函数 */
const policyOf =
  (strategy: Strategy = {}): Policy =>
  (state, playerId, actions) => {
    switch (state.phase) {
      case "TEAM_BUILDING": {
        const template = first(actions);
        const team = strategy.team?.(state, playerId);
        if (!team || template.type !== "PROPOSE_TEAM") return template;
        return { ...template, team };
      }
      case "TEAM_VOTE":
        return {
          type: "CAST_VOTE",
          playerId,
          approve: strategy.vote?.(state, playerId) ?? true,
        };
      case "MISSION_EXECUTION": {
        const wantSuccess = !(strategy.fail?.(state, playerId) ?? false);
        // 好人的列表里没有失败票，找不到就退回成功——这正是防作弊闸的效果
        return (
          actions.find(
            (a) => a.type === "CAST_MISSION_CARD" && a.success === wantSuccess,
          ) ?? first(actions)
        );
      }
      case "ASSASSINATION": {
        const targetId = strategy.target?.(state);
        return (
          actions.find(
            (a) => a.type === "ASSASSINATE" && a.targetId === targetId,
          ) ?? first(actions)
        );
      }
      default:
        // ACKNOWLEDGE / SPEAK / ASSASSIN_OPINION 都只有一个模板动作
        return first(actions);
    }
  };

/** 推进一步：没人待行动就走系统动作（START_GAME / NEXT） */
function advance(state: GameState, policy: Policy): GameState {
  const awaiting = getAwaitingPlayerIds(state);
  if (awaiting.length === 0) {
    const [systemAction] = getSystemActions(state);
    if (!systemAction) {
      throw new Error(`${state.phase} 阶段既无人可动，也没有系统动作`);
    }
    return step(state, systemAction);
  }
  const playerId = awaiting[0] as PlayerId;
  return step(state, policy(state, playerId, getLegalActions(state, playerId)));
}

function runUntil(
  state: GameState,
  done: (s: GameState) => boolean,
  strategy: Strategy = {},
  maxSteps = 2000,
): GameState {
  const policy = policyOf(strategy);
  let current = state;
  for (let i = 0; i < maxSteps && !done(current); i += 1) {
    current = advance(current, policy);
  }
  if (!done(current)) {
    throw new Error(`${maxSteps} 步内没走到目标状态，停在 ${current.phase}`);
  }
  return current;
}

const atPhase = (
  state: GameState,
  phase: GameState["phase"],
  strategy: Strategy = {},
): GameState => runUntil(state, (s) => s.phase === phase, strategy);

/** 走到 TEAM_BUILDING：START_GAME + 全员确认身份 */
const started = (roles: Role[], options: GameOptions = {}): GameState =>
  atPhase(newGame(roles, options), "TEAM_BUILDING");

/**
 * 直接摆一个 MISSION_EXECUTION 局面。
 * 为了测第 4 轮的失败门槛而把前三轮全打完，只会让用例失焦。
 */
function atMissionExecution(
  roles: Role[],
  missionIndex: number,
  team: PlayerId[],
  patch: Partial<GameState> = {},
): GameState {
  const base = started(roles);
  return {
    ...base,
    phase: "MISSION_EXECUTION",
    missionIndex,
    proposedTeam: [...team],
    proposalHistory: [
      {
        missionIndex,
        attempt: 0,
        leaderId: base.currentLeaderId,
        team: [...team],
        votes: {},
        approved: true,
        forced: true,
      },
    ],
    ...patch,
  };
}

const castCards = (
  state: GameState,
  cards: Array<{ playerId: PlayerId; success: boolean }>,
): GameState =>
  cards.reduce(
    (s, c) => step(s, { type: "CAST_MISSION_CARD", playerId: c.playerId, success: c.success }),
    state,
  );

/**
 * 队长优先带坏人上车。
 * 默认的模板队伍是"队长 + 座位号最小的若干人"，可能一个坏人都没有，
 * 那样"坏人每次都破坏"的策略就破坏不了任何东西。
 */
const evilHeavyTeam = (state: GameState): PlayerId[] => {
  const { teamSize } = getCurrentMission(state);
  const evil = evilSeatsOf(state);
  const rest = state.players.map((p) => p.id).filter((id) => !evil.includes(id));
  return [...evil, ...rest].slice(0, teamSize).sort((a, b) => a - b);
};

/** 断言抛出的是带指定 code 的 EngineError */
function expectCode(fn: () => void, code: string): void {
  expect(fn).toThrow(EngineError);
  try {
    fn();
  } catch (error) {
    expect((error as EngineError).code).toBe(code);
  }
}

/**
 * pending 只能装当前阶段的中间态。
 * 上一阶段的投票漏进下一阶段是这套状态机最容易出的事故，所以每走一步都查一遍。
 */
function expectPendingMatchesPhase(state: GameState): void {
  const { pending, phase } = state;
  if (phase !== "ROLE_REVEAL") expect(pending.acknowledged).toEqual([]);
  if (phase !== "TEAM_VOTE") expect(pending.votes).toEqual({});
  if (phase !== "MISSION_EXECUTION") expect(pending.cards).toEqual([]);
  if (phase !== "ASSASSINATION") expect(pending.assassinOpinions).toEqual([]);
  if (phase !== "PROPOSAL_DISCUSSION" && phase !== "REVIEW_DISCUSSION") {
    expect(pending.speakingOrder).toEqual([]);
    expect(pending.speakerIndex).toBe(0);
  }
}

// ---------------------------------------------------------------------------
// 分派与纯函数
// ---------------------------------------------------------------------------

describe("reduce：分派与纯函数", () => {
  it("不改动传入的 state", () => {
    const state = started(SIX);
    const before = JSON.stringify(state);
    step(state, { type: "PROPOSE_TEAM", playerId: 0, team: [0, 1], statement: "带这几个" });
    expect(JSON.stringify(state)).toBe(before);
  });

  it("同一 state + 同一 action 两次调用结果完全一致", () => {
    const state = started(SIX);
    const action: GameAction = { type: "PROPOSE_TEAM", playerId: 0, team: [0, 1], statement: "带这几个" };
    expect(JSON.stringify(step(state, action))).toBe(
      JSON.stringify(step(state, action)),
    );
  });

  it("非法动作沿用 assertLegal 的错误码，不静默忽略", () => {
    expectCode(() => step(newGame(SIX), { type: "NEXT" }), "ILLEGAL_PHASE");
    expectCode(
      () => step(started(SIX), { type: "PROPOSE_TEAM", playerId: 3, team: [0, 1], statement: "带这几个" }),
      "NOT_YOUR_TURN",
    );
    expectCode(
      () => step(started(SIX), { type: "PROPOSE_TEAM", playerId: 0, team: [0, 1, 2], statement: "带这几个" }),
      "INVALID_TEAM",
    );
  });

  it("GAME_OVER 之后不再接受任何动作", () => {
    const over = runUntil(
      newGame(SIX, { maxRejects: 2 }),
      (s) => s.phase === "GAME_OVER",
      { vote: () => false },
    );
    expect(over.winReason).toBe("REJECT_LIMIT");
    expectCode(() => step(over, { type: "NEXT" }), "ILLEGAL_PHASE");
    expectCode(() => step(over, { type: "ACKNOWLEDGE", playerId: 0 }), "ILLEGAL_PHASE");
  });
});

// ---------------------------------------------------------------------------
// SETUP / ROLE_REVEAL
// ---------------------------------------------------------------------------

describe("SETUP 与 ROLE_REVEAL", () => {
  it("START_GAME 只做阶段转移与日志，不重新发牌", () => {
    const setup = newGame(SIX);
    const revealed = step(setup, { type: "START_GAME" });
    expect(revealed.phase).toBe("ROLE_REVEAL");
    expect(revealed.players).toEqual(setup.players);
    expect(revealed.log.map((e) => e.kind)).toEqual(["GAME_STARTED", "LEADER_CHANGED"]);
  });

  it("ACKNOWLEDGE 逐个累积，齐了才转 TEAM_BUILDING 并清空 pending", () => {
    let state = step(newGame(SIX), { type: "START_GAME" });
    for (const id of [0, 1, 2, 3, 4]) {
      state = step(state, { type: "ACKNOWLEDGE", playerId: id });
      expect(state.phase).toBe("ROLE_REVEAL");
    }
    expect(state.pending.acknowledged).toHaveLength(5);

    state = step(state, { type: "ACKNOWLEDGE", playerId: 5 });
    expect(state.phase).toBe("TEAM_BUILDING");
    expectPendingMatchesPhase(state);
    // 首任队长直接提议，这里不顺延
    expect(state.currentLeaderId).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 组队与讨论
// ---------------------------------------------------------------------------

describe("TEAM_BUILDING 与讨论", () => {
  it("提议后队伍按升序存，转入提议讨论并算好发言顺序", () => {
    const state = step(started(SIX, { leaderId: 4 }), {
      type: "PROPOSE_TEAM",
      playerId: 4,
      team: [5, 1],
      statement: "带 1 和 5，理由如下",
    });
    expect(state.proposedTeam).toEqual([1, 5]);
    expect(state.phase).toBe("PROPOSAL_DISCUSSION");
    // 座位序，从当前队长开始绕一圈
    expect(state.pending.speakingOrder).toEqual([4, 5, 0, 1, 2, 3]);
    // 游标从 1 起步：队长那一格已经被选人说明占掉了
    expect(state.pending.speakerIndex).toBe(1);
    expect(state.log.at(-2)).toEqual({
      kind: "TEAM_PROPOSED",
      leaderId: 4,
      team: [1, 5],
      attempt: 0,
    });
    expect(state.log.at(-1)).toEqual({ kind: "SPEECH", seq: 0, playerId: 4 });
  });

  it("队长的选人说明落成第一条发言，公开可见", () => {
    const state = step(started(SIX, { leaderId: 4 }), {
      type: "PROPOSE_TEAM",
      playerId: 4,
      team: [5, 1],
      statement: "带 1 和 5，理由如下",
    });

    expect(state.speeches).toHaveLength(1);
    expect(state.speeches[0]).toEqual({
      seq: 0,
      playerId: 4,
      // 记成"队长组队"而不是"提议讨论"：这句话是跟名单一起报出来的
      phase: "TEAM_BUILDING",
      missionIndex: 0,
      attempt: 0,
      content: "带 1 和 5，理由如下",
    });
  });

  it("队长说过一次就不再轮到他，抢着发言抛 NOT_YOUR_TURN", () => {
    const state = step(started(SIX, { leaderId: 4 }), {
      type: "PROPOSE_TEAM",
      playerId: 4,
      team: [5, 1],
      statement: "带 1 和 5",
    });

    expectCode(
      () => step(state, { type: "SPEAK", playerId: 4, content: "我再补两句" }),
      "NOT_YOUR_TURN",
    );
    // 轮到的是队长的下一位
    expect(getAwaitingPlayerIds(state)).toEqual([5]);
  });

  it("一次提议讨论恰好产生 6 条发言：1 条选人说明 + 5 条讨论", () => {
    const proposed = step(started(SIX, { leaderId: 4 }), {
      type: "PROPOSE_TEAM",
      playerId: 4,
      team: [5, 1],
      statement: "带 1 和 5",
    });
    const voting = runUntil(proposed, (s) => s.phase === "TEAM_VOTE");

    expect(voting.speeches).toHaveLength(6);
    // 每个座位恰好说了一次，队长也不例外
    expect([...voting.speeches].map((sp) => sp.playerId).sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });

  it("按发言顺序逐人推进，全员说完转 TEAM_VOTE 且清空发言顺序", () => {
    let state = step(started(SIX), {
      type: "PROPOSE_TEAM",
      playerId: 0,
      team: [0, 1],
      statement: "带这几个",
    });
    // 0 号是队长，他的那一次已经由选人说明用掉了，从 1 号开始
    for (const id of [1, 2, 3, 4]) {
      state = step(state, { type: "SPEAK", playerId: id, content: `我是 ${id}` });
      expect(state.phase).toBe("PROPOSAL_DISCUSSION");
    }
    state = step(state, { type: "SPEAK", playerId: 5, content: "最后一个" });
    expect(state.phase).toBe("TEAM_VOTE");
    expectPendingMatchesPhase(state);
  });

  it("发言记录的 seq 递增，attempt 记的是本轮第几次提议", () => {
    const rejected = runUntil(
      started(SIX),
      (s) => s.rejectCount === 1 && s.phase === "TEAM_BUILDING",
      { vote: () => false },
    );
    const speaking = step(rejected, {
      type: "PROPOSE_TEAM",
      playerId: rejected.currentLeaderId,
      team: [0, 1],
      statement: "第二次提议的选人说明",
    });
    // 队长已经说过了，接下来轮到他的下一位
    const [next] = getAwaitingPlayerIds(speaking);
    const spoken = step(speaking, {
      type: "SPEAK",
      playerId: next as PlayerId,
      content: "第二次提议",
    });

    expect(spoken.speeches.map((s) => s.seq)).toEqual(
      spoken.speeches.map((_, i) => i),
    );
    // 选人说明与讨论发言归属同一次提议
    expect(spoken.speeches.at(-2)).toMatchObject({
      phase: "TEAM_BUILDING",
      missionIndex: 0,
      attempt: 1,
      content: "第二次提议的选人说明",
    });
    expect(spoken.speeches.at(-1)).toMatchObject({
      phase: "PROPOSAL_DISCUSSION",
      missionIndex: 0,
      attempt: 1,
      content: "第二次提议",
    });
  });
});

// ---------------------------------------------------------------------------
// 投票
// ---------------------------------------------------------------------------

describe("TEAM_VOTE", () => {
  it("6 人局 3:3 平票判否决，队长顺延一位重提", () => {
    const vote = atPhase(started(SIX), "TEAM_VOTE");
    const settled = runUntil(vote, (s) => s.phase !== "TEAM_VOTE", {
      vote: (_s, id) => id < 3,
    });

    expect(settled.phase).toBe("TEAM_BUILDING");
    expect(settled.rejectCount).toBe(1);
    expect(settled.currentLeaderId).toBe(1);
    expect(settled.proposedTeam).toBeNull();
    expect(settled.proposalHistory.at(-1)).toMatchObject({
      approved: false,
      forced: false,
      votes: { 0: true, 1: true, 2: true, 3: false, 4: false, 5: false },
    });
    expectPendingMatchesPhase(settled);
  });

  it("全员投完前不结算，票只待在 pending 里", () => {
    let state = atPhase(started(SIX), "TEAM_VOTE");
    for (const id of [0, 1, 2, 3, 4]) {
      state = step(state, { type: "CAST_VOTE", playerId: id, approve: true });
    }
    expect(state.phase).toBe("TEAM_VOTE");
    expect(state.proposalHistory).toEqual([]);
    expect(Object.keys(state.pending.votes)).toHaveLength(5);
  });

  it("提议通过时 rejectCount 归零", () => {
    const twiceRejected = runUntil(
      started(SIX),
      (s) => s.rejectCount === 2 && s.phase === "TEAM_BUILDING",
      { vote: () => false },
    );
    const approved = runUntil(
      twiceRejected,
      (s) => s.phase === "MISSION_EXECUTION",
      { vote: () => true },
    );
    expect(approved.rejectCount).toBe(0);
    expect(approved.proposalHistory.at(-1)?.approved).toBe(true);
    expectPendingMatchesPhase(approved);
  });

  it("连续 5 次否决坏人获胜", () => {
    const over = runUntil(started(SIX), (s) => s.phase === "GAME_OVER", {
      vote: () => false,
    });
    expect(over.winner).toBe("EVIL");
    expect(over.winReason).toBe("REJECT_LIMIT");
    expect(over.rejectCount).toBe(5);
    expect(over.proposalHistory).toHaveLength(5);
    expect(over.log.at(-1)).toEqual({
      kind: "GAME_OVER",
      winner: "EVIL",
      reason: "REJECT_LIMIT",
    });
  });

  it("队长每次提议后顺延一位并循环", () => {
    let state = started(SIX, { maxRejects: 20 });
    const leaders: PlayerId[] = [];
    for (let i = 0; i < 8; i += 1) {
      leaders.push(state.currentLeaderId);
      state = runUntil(
        state,
        (s) => s.phase === "TEAM_BUILDING" && s.rejectCount === i + 1,
        { vote: () => false },
      );
    }
    expect(leaders).toEqual([0, 1, 2, 3, 4, 5, 0, 1]);
  });

  it("forcePassOnLastAttempt：最后一次机会跳过投票直接通过", () => {
    const state = runUntil(
      started(SIX, { maxRejects: 3, forcePassOnLastAttempt: true }),
      (s) => s.rejectCount === 2 && s.phase === "TEAM_BUILDING",
      { vote: () => false },
    );
    // 这一次提议不会经过 TEAM_VOTE，讨论结束后直接进任务执行
    const forced = runUntil(state, (s) => s.phase === "MISSION_EXECUTION", {
      vote: () => false,
    });
    expect(forced.rejectCount).toBe(0);
    expect(forced.proposalHistory.at(-1)).toMatchObject({
      approved: true,
      forced: true,
      votes: {},
      attempt: 2,
    });
  });
});

// ---------------------------------------------------------------------------
// 任务执行
// ---------------------------------------------------------------------------

describe("MISSION_EXECUTION", () => {
  it("7 人局第 4 轮：1 张失败票不算失败，2 张才算", () => {
    const team: PlayerId[] = [1, 2, 4, 5]; // 含坏人 1、4、5
    const one = castCards(atMissionExecution(SEVEN, 3, team), [
      { playerId: 1, success: false },
      { playerId: 2, success: true },
      { playerId: 4, success: true },
      { playerId: 5, success: true },
    ]);
    expect(one.missionHistory.at(-1)).toMatchObject({ failCount: 1, succeeded: true });
    expect(one.goodScore).toBe(1);

    const two = castCards(atMissionExecution(SEVEN, 3, team), [
      { playerId: 1, success: false },
      { playerId: 2, success: true },
      { playerId: 4, success: false },
      { playerId: 5, success: true },
    ]);
    expect(two.missionHistory.at(-1)).toMatchObject({ failCount: 2, succeeded: false });
    expect(two.evilScore).toBe(1);
  });

  it("5 人局第 4 轮：1 张失败票就算失败", () => {
    const settled = castCards(atMissionExecution(FIVE, 3, [0, 3, 4]), [
      { playerId: 0, success: true },
      { playerId: 3, success: false },
      { playerId: 4, success: true },
    ]);
    expect(settled.missionHistory.at(-1)).toMatchObject({
      failCount: 1,
      succeeded: false,
    });
  });

  it("cards 按 playerId 升序存，抹掉提交先后", () => {
    const settled = castCards(atMissionExecution(SEVEN, 3, [1, 2, 4, 5]), [
      { playerId: 5, success: true },
      { playerId: 1, success: false },
      { playerId: 4, success: true },
      { playerId: 2, success: true },
    ]);
    expect(settled.missionHistory.at(-1)?.cards.map((c) => c.playerId)).toEqual([
      1, 2, 4, 5,
    ]);
  });

  it("全员交完才结算，结算后清空 proposedTeam 与 pending", () => {
    const partial = castCards(atMissionExecution(FIVE, 0, [0, 3]), [
      { playerId: 0, success: true },
    ]);
    expect(partial.phase).toBe("MISSION_EXECUTION");
    expect(partial.missionHistory).toEqual([]);

    const settled = step(partial, {
      type: "CAST_MISSION_CARD",
      playerId: 3,
      success: false,
    });
    expect(settled.phase).toBe("MISSION_RESULT");
    expect(settled.proposedTeam).toBeNull();
    expectPendingMatchesPhase(settled);
    expect(settled.log.at(-1)).toEqual({
      kind: "MISSION_RESOLVED",
      missionIndex: 0,
      succeeded: false,
      failCount: 1,
    });
  });

  it("任务记录留下队长与本次提议的 attempt", () => {
    const state = runUntil(started(SIX), (s) => s.phase === "MISSION_RESULT", {});
    expect(state.missionHistory.at(-1)).toMatchObject({
      missionIndex: 0,
      attempt: 0,
      leaderId: 0,
      succeeded: true,
    });
  });

  it("好人想投失败也投不出去——合法动作里根本没有那一项", () => {
    const settled = runUntil(
      started(SIX),
      (s) => s.phase === "MISSION_RESULT",
      { fail: () => true },
    );
    const record = settled.missionHistory.at(-1);
    const evil = new Set(evilSeatsOf(settled));
    expect(record?.cards.filter((c) => !c.success).every((c) => evil.has(c.playerId))).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// 任务结算后的推进
// ---------------------------------------------------------------------------

describe("MISSION_RESULT", () => {
  it("好人 3 分进刺杀阶段，winner 仍为 null", () => {
    const state = step(
      { ...atMissionExecution(SIX, 2, [0, 1]), phase: "MISSION_RESULT", goodScore: 3 },
      { type: "NEXT" },
    );
    expect(state.phase).toBe("ASSASSINATION");
    expect(state.winner).toBeNull();
    expect(state.winReason).toBeNull();
  });

  it("坏人 3 分直接终局", () => {
    const state = step(
      { ...atMissionExecution(SIX, 2, [0, 1]), phase: "MISSION_RESULT", evilScore: 3 },
      { type: "NEXT" },
    );
    expect(state.phase).toBe("GAME_OVER");
    expect(state.winner).toBe("EVIL");
    expect(state.winReason).toBe("THREE_MISSIONS");
  });

  it("都没到 3 分则进复盘讨论，发言顺序从当前队长开始", () => {
    const state = step(
      {
        ...atMissionExecution(SIX, 1, [0, 1]),
        phase: "MISSION_RESULT",
        currentLeaderId: 3,
        goodScore: 1,
        evilScore: 1,
      },
      { type: "NEXT" },
    );
    expect(state.phase).toBe("REVIEW_DISCUSSION");
    expect(state.pending.speakingOrder).toEqual([3, 4, 5, 0, 1, 2]);
  });

  it("复盘说完进新一轮：missionIndex + 1、rejectCount 归零、队长顺延", () => {
    const review = runUntil(
      { ...started(SIX), rejectCount: 3, missionIndex: 0 },
      (s) => s.phase === "REVIEW_DISCUSSION",
      { vote: () => true },
    );
    expect(review.rejectCount).toBe(0); // 提议通过时就归零了

    const nextRound = runUntil(review, (s) => s.phase === "TEAM_BUILDING", {});
    expect(nextRound.missionIndex).toBe(1);
    expect(nextRound.rejectCount).toBe(0);
    expect(nextRound.currentLeaderId).toBe(1);
    expect(nextRound.proposedTeam).toBeNull();
    expectPendingMatchesPhase(nextRound);
  });

  it("复盘发言记的是该轮最后一次提议的 attempt", () => {
    const review = atPhase(started(SIX), "REVIEW_DISCUSSION");
    const spoken = step(review, {
      type: "SPEAK",
      playerId: review.pending.speakingOrder[0] as PlayerId,
      content: "复盘",
    });
    expect(spoken.speeches.at(-1)).toMatchObject({
      phase: "REVIEW_DISCUSSION",
      missionIndex: 0,
      attempt: review.missionHistory[0]?.attempt,
    });
  });
});

// ---------------------------------------------------------------------------
// 刺杀
// ---------------------------------------------------------------------------

describe("ASSASSINATION", () => {
  const atAssassination = (roles: Role[]): GameState => ({
    ...started(roles),
    phase: "ASSASSINATION",
    goodScore: 3,
  });

  it("坏人逐个发表推测（含奥伯伦），全说完刺客才动手", () => {
    let state = atAssassination(SEVEN);
    const evils = evilSeatsOf(state);
    expect(evils).toEqual([1, 4, 5]); // 莫甘娜、奥伯伦、刺客

    for (const id of evils) {
      expect(getAwaitingPlayerIds(state)).toEqual([id]);
      state = step(state, { type: "ASSASSIN_OPINION", playerId: id, content: `我猜 ${id}` });
      expect(state.phase).toBe("ASSASSINATION");
    }
    expect(state.pending.assassinOpinions).toHaveLength(3);

    const struck = step(state, { type: "ASSASSINATE", playerId: 5, targetId: 3 });
    expect(struck.assassination?.opinions).toHaveLength(3);
    expect(struck.assassination).toMatchObject({ assassinId: 5, targetId: 3, hit: false });
  });

  /**
   * 【推测必须同时落成一条公开 Speech】不落的话它只在 pending 里，
   * 而 pending 一个字都不进 PlayerView，于是整个 ASSASSIN_OPINION 步骤只写不读。
   *
   * 这个坑真跑出来过两次，两次刺客都刺了自己的队友：seed 94938 那局刺客在推测里
   * 写的是"我怀疑梅林在座位3"（座位 3 真的是梅林），轮到他动手时上下文里一个字都没有，
   * 改指了座位 1——他自己的莫甘娜。
   *
   * 与 PROPOSE_TEAM.statement 是同一个坑的第二次复发。
   */
  it("推测同时进 speeches 和 pending，两份都要有", () => {
    let state = atAssassination(SEVEN);
    const before = state.speeches.length;

    state = step(state, { type: "ASSASSIN_OPINION", playerId: 1, content: "我怀疑 3 号" });

    expect(state.speeches).toHaveLength(before + 1);
    expect(state.speeches.at(-1)).toMatchObject({
      seq: before,
      playerId: 1,
      phase: "ASSASSINATION",
      content: "我怀疑 3 号",
    });
    // 调度与结算仍然靠 pending，两份数据缺一不可
    expect(state.pending.assassinOpinions).toEqual([{ playerId: 1, content: "我怀疑 3 号" }]);

    // seq 连续——speeches 只被追加
    state = step(state, { type: "ASSASSIN_OPINION", playerId: 4, content: "我同意" });
    expect(state.speeches.map((s) => s.seq)).toEqual(state.speeches.map((_, i) => i));
  });

  it("轮到刺客动手时，他在自己的视角里读得到刚才所有推测（含他自己那条）", () => {
    let state = atAssassination(SEVEN);
    const evils = evilSeatsOf(state);
    const assassin = evils.at(-1)!; // 5 号，最后一个说、也是动手的人

    for (const id of evils) {
      state = step(state, { type: "ASSASSIN_OPINION", playerId: id, content: `我猜 ${id}` });
    }

    const view = toPlayerView(state, assassin);
    // 这一条直接钉住 seed 94938 那个 bug：他自己刚说的话不能凭空消失
    expect(view.speeches.map((s) => s.content)).toEqual(evils.map((id) => `我猜 ${id}`));
    expect(getLegalActions(state, assassin).some((a) => a.type === "ASSASSINATE")).toBe(true);
  });

  it("命中梅林坏人翻盘", () => {
    const over = runUntil(
      atAssassination(SIX),
      (s) => s.phase === "GAME_OVER",
      { target: () => MERLIN_SEAT },
    );
    expect(over.winner).toBe("EVIL");
    expect(over.winReason).toBe("ASSASSINATION_HIT");
    expect(over.assassination?.hit).toBe(true);
  });

  it("刺错人则好人赢下这一局", () => {
    const over = runUntil(
      atAssassination(SIX),
      (s) => s.phase === "GAME_OVER",
      { target: () => 1 },
    );
    expect(over.winner).toBe("GOOD");
    expect(over.winReason).toBe("ASSASSINATION_MISS");
    expect(over.assassination).toMatchObject({ targetId: 1, hit: false });
    expectPendingMatchesPhase(over);
  });
});

// ---------------------------------------------------------------------------
// 整局
// ---------------------------------------------------------------------------

describe("整局", () => {
  /** 每一步都查一遍 pending 与阶段是否相符，跑完再看终局 */
  function playThrough(state: GameState, strategy: Strategy): GameState {
    const policy = policyOf(strategy);
    let current = state;
    for (let i = 0; i < 3000 && current.phase !== "GAME_OVER"; i += 1) {
      current = advance(current, policy);
      expectPendingMatchesPhase(current);
    }
    expect(current.phase).toBe("GAME_OVER");
    return current;
  }

  it("坏人每次都破坏 → 三次任务失败，坏人获胜", () => {
    const over = playThrough(newGame(SIX), { fail: () => true, team: evilHeavyTeam });
    expect(over.winner).toBe("EVIL");
    expect(over.winReason).toBe("THREE_MISSIONS");
    expect(over.evilScore).toBe(3);
    expect(over.missionHistory).toHaveLength(3);
  });

  it("坏人从不破坏 → 好人 3 分后进刺杀，由刺杀定胜负", () => {
    const over = playThrough(newGame(SEVEN), { target: () => MERLIN_SEAT });
    expect(over.goodScore).toBe(3);
    expect(over.winner).toBe("EVIL");
    expect(over.winReason).toBe("ASSASSINATION_HIT");
    expect(over.assassination?.opinions).toHaveLength(3);
  });

  it("任意人数都能跑完，且任务不超过 5 轮", () => {
    for (const roles of [FIVE, SIX, SEVEN]) {
      const over = playThrough(newGame(roles), {
        // 只在第 2、4 轮破坏，凑出一局有输有赢的对局
        fail: (s) => s.missionIndex % 2 === 1,
      });
      expect(over.missionHistory.length).toBeLessThanOrEqual(5);
      expect(over.winner).not.toBeNull();
      expect(over.winReason).not.toBeNull();
    }
  });

  it("同一初始状态跑两次，结果完全一致", () => {
    const strategy: Strategy = { fail: (_s, id) => id % 2 === 0 };
    const a = playThrough(newGame(SEVEN), strategy);
    const b = playThrough(newGame(SEVEN), strategy);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
