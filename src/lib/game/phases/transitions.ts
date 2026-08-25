/**
 * 阶段转移的共用工具。
 *
 * 单独成文件，是因为各阶段之间要互相触发转移（讨论结束进投票、投票通过进任务）。
 * 把它们放进 reduce.ts 会形成 reduce → phases → reduce 的循环 import。
 *
 * 三条硬规矩，本文件的每个函数都遵守：
 * 1. 进入新阶段一律 `pending: createPending()`，再填新阶段需要的字段。
 *    上一阶段的投票漏进下一阶段是这里最容易出的事故。
 * 2. 全部返回新对象，绝不原地改传入的 state。
 * 3. 「同轮换队长重提」和「新一轮开始」写成两个名字完全不同的函数。
 *    state-machine.md §2 点名这两条路混淆是本项目最典型的 bug，
 *    所以刻意不做成 enterTeamBuilding(state, isNewRound) ——
 *    传错一个布尔值太容易，写错一个函数名难得多。
 */
import { requireProposedTeam } from "../legal";
import {
  EngineError,
  createPending,
  type GameAction,
  type GameEvent,
  type GameState,
  type PlayerId,
  type ProposalRecord,
  type Team,
  type WinReason,
} from "../types";

/** 追加事件。log 只被追加，引擎判定逻辑从不读它 */
export function withLog(state: GameState, ...events: GameEvent[]): GameState {
  return { ...state, log: [...state.log, ...events] };
}

/**
 * assertLegal 已经按 PHASE_ACTIONS 拦过一遍，分支里再收到不认识的动作，
 * 说明那张表和这里的分派逻辑分叉了——是引擎 bug，不是外部输入错误。
 */
export function unexpectedAction(state: GameState, action: GameAction): EngineError {
  return new EngineError(`${state.phase} 分支收到了 ${action.type}`, "INTERNAL", {
    phase: state.phase,
    action: action.type,
  });
}

/** rules.md §4.1：队长顺位向后移动一位，循环 */
export function nextLeaderId(state: GameState): PlayerId {
  return (state.currentLeaderId + 1) % state.players.length;
}

/** rules.md §4.4：发言顺序为座位序，从当前队长开始绕一圈 */
export function speakingOrderFrom(
  leaderId: PlayerId,
  playerCount: number,
): PlayerId[] {
  return Array.from({ length: playerCount }, (_, i) => (leaderId + i) % playerCount);
}

// ---------------------------------------------------------------------------
// 讨论
// ---------------------------------------------------------------------------

/**
 * 发言顺序在【进入讨论阶段时】才算，不提前到 ROLE_REVEAL。
 * legal.ts 只在讨论阶段读 pending.speakingOrder，提前算会让一份过期的顺序
 * 在 TEAM_BUILDING / TEAM_VOTE 期间躺在 pending 里，与规矩 1 直接冲突。
 */
function enterDiscussion(
  state: GameState,
  phase: "PROPOSAL_DISCUSSION" | "REVIEW_DISCUSSION",
): GameState {
  return {
    ...state,
    phase,
    pending: {
      ...createPending(),
      speakingOrder: speakingOrderFrom(state.currentLeaderId, state.players.length),
      speakerIndex: 0,
    },
  };
}

export function enterProposalDiscussion(state: GameState): GameState {
  return enterDiscussion(state, "PROPOSAL_DISCUSSION");
}

export function enterReviewDiscussion(state: GameState): GameState {
  return enterDiscussion(state, "REVIEW_DISCUSSION");
}

// ---------------------------------------------------------------------------
// 投票与提议结算
// ---------------------------------------------------------------------------

/**
 * 变体 forcePassOnLastAttempt 的唯一实现点。
 *
 * 开启后，最后一次机会不投票直接通过——状态机根本不在 TEAM_VOTE 停留。
 * legal.ts 因此不必特判这个变体，那边的注释指向的就是这里。
 */
