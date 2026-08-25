/**
 * TEAM_BUILDING：记下队伍，转提议讨论。
 *
 * 队伍人数、重复座位、座位是否存在，assertLegal 已经全查过（legal.ts 的 assertTeam）。
 * 这里不再查第二遍——config.ts 立过的规矩：两处分头写判断迟早分叉。
 */
import type { GameAction, GameState } from "../types";
import { enterProposalDiscussion, unexpectedAction, withLog } from "./transitions";

export function reduceTeamBuilding(state: GameState, action: GameAction): GameState {
  if (action.type !== "PROPOSE_TEAM") throw unexpectedAction(state, action);

  // 升序存放，抹掉"队长先点了谁"这种没有意义、却会被 AI 当线索的顺序
  const team = [...action.team].sort((a, b) => a - b);

  const proposed = withLog(
    { ...state, proposedTeam: team },
    {
      kind: "TEAM_PROPOSED",
      leaderId: state.currentLeaderId,
      team: [...team],
      // 本轮第几次提议。第一次提议时 rejectCount 为 0，正好对上
      attempt: state.rejectCount,
    },
  );

  return enterProposalDiscussion(proposed);
}
