/**
 * TEAM_VOTE：累积投票，全员投完才一次性结算。
 *
 * 组队投票规则上是"公开投票"，但必须【同时】公开：先投的票若立刻可见，
 * 后投的 AI 会退化成跟票，整个博弈失效（state-machine.md §2.1）。
 * 所以票一直待在 pending.votes 里，结算时才一次性写进 proposalHistory。
 */
import type { GameAction, GameState } from "../types";
import { settleProposal, unexpectedAction } from "./transitions";

export function reduceTeamVote(state: GameState, action: GameAction): GameState {
  if (action.type !== "CAST_VOTE") throw unexpectedAction(state, action);

  // 重复投票由 assertLegal 抛 DUPLICATE_SUBMISSION，这里不会覆盖掉已有的票
  const votes = { ...state.pending.votes, [action.playerId]: action.approve };
  const voted: GameState = { ...state, pending: { ...state.pending, votes } };

  if (Object.keys(votes).length < state.players.length) return voted;

  const approveCount = Object.values(votes).filter(Boolean).length;
  // rules.md §4.2 第 3 条：同意票【严格大于】半数才通过，平票视为否决。
  // 写成 * 2 > playerCount 而不是 > playerCount / 2，省掉一个浮点数
  const approved = approveCount * 2 > state.players.length;

  return settleProposal(voted, { approved, votes, forced: false });
}