export function enterTeamVote(state: GameState): GameState {
  const { forcePassOnLastAttempt, maxRejects } = state.config;
  if (forcePassOnLastAttempt && state.rejectCount === maxRejects - 1) {
    return settleProposal(state, { approved: true, votes: {}, forced: true });
  }
  return { ...state, phase: "TEAM_VOTE", pending: createPending() };
}

export interface ProposalOutcome {
  approved: boolean;
  /** 强制通过时为空对象——没人投过票，不能编出一份全票赞成的记录 */
  votes: Record<PlayerId, boolean>;
  forced: boolean;
}

/**
 * 写 proposalHistory 并按结果分派。正常投票与强制通过共用这一条出口。
 *
 * rejectCount 的两次归零都在这条链上：通过时归零（rules.md §4.2 第 6 条），
 * 新一轮开始时归零则在 enterNextMission 里。
 */
export function settleProposal(
  state: GameState,
  outcome: ProposalOutcome,
): GameState {
  const team = requireProposedTeam(state);
  const record: ProposalRecord = {
    missionIndex: state.missionIndex,
    // 本轮第几次提议：第一次提议时 rejectCount 为 0，正好对上
    attempt: state.rejectCount,
    leaderId: state.currentLeaderId,
    team: [...team],
    votes: { ...outcome.votes },
    approved: outcome.approved,
    forced: outcome.forced,
  };
  const rejectCount = outcome.approved ? 0 : state.rejectCount + 1;

  const settled = withLog(
    {
      ...state,
      rejectCount,
      proposalHistory: [...state.proposalHistory, record],
    },
    {
      kind: "VOTE_RESOLVED",
      approved: outcome.approved,
      votes: { ...outcome.votes },
      rejectCount,
    },
  );

  if (outcome.approved) {
    return { ...settled, phase: "MISSION_EXECUTION", pending: createPending() };
  }
  // rules.md §4.2 第 5 条：否决次数达上限，坏人立即获胜
  if (rejectCount >= state.config.maxRejects) {
    return endGame(settled, "EVIL", "REJECT_LIMIT");
  }
  return enterNextProposal(settled);
}

// ---------------------------------------------------------------------------
// 两条通往 TEAM_BUILDING 的路，含义完全不同
// ---------------------------------------------------------------------------

/** 同一轮内换队长重提：missionIndex 不变，rejectCount 保持已递增的值 */
export function enterNextProposal(state: GameState): GameState {
  const leaderId = nextLeaderId(state);
  return withLog(
    {
      ...state,
      phase: "TEAM_BUILDING",
      currentLeaderId: leaderId,
      proposedTeam: null,
      pending: createPending(),
    },
    { kind: "LEADER_CHANGED", leaderId, missionIndex: state.missionIndex },
  );
}

/** 新一轮任务开始：missionIndex + 1，rejectCount 归零（计数器每轮独立） */
export function enterNextMission(state: GameState): GameState {
  const missionIndex = state.missionIndex + 1;
  if (missionIndex >= state.config.missions.length) {
    // 5 轮打完必有一方到 3 分，missionResult.ts 会先终局。走到这里说明比分算错了
    throw new EngineError(
      `第 ${missionIndex + 1} 轮不存在，比分 ${state.goodScore}:${state.evilScore} 却没有终局`,
      "INTERNAL",
      { missionIndex, goodScore: state.goodScore, evilScore: state.evilScore },
    );
  }
  const leaderId = nextLeaderId(state);
  return withLog(
    {
      ...state,
      phase: "TEAM_BUILDING",
      missionIndex,
      currentLeaderId: leaderId,
      rejectCount: 0,
      proposedTeam: null,
      pending: createPending(),
    },
    { kind: "LEADER_CHANGED", leaderId, missionIndex },
  );
}

// ---------------------------------------------------------------------------
// 终局
// ---------------------------------------------------------------------------

export function endGame(
  state: GameState,
  winner: Team,
  winReason: WinReason,
): GameState {
  return withLog(
    {
      ...state,
      phase: "GAME_OVER",
      winner,
      winReason,
      proposedTeam: null,
      pending: createPending(),
    },
    { kind: "GAME_OVER", winner, reason: winReason },
  );
}
