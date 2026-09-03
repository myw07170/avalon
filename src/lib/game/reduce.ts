/**
 * 状态机主入口：reduce(state, action, rng) -> newState
 *
 * 纯函数。不发网络请求，不调 LLM，不读时间戳，不用 Math.random
 * （随机源作为参数注入）。这样才测得动。
 *
 * 本文件只做两件事：先 assertLegal，再按 phase 分派。
 * 所有判定与转移都在 phases/ 下，任何一条规则判断都不该出现在这里。
 */
import { assertLegal } from "./legal";
import { reduceAssassination } from "./phases/assassination";
import { reduceDiscussion } from "./phases/discussion";
import { reduceMission } from "./phases/mission";
import { reduceMissionResult } from "./phases/missionResult";
import { reduceRoleReveal } from "./phases/roleReveal";
import { reduceSetup } from "./phases/setup";
import { reduceTeamBuilding } from "./phases/teamBuilding";
import { reduceTeamVote } from "./phases/teamVote";
import {
  EngineError,
  type GameAction,
  type GameState,
  type RngFn,
} from "./types";

/**
 * 目前没有任何阶段需要随机源：洗牌发牌在 createGame 里就做完了。
 * 参数仍然保留——它是 state-machine.md §3 的回放契约的一部分，
 * 签名稳定比少一个下划线重要。真需要随机时，从这里往下透传给对应分支即可。
 */
export function reduce(
  state: GameState,
  action: GameAction,
  _rng: RngFn,
): GameState {
  // 非法动作直接抛错，不静默忽略。分派之后的分支因此可以只管转移，不再校验
  assertLegal(state, action);

  switch (state.phase) {
    case "SETUP":
      return reduceSetup(state, action);
    case "ROLE_REVEAL":
      return reduceRoleReveal(state, action);
    case "TEAM_BUILDING":
      return reduceTeamBuilding(state, action);
    case "PROPOSAL_DISCUSSION":
      return reduceDiscussion(state, action);
    case "TEAM_VOTE":
      return reduceTeamVote(state, action);
    case "MISSION_EXECUTION":
      return reduceMission(state, action);
    case "MISSION_RESULT":
      return reduceMissionResult(state, action);
    case "ASSASSINATION":
      return reduceAssassination(state, action);
    case "GAME_OVER":
      // assertLegal 里 GAME_OVER 的动作集合是空的，任何动作都过不来。
      // 走到这里说明那张表和这个 switch 分叉了
      throw new EngineError("对局已结束，不再接受任何动作", "INTERNAL", {
        action: action.type,
      });
  }
}
