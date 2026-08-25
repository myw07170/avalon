/**
 * PROPOSAL_DISCUSSION 与 REVIEW_DISCUSSION 共用。
 *
 * 两个阶段的调度完全一样（按 pending.speakingOrder 逐人推进 speakerIndex），
 * 只有"说完之后去哪"不同：提议讨论去投票，复盘讨论进新一轮。
 * 非当前发言人提交 SPEAK 由 assertLegal 抛 NOT_YOUR_TURN，这里拿到的必然是当前发言人。
 */
import {
  EngineError,
  type GameAction,
  type GameState,
  type Speech,
} from "../types";
import {
  enterNextMission,
  enterTeamVote,
  unexpectedAction,
  withLog,
} from "./transitions";

/**
 * 发言归属哪一轮、哪一次提议。
 *
 * 复盘讨论记的是【该轮最后一次提议】的 attempt（types.ts 对 Speech.attempt 的约定）：
 * 此刻 missionIndex 还没 +1，missionHistory 的最后一条就是刚打完的这一轮。
 */
function speechContext(state: GameState): { missionIndex: number; attempt: number } {
  if (state.phase === "PROPOSAL_DISCUSSION") {
    return { missionIndex: state.missionIndex, attempt: state.rejectCount };
  }
  const last = state.missionHistory[state.missionHistory.length - 1];
  if (!last) {
    // 复盘讨论只可能从 MISSION_RESULT 过来，那时必然已经结算过一轮任务
    throw new EngineError("复盘讨论前没有任何任务记录", "INTERNAL", {
      missionIndex: state.missionIndex,
    });
  }
  return { missionIndex: last.missionIndex, attempt: last.attempt };
}

export function reduceDiscussion(state: GameState, action: GameAction): GameState {
  if (action.type !== "SPEAK") throw unexpectedAction(state, action);

  const speech: Speech = {
    // seq 只增不减：speeches 只被追加，长度就是下一个序号
    seq: state.speeches.length,
    playerId: action.playerId,
    phase: state.phase,
    ...speechContext(state),
    content: action.content,
  };

  const speakerIndex = state.pending.speakerIndex + 1;
  const spoken = withLog(
    {
      ...state,
      speeches: [...state.speeches, speech],
      pending: { ...state.pending, speakerIndex },
    },
    { kind: "SPEECH", seq: speech.seq, playerId: action.playerId },
  );

  if (speakerIndex < spoken.pending.speakingOrder.length) return spoken;

  // 全员发言完毕。enterTeamVote 内部会处理 forcePassOnLastAttempt 变体
  return spoken.phase === "PROPOSAL_DISCUSSION"
    ? enterTeamVote(spoken)
    : enterNextMission(spoken);
}
