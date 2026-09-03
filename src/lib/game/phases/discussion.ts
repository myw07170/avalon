/**
 * PROPOSAL_DISCUSSION：按 pending.speakingOrder 逐人推进 speakerIndex。
 * 非当前发言人提交 SPEAK 由 assertLegal 抛 NOT_YOUR_TURN，这里拿到的必然是当前发言人。
 */
import { type GameAction, type GameState, type Speech } from "../types";
import { enterTeamVote, unexpectedAction, withLog } from "./transitions";

export function reduceDiscussion(state: GameState, action: GameAction): GameState {
  if (action.type !== "SPEAK") throw unexpectedAction(state, action);

  const speech: Speech = {
    // seq 只增不减：speeches 只被追加，长度就是下一个序号
    seq: state.speeches.length,
    playerId: action.playerId,
    phase: "PROPOSAL_DISCUSSION",
    missionIndex: state.missionIndex,
    attempt: state.rejectCount,
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
  return enterTeamVote(spoken);
}
