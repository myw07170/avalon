/**
 * 合法动作枚举 —— 防作弊的第一道闸。
 *
 * AI 的候选项直接来自这里，不由 prompt 自由发挥：
 * 好人在 MISSION_EXECUTION 拿到的列表里根本没有"投失败"这个选项，想投也投不了。
 *
 * 本文件维持三条不变量，测试逐条钉死：
 * 1. `getLegalActions` 返回的每一项都能通过 `assertLegal`——
 *    "能选的"和"能做的"必须是同一件事，否则调用方照着候选项做反而会被抛错。
 * 2. 不该行动的玩家返回 `[]` 而不是抛错。轮询式的调用方（UI、模拟对局）
 *    每一步都要对全体玩家问一遍，抛错就没法写循环了。
 * 3. 阶段与动作类型的对应关系只写在 PHASE_ACTIONS 一张表里。
 *    散成各分支的 if，迟早出现"getLegalActions 给了但 reduce 不收"的分叉。
 */
import {
  EngineError,
  ROLE_TEAM,
  type ActionType,
  type GameAction,
  type GameState,
  type MissionConfig,
  type Phase,
  type Player,
  type PlayerId,
} from "./types";

/**
 * 各阶段接受的动作类型，state-machine.md §2 转移表的代码化。
 *
 * GAME_OVER 是空集：终局复盘（rules.md §5.7）纯展示，不经过引擎。
 */
const PHASE_ACTIONS: Record<Phase, ReadonlySet<ActionType>> = {
  SETUP: new Set<ActionType>(["START_GAME"]),
  ROLE_REVEAL: new Set<ActionType>(["ACKNOWLEDGE"]),
  TEAM_BUILDING: new Set<ActionType>(["PROPOSE_TEAM"]),
  PROPOSAL_DISCUSSION: new Set<ActionType>(["SPEAK"]),
  TEAM_VOTE: new Set<ActionType>(["CAST_VOTE"]),
  MISSION_EXECUTION: new Set<ActionType>(["CAST_MISSION_CARD"]),
  MISSION_RESULT: new Set<ActionType>(["NEXT"]),
  REVIEW_DISCUSSION: new Set<ActionType>(["SPEAK"]),
  ASSASSINATION: new Set<ActionType>(["ASSASSIN_OPINION", "ASSASSINATE"]),
  GAME_OVER: new Set<ActionType>([]),
};

// ---------------------------------------------------------------------------
// 内部小工具
// ---------------------------------------------------------------------------

function findSeat(state: GameState, playerId: PlayerId): Player | undefined {
  return state.players.find((p) => p.id === playerId);
}

function isEvil(player: Player): boolean {
  return ROLE_TEAM[player.role] === "EVIL";
}

/** 本轮任务的规模与失败门槛。missionIndex 越界只可能是引擎自己算错了 */
export function getCurrentMission(state: GameState): MissionConfig {
  const mission = state.config.missions[state.missionIndex];
  if (!mission) {
    throw new EngineError(
      `missionIndex ${state.missionIndex} 越界，本局只有 ${state.config.missions.length} 轮任务`,
      "INTERNAL",
      { missionIndex: state.missionIndex },
    );
  }
  return mission;
}

/**
 * MISSION_EXECUTION 阶段必然有已通过的队伍，取不到即为引擎 bug。
 * phases/teamVote.ts 与 phases/mission.ts 也要用，所以导出，不各写一份 null 检查。
 */
export function requireProposedTeam(state: GameState): PlayerId[] {
  if (!state.proposedTeam) {
    throw new EngineError(`${state.phase} 阶段没有待执行的队伍`, "INTERNAL", {
      phase: state.phase,
    });
  }
  return state.proposedTeam;
}

function requireAssassinId(state: GameState): PlayerId {
  const assassin = state.players.find((p) => p.role === "ASSASSIN");
  if (!assassin) {
    // 配置层锁死刺客恰好 1 个，取不到只可能是绕过 validateConfig 造出来的状态
    throw new EngineError("本局没有刺客，刺杀阶段无法进行", "INTERNAL");
  }
  return assassin.id;
}

/**
 * 刺杀阶段的两个子步骤。
 *
 * rules.md §4.5：先让所有坏人各发表一次推测，再由刺客做最终选择。
 * "所有坏人"含奥伯伦——他也是坏人，只是不认识队友。
 * 发言次序取座位号升序，phases/assassination.ts 必须按同一个次序结算。
 */
type AssassinationStage =
  | { kind: "OPINION"; playerId: PlayerId }
  | { kind: "STRIKE"; playerId: PlayerId };

