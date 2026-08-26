/**
 * TEAM_BUILDING：记下队伍与队长的选人说明，转提议讨论。
 *
 * 队伍人数、重复座位、座位是否存在，assertLegal 已经全查过（legal.ts 的 assertTeam）。
 * 这里不再查第二遍——config.ts 立过的规矩：两处分头写判断迟早分叉。
 *
 * 【选人说明就是队长的那一次发言】rules.md §4.4 写的是"每人发言一次，队长先发言
 * 解释选人理由"。所以 `statement` 在这里就落成一条 Speech，队长在紧接着的
 * PROPOSAL_DISCUSSION 里不会再轮到（见 transitions.ts 的 enterProposalDiscussion）。
 * 早先这个字段被 orchestrator 丢掉过，症状是队长报完名单一个字不解释、
 * 其余人只能对着 proposedTeam 干猜——引擎不报错，只是整局讨论变蠢。
 */
import type { GameAction, GameState, Speech } from "../types";
import { enterProposalDiscussion, unexpectedAction, withLog } from "./transitions";

export function reduceTeamBuilding(state: GameState, action: GameAction): GameState {
  if (action.type !== "PROPOSE_TEAM") throw unexpectedAction(state, action);

  // 升序存放，抹掉"队长先点了谁"这种没有意义、却会被 AI 当线索的顺序
  const team = [...action.team].sort((a, b) => a - b);

  const statement: Speech = {
    // seq 只增不减：speeches 只被追加，长度就是下一个序号
    seq: state.speeches.length,
    playerId: action.playerId,
    // 记 TEAM_BUILDING 而不是 PROPOSAL_DISCUSSION：渲染成"队长组队"比混进讨论更有信息量，
    // 读的人一眼能看出这句话是跟名单一起报出来的
    phase: "TEAM_BUILDING",
    missionIndex: state.missionIndex,
    // 本轮第几次提议。第一次提议时 rejectCount 为 0，正好对上
    attempt: state.rejectCount,
    content: action.statement,
  };

  const proposed = withLog(
    { ...state, proposedTeam: team, speeches: [...state.speeches, statement] },
    {
      kind: "TEAM_PROPOSED",
      leaderId: state.currentLeaderId,
      team: [...team],
      attempt: state.rejectCount,
    },
    { kind: "SPEECH", seq: statement.seq, playerId: action.playerId },
  );

  return enterProposalDiscussion(proposed);
}
