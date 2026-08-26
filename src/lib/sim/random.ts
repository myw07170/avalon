/**
 * 全随机合法策略的模拟对局。引擎的验收工具。
 *
 * 阶段 3 的完成标准：跑 1000 局，断言无异常抛出、每局都到达 GAME_OVER、
 * 胜负双方都出现过、任务轮数不超过 5，且同一 seed 跑两次结果完全一致。
 *
 * 这个文件不做任何规则判断——它只会：问引擎"现在轮到谁"、问引擎"他能做什么"、
 * 随机挑一个交回去。规则判断一旦泄漏到这里，模拟就不再是对引擎的独立检验了。
 */
import { createConfig } from "../game/config";
import {
  getAwaitingPlayerIds,
  getLegalActions,
  getSystemActions,
  getTeamConstraint,
} from "../game/legal";
import { reduce } from "../game/reduce";
import { createRng, pick, shuffle } from "../game/rng";
import { createGame, makePlaceholderPersonas } from "../game/setup";
import {
  EngineError,
  type GameAction,
  type GameState,
  type PlayerId,
  type RngFn,
  type Team,
  type WinReason,
} from "../game/types";

export interface SimOptions {
  /**
   * 每一步【提交动作之前】的中间状态。
   *
   * 终局状态不会经过这里——它在 finalState 里，而且 GAME_OVER 的视角本就公开全部身份，
   * 混进来会让"整局中每一步都不泄漏"这类断言失去意义。
   */
  onStep?: (state: GameState) => void;
}

export interface SimResult {
  winner: Team;
  winReason: WinReason;
  missionsPlayed: number;
  finalState: GameState;
}

/**
 * 一局的步数上限。
 *
 * 正常一局最多 5 轮 × (5 次提议 × (1 提议 + n 发言 + n 投票) + n 任务票 + n 复盘发言)，
 * 10 人局也就一千出头。撞到这个上限说明状态机在某处转不动了——
 * 这正是模拟对局要抓的那类 bug，所以宁可抛错，也不要静静地空转。
 */
const MAX_STEPS = 5000;

/**
 * 把模板动作填成一个具体动作。
 *
 * legal.ts 对两类动作只给模板：组队不穷举 C(10,5) 种组合，发言的文本引擎不管。
 * 这里补上的内容照样要过 assertLegal——模板只是便利，校验才是闸门。
 */
function fillTemplate(state: GameState, action: GameAction, rng: RngFn): GameAction {
  switch (action.type) {
    case "PROPOSE_TEAM": {
      const { teamSize, candidateIds } = getTeamConstraint(state);
      return {
        ...action,
        team: shuffle(candidateIds, rng)
          .slice(0, teamSize)
          .sort((a, b) => a - b),
        // 队长的选人说明也是自由文本，与下面的 SPEAK 同样只填个模板
        statement: `[模拟] 座位 ${action.playerId} 的选人说明`,
      };
    }
    case "SPEAK":
    case "ASSASSIN_OPINION":
      return {
        ...action,
        content: `[模拟] 座位 ${action.playerId} 在 ${state.phase} 的发言`,
      };
    default:
      return action;
  }
}

function randomActionFor(state: GameState, playerId: PlayerId, rng: RngFn): GameAction {
  const actions = getLegalActions(state, playerId);
  if (actions.length === 0) {
    // getAwaitingPlayerIds 说轮到他了，getLegalActions 却给不出动作，两者分叉了
    throw new EngineError(
      `${state.phase} 阶段轮到座位 ${playerId}，却没有任何合法动作`,
      "INTERNAL",
      { phase: state.phase, playerId },
    );
  }
  return fillTemplate(state, pick(actions, rng), rng);
}

/** 下一步该提交什么。没人待行动就走系统动作（START_GAME / NEXT） */
function nextAction(state: GameState, rng: RngFn): GameAction {
  const awaiting = getAwaitingPlayerIds(state);
  if (awaiting.length === 0) {
    const systemActions = getSystemActions(state);
    if (systemActions.length === 0) {
      throw new EngineError(
        `${state.phase} 阶段既无人可动，也没有系统动作——状态机卡住了`,
        "INTERNAL",
        { phase: state.phase },
      );
    }
    return pick(systemActions, rng);
  }
  // 从待行动的人里随机挑一个，而不是永远挑第一个：
  // 同时行动的阶段（投票、任务票）本就没有先后，固定顺序会让一整类顺序相关的 bug 测不到
  return randomActionFor(state, pick(awaiting, rng), rng);
}

/**
 * 每一步都从 getLegalActions 里随机取，因此永远不会构造出非法状态。
 *
 * 同一个 rng 从发牌一直用到最后一个动作，所以「同一 seed == 同一局」成立，
 * 偶发崩溃可以靠 seed 复现。
 */
export function simulateGame(
  playerCount: number,
  seed: number,
  options: SimOptions = {},
): SimResult {
  const rng = createRng(seed);
  let state = createGame({
    config: createConfig(playerCount, { seed }),
    humanSeat: null,
    personas: makePlaceholderPersonas(playerCount),
    rng,
  });

  for (let step = 0; state.phase !== "GAME_OVER"; step += 1) {
    if (step >= MAX_STEPS) {
      throw new EngineError(
        `${playerCount} 人局 seed ${seed} 跑了 ${MAX_STEPS} 步还没结束，停在 ${state.phase}`,
        "INTERNAL",
        { playerCount, seed, phase: state.phase },
      );
    }
    options.onStep?.(state);
    state = reduce(state, nextAction(state, rng), rng);
  }

  const { winner, winReason } = state;
  if (!winner || !winReason) {
    throw new EngineError("终局状态没有胜负结果", "INTERNAL", { seed, winner, winReason });
  }

  return {
    winner,
    winReason,
    missionsPlayed: state.missionHistory.length,
    finalState: state,
  };
}