function getAssassinationStage(state: GameState): AssassinationStage {
  const spoken = new Set(state.pending.assassinOpinions.map((o) => o.playerId));
  const pendingEvil = state.players.find((p) => isEvil(p) && !spoken.has(p.id));
  if (pendingEvil) return { kind: "OPINION", playerId: pendingEvil.id };
  return { kind: "STRIKE", playerId: requireAssassinId(state) };
}

/** 讨论阶段的当前发言人。游标走到头表示本阶段发言完毕，等 reduce 转阶段 */
function currentSpeakerId(state: GameState): PlayerId | undefined {
  return state.pending.speakingOrder[state.pending.speakerIndex];
}

// ---------------------------------------------------------------------------
// 轮到谁
// ---------------------------------------------------------------------------

/**
 * 当前阶段在等谁行动。空数组表示等系统推进（见 getSystemActions）。
 *
 * 同时行动的阶段（组队投票、任务票）返回所有尚未提交的人，一律按座位号升序——
 * "谁还没交"是公开信息，"谁先交的"不是，返回顺序不能把后者漏出去。
 */
export function getAwaitingPlayerIds(state: GameState): PlayerId[] {
  switch (state.phase) {
    // 等 START_GAME / NEXT，没有玩家动作
    case "SETUP":
    case "MISSION_RESULT":
    case "GAME_OVER":
      return [];

    case "ROLE_REVEAL": {
      const done = new Set(state.pending.acknowledged);
      return state.players.filter((p) => !done.has(p.id)).map((p) => p.id);
    }

    case "TEAM_BUILDING":
      return [state.currentLeaderId];

    case "PROPOSAL_DISCUSSION":
    case "REVIEW_DISCUSSION": {
      const speaker = currentSpeakerId(state);
      return speaker === undefined ? [] : [speaker];
    }

    // 变体 forcePassOnLastAttempt 触发时状态机根本不会停在 TEAM_VOTE
    // （进入该阶段时就直接以 forced 记一条通过的提议），所以这里不必特判
    case "TEAM_VOTE":
      return state.players
        .filter((p) => !(p.id in state.pending.votes))
        .map((p) => p.id);

    case "MISSION_EXECUTION": {
      const team = new Set(requireProposedTeam(state));
      const done = new Set(state.pending.cards.map((c) => c.playerId));
      return state.players
        .filter((p) => team.has(p.id) && !done.has(p.id))
        .map((p) => p.id);
    }

    case "ASSASSINATION":
      return [getAssassinationStage(state).playerId];
  }
}

/**
 * 无行动人的系统动作，供调度循环在 `getAwaitingPlayerIds` 为空时推进。
 *
 * 单独一个函数，是因为 `getLegalActions` 按玩家问，而这两个动作不属于任何玩家。
 * 把 NEXT 硬编码在调用方，"哪些阶段在等系统"就会分散到每个调用方各写一遍。
 */
