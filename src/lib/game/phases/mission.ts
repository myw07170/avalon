/**
 * MISSION_EXECUTION：累积任务票，全体队员交完才结算。
 *
 * 非队员提交、好人投失败，都由 assertLegal 拦下（NOT_YOUR_TURN / GOOD_CANNOT_FAIL）。
 * 好人投失败那条是引擎级硬约束，legal.ts 的候选项里根本没有那个选项，这里是第二道保险。
 */
import { getCurrentMission, requireProposedTeam } from "../legal";
import {
  EngineError,
  createPending,
  type GameAction,
  type GameState,
  type MissionRecord,
} from "../types";
import { unexpectedAction, withLog } from "./transitions";

/** 刚通过的那次提议。proposalHistory 的最后一条必然就是它 */
function approvedAttempt(state: GameState): number {
  const last = state.proposalHistory[state.proposalHistory.length - 1];
  if (!last?.approved) {
    // 进入本阶段的唯一路径是 settleProposal 判通过，取不到即为引擎 bug
    throw new EngineError("任务执行前没有已通过的提议", "INTERNAL", {
      missionIndex: state.missionIndex,
      proposalCount: state.proposalHistory.length,
    });
  }
  return last.attempt;
}

export function reduceMission(state: GameState, action: GameAction): GameState {
  if (action.type !== "CAST_MISSION_CARD") throw unexpectedAction(state, action);

  const team = requireProposedTeam(state);
  const cards = [
    ...state.pending.cards,
    { playerId: action.playerId, success: action.success },
  ];
  const submitted: GameState = { ...state, pending: { ...state.pending, cards } };

  if (cards.length < team.length) return submitted;

  // 按 playerId 升序存。提交先后是能反推投票人的信息，
  // 引擎内部记录也不保留它（rules.md §4.3、types.ts 对 MissionRecord.cards 的约定）
  const sorted = [...cards].sort((a, b) => a.playerId - b.playerId);
  const failCount = sorted.filter((c) => !c.success).length;
  const { failsRequired } = getCurrentMission(state);
  const succeeded = failCount < failsRequired;

  const record: MissionRecord = {
    missionIndex: state.missionIndex,
    attempt: approvedAttempt(state),
    // 整轮内 currentLeaderId 一直指向本次提议人，顺延要等下一次提议之前
    leaderId: state.currentLeaderId,
    team: [...team],
    cards: sorted,
    failCount,
    succeeded,
  };

  return withLog(
    {
      ...submitted,
      phase: "MISSION_RESULT",
      proposedTeam: null,
      pending: createPending(),
      missionHistory: [...state.missionHistory, record],
      goodScore: succeeded ? state.goodScore + 1 : state.goodScore,
      evilScore: succeeded ? state.evilScore : state.evilScore + 1,
    },
    {
      kind: "MISSION_RESOLVED",
      missionIndex: state.missionIndex,
      succeeded,
      failCount,
    },
  );
}