export function getSystemActions(state: GameState): GameAction[] {
  switch (state.phase) {
    case "SETUP":
      return [{ type: "START_GAME" }];
    case "MISSION_RESULT":
      return [{ type: "NEXT" }];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// 合法动作
// ---------------------------------------------------------------------------

/**
 * 队伍构成的约束。
 *
 * `getLegalActions` 不穷举组队方案：10 人局第 4 轮有 C(10,5)=252 种，
 * 塞进 prompt 既烧 token 又没用。AI 层拿这个约束自己填 team，
 * 填出来的照样要过 `assertLegal`——枚举只是便利，校验才是闸门。
 */
export interface TeamConstraint {
  teamSize: number;
  /** 全体玩家。队长可以选自己，也可以不选（rules.md §4.1、§5.1） */
  candidateIds: PlayerId[];
}

export function getTeamConstraint(state: GameState): TeamConstraint {
  return {
    teamSize: getCurrentMission(state).teamSize,
    candidateIds: state.players.map((p) => p.id),
  };
}

/**
 * 组队的"模板"动作：队长 + 座位号最小的若干人，凑够 teamSize 后按升序排列。
 *
 * 刻意给一支**合法**的队伍而不是空数组：本文件第 1 条不变量要求
 * `getLegalActions` 的每一项都能通过 `assertLegal`。调用方几乎总会用
 * `getTeamConstraint` 自己选人，这只是个不会炸的兜底默认值。
 *
 * `statement` 与 `SPEAK` 的 `content` 一样给空串模板：文本由 AI 或人类填，
 * 引擎不校验内容，只校验"轮没轮到你"。
 */
function proposalTemplate(state: GameState, leaderId: PlayerId): GameAction {
  const { teamSize, candidateIds } = getTeamConstraint(state);
  const team = [leaderId, ...candidateIds.filter((id) => id !== leaderId)]
    .slice(0, teamSize)
    .sort((a, b) => a - b);
  if (team.length !== teamSize) {
    // 配置层保证 teamSize <= playerCount，凑不齐即为引擎 bug
    throw new EngineError(
      `凑不出 ${teamSize} 人的队伍，本局只有 ${candidateIds.length} 人`,
      "INTERNAL",
      { teamSize, playerCount: candidateIds.length },
    );
  }
  return { type: "PROPOSE_TEAM", playerId: leaderId, team, statement: "" };
}

/**
 * 某玩家此刻可以做什么。不该他行动时返回 `[]`。
 *
 * 自由文本动作（SPEAK / ASSASSIN_OPINION）给的是 content 为空串的模板：
 * 内容由 AI 或人类填，引擎不校验文本本身，只校验"轮没轮到你"。
 */
export function getLegalActions(
  state: GameState,
  playerId: PlayerId,
): GameAction[] {
  const actor = findSeat(state, playerId);
  if (!actor) {
    // 调用方是引擎内部循环与 UI，座位号来自 state.players，取不到即为 bug。
    // 与 assertLegal 的区别在这里：那边的座位号来自外部输入，按 NOT_YOUR_TURN 处理
    throw new EngineError(`座位 ${playerId} 不存在`, "INTERNAL", {
      playerId,
      playerCount: state.players.length,
    });
  }

  if (!getAwaitingPlayerIds(state).includes(playerId)) return [];

  switch (state.phase) {
    case "ROLE_REVEAL":
      return [{ type: "ACKNOWLEDGE", playerId }];

    case "TEAM_BUILDING":
      return [proposalTemplate(state, playerId)];

    case "PROPOSAL_DISCUSSION":
    case "REVIEW_DISCUSSION":
      return [{ type: "SPEAK", playerId, content: "" }];

    case "TEAM_VOTE":
      return [
        { type: "CAST_VOTE", playerId, approve: true },
        { type: "CAST_VOTE", playerId, approve: false },
      ];

    // 整个项目最要紧的一个分支：好人的列表里没有 success: false。
    // reduce 里的 GOOD_CANNOT_FAIL 是第二道保险，不是这一道的替代品
    case "MISSION_EXECUTION":
      return isEvil(actor)
        ? [
            { type: "CAST_MISSION_CARD", playerId, success: true },
            { type: "CAST_MISSION_CARD", playerId, success: false },
          ]
        : [{ type: "CAST_MISSION_CARD", playerId, success: true }];

    case "ASSASSINATION": {
      if (getAssassinationStage(state).kind === "OPINION") {
        return [{ type: "ASSASSIN_OPINION", playerId, content: "" }];
      }
      // 目标可以是任何人，含坏人队友和刺客自己
      //（rules.md §4.5 明确允许，就是为了避免"没有合法目标"的死循环）
      return state.players.map((p) => ({
        type: "ASSASSINATE",
        playerId,
        targetId: p.id,
      }));
    }

    // 等系统推进的阶段走不到这里，上面的 awaiting 判空已经返回了
    case "SETUP":
    case "MISSION_RESULT":
    case "GAME_OVER":
      return [];
  }
}

// ---------------------------------------------------------------------------
// 校验
// ---------------------------------------------------------------------------

/**
 * 非法动作直接抛 EngineError，不静默忽略。
 *
 * 校验顺序有讲究，它决定了调用方看到哪个错误码：
 * 阶段 → 座位存在 → 重复提交 → 轮没轮到 → 载荷。
 * "已经投过票的人又投一次"必须报 DUPLICATE_SUBMISSION 而不是 NOT_YOUR_TURN——
 * 他确实不在 awaiting 里，但那个诊断会把排查方向带偏。
 */
export function assertLegal(state: GameState, action: GameAction): void {
  if (!PHASE_ACTIONS[state.phase].has(action.type)) {
    throw new EngineError(
      `${state.phase} 阶段不接受 ${action.type}`,
      "ILLEGAL_PHASE",
      { phase: state.phase, action: action.type },
    );
  }

  // 系统动作没有行动人，阶段对了就算合法
  if (action.type === "START_GAME" || action.type === "NEXT") return;

  const actor = findSeat(state, action.playerId);
  if (!actor) {
    // 座位号来自外部输入（AI 输出、UI 事件），不是引擎内部不变量被打破
    throw new EngineError(`座位 ${action.playerId} 不存在`, "NOT_YOUR_TURN", {
      playerId: action.playerId,
      playerCount: state.players.length,
    });
  }

  assertIsActor(state, actor, action.type);
  assertPayload(state, actor, action);
}

/** 重复提交与"没轮到你"。累积型阶段先判重复，诊断才准 */
function assertIsActor(state: GameState, actor: Player, type: ActionType): void {
  const duplicate = (what: string): never => {
    throw new EngineError(
      `座位 ${actor.id} 已经${what}过了`,
      "DUPLICATE_SUBMISSION",
      { playerId: actor.id, phase: state.phase },
    );
  };

  switch (state.phase) {
    case "ROLE_REVEAL":
      if (state.pending.acknowledged.includes(actor.id)) duplicate("确认身份");
      break;

    case "TEAM_VOTE":
      if (actor.id in state.pending.votes) duplicate("投票");
      break;

    case "MISSION_EXECUTION":
      if (!requireProposedTeam(state).includes(actor.id)) {
        throw new EngineError(
          `座位 ${actor.id} 不在本次任务队伍里`,
          "NOT_YOUR_TURN",
          { playerId: actor.id, team: state.proposedTeam },
        );
      }
      if (state.pending.cards.some((c) => c.playerId === actor.id)) {
        duplicate("提交任务票");
      }
      break;

    case "ASSASSINATION":
      if (
        type === "ASSASSIN_OPINION" &&
        state.pending.assassinOpinions.some((o) => o.playerId === actor.id)
      ) {
        duplicate("发表推测");
      }
      // 刺客本人也是要发言的坏人之一。他若在推测阶段就直接开刀，
      // awaiting 里正好有他，只靠下面那道检查会放过去，必须在这里单独拦一次
      if (
        type === "ASSASSINATE" &&
        getAssassinationStage(state).kind !== "STRIKE"
      ) {
        throw new EngineError("尚有坏人未发表推测，还不能刺杀", "NOT_YOUR_TURN", {
          playerId: actor.id,
        });
      }
      break;

    case "SETUP":
    case "TEAM_BUILDING":
    case "PROPOSAL_DISCUSSION":
    case "REVIEW_DISCUSSION":
    case "MISSION_RESULT":
    case "GAME_OVER":
      break;
  }

  const awaiting = getAwaitingPlayerIds(state);
  if (!awaiting.includes(actor.id)) {
    throw new EngineError(
      `${state.phase} 阶段还轮不到座位 ${actor.id}`,
      "NOT_YOUR_TURN",
      { playerId: actor.id, phase: state.phase, awaiting },
    );
  }
}

/** 动作自身的载荷校验。发言内容不校验——那是策略问题，不是合法性问题 */
function assertPayload(
  state: GameState,
  actor: Player,
  action: GameAction,
): void {
  switch (action.type) {
    case "PROPOSE_TEAM":
      // 只校验队伍，**不校验 statement**：那段选人说明是自由文本，
      // 与 SPEAK 的 content 同类——空话、废话、假话都是策略问题，不是合法性问题
      assertTeam(state, action.team);
      break;

    case "CAST_MISSION_CARD":
      // rules.md §4.3：好人在引擎层面被禁止投失败，这不是提示是硬约束。
      // getLegalActions 根本不给这个选项，这里是第二道保险
      if (!action.success && !isEvil(actor)) {
        throw new EngineError(
          `座位 ${actor.id} 是好人，不能投失败票`,
          "GOOD_CANNOT_FAIL",
          { playerId: actor.id, role: actor.role },
        );
      }
      break;

    case "ASSASSINATE":
      // 指自己或指坏人队友都合法（rules.md §4.5），只拦不存在的座位号
      if (!findSeat(state, action.targetId)) {
        throw new EngineError(
          `刺杀目标 ${action.targetId} 不是合法座位号`,
          "INVALID_TARGET",
          { targetId: action.targetId, playerCount: state.players.length },
        );
      }
      break;

    case "ACKNOWLEDGE":
    case "SPEAK":
    case "CAST_VOTE":
    case "ASSASSIN_OPINION":
    case "START_GAME":
    case "NEXT":
      break;
  }
}

/** 人数正确、座位存在、无重复。三条都报 INVALID_TEAM，只是 message 不同 */
function assertTeam(state: GameState, team: readonly PlayerId[]): void {
  const { teamSize } = getCurrentMission(state);
  if (team.length !== teamSize) {
    throw new EngineError(
      `第 ${state.missionIndex + 1} 轮任务需要 ${teamSize} 人，收到 ${team.length} 人`,
      "INVALID_TEAM",
      { expected: teamSize, received: team.length, team: [...team] },
    );
  }
  const seen = new Set<PlayerId>();
  for (const id of team) {
    if (!findSeat(state, id)) {
      throw new EngineError(`队伍里的座位 ${id} 不存在`, "INVALID_TEAM", {
        playerId: id,
        team: [...team],
      });
    }
    if (seen.has(id)) {
      throw new EngineError(`队伍里的座位 ${id} 重复`, "INVALID_TEAM", {
        playerId: id,
        team: [...team],
      });
    }
    seen.add(id);
  }
}
