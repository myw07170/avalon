/**
 * 驱动循环：把引擎、AI 层、人类玩家接成一局完整的游戏。
 *
 * 【这是最后一道合法性闸】LLM 可能返回**形状合法但规则非法**的动作——
 * `team: [0, 0, 1]` 座位重复、人数不对、刺杀一个不存在的座位。zod 只管形状；
 * `assertLegal` 能拦，但它要 `GameState`，而 `client.ts` 只有 `PlayerView`，**它验不了**。
 * orchestrator 是第一个同时拿到状态和 AI 答案的地方，所以这道闸只能在这里补。
 * 不补的话，真实模型跑到一半会直接抛 EngineError 把整局打死。
 *
 * 【本文件跑在浏览器】所以它 import 的是 mock.ts 与 remote.ts，
 * **一行都不能 import client.ts**——那会把服务端代码和 apiKey 的读取路径拖进浏览器包。
 * orchestrator.test.ts 有一条源码断言钉住这件事。
 */
import {
  assertLegal,
  getAwaitingPlayerIds,
  getLegalActions,
  getSystemActions,
} from "../game/legal";
import { reduce } from "../game/reduce";
import { toPlayerView } from "../game/view";
import {
  EngineError,
  type ActionType,
  type AiClient,
  type AiDecisionKind,
  type AiDecisionPayload,
  type AiDecisionRequest,
  type AiDecisionResult,
  type GameAction,
  type GameState,
  type Persona,
  type Phase,
  type PlayerId,
  type PlayerView,
  type RngFn,
} from "../game/types";
import { createMockAiClient } from "./mock";
import { createRemoteAiClient } from "./remote";

/**
 * 一局的步数上限。撞上说明状态机在某处转不动了——
 * 这正是要抓的那类 bug，所以宁可抛错，也不要静静地空转。
 */
const MAX_STEPS = 5000;

const DEFAULT_MAX_RETRIES = 2;

// ---------------------------------------------------------------------------
// 动作 ↔ 决策种类
// ---------------------------------------------------------------------------

/**
 * 候选动作的类型 → 该问模型什么。
 *
 * **由动作类型反推，不由 phase 推**：刺杀阶段的两个子步骤（逐个推测 → 刺客开刀）
 * 因此自动分开，这里不必复制一遍引擎的次序规则。
 *
 * ACKNOWLEDGE 不在表里——查看身份不需要模型。系统动作（START_GAME / NEXT）
 * 也不在，它们不属于任何玩家。
 */
const ACTION_KIND: Partial<Record<ActionType, AiDecisionKind>> = {
  PROPOSE_TEAM: "TEAM_PROPOSAL",
  SPEAK: "SPEECH",
  CAST_VOTE: "VOTE",
  CAST_MISSION_CARD: "MISSION_CARD",
  ASSASSIN_OPINION: "ASSASSIN_OPINION",
  ASSASSINATE: "ASSASSINATION",
};

/**
 * legal.ts 把候选**穷举完**了的那几种决策。
 *
 * 【这张表是 autoDecision 的安全前提，不要往里加东西】另外三种是**模板动作**：
 * PROPOSE_TEAM 不穷举 C(10,5)、SPEAK / ASSASSIN_OPINION 不猜你要说什么，
 * 它们的 legalActions 长度**恒为 1**。把它们放进来，等于整局不再问模型任何问题。
 */
const ENUMERATED_KINDS: ReadonlySet<AiDecisionKind> = new Set<AiDecisionKind>([
  "VOTE",
  "MISSION_CARD",
  "ASSASSINATION",
]);

/** 没调用模型时填给复盘面板的 reasoning。面板据 record.auto 标注，不靠认这句话 */
const AUTO_REASONING = "本阵营在这一步只有一个合法动作，未调用模型";

/** 这个动作该问模型什么。返回 null 表示不需要问（目前只有 ACKNOWLEDGE） */
export function decisionKindOf(action: GameAction): AiDecisionKind | null {
  return ACTION_KIND[action.type] ?? null;
}

/**
 * 把模型的 payload 翻译成引擎能收的动作。
 *
 * 翻出来的东西**不保证合法**（zod 只管形状），调用方必须再过一遍 assertLegal。
 */
export function toGameAction<K extends AiDecisionKind>(
  kind: K,
  playerId: PlayerId,
  payload: AiDecisionPayload[K],
): GameAction {
  switch (kind) {
    case "TEAM_PROPOSAL": {
      // statement 必须一起带上：它是队长的公开选人说明，引擎会把它记成一条发言。
      // 早先这里只取 team，那段说明生成了却谁也看不见（详见 phases/teamBuilding.ts）
      const proposal = payload as AiDecisionPayload["TEAM_PROPOSAL"];
      return {
        type: "PROPOSE_TEAM",
        playerId,
        team: proposal.team,
        statement: proposal.statement,
      };
    }
    case "SPEECH":
      return { type: "SPEAK", playerId, content: (payload as AiDecisionPayload["SPEECH"]).content };
    case "VOTE":
      return { type: "CAST_VOTE", playerId, approve: (payload as AiDecisionPayload["VOTE"]).approve };
    case "MISSION_CARD":
      return {
        type: "CAST_MISSION_CARD",
        playerId,
        success: (payload as AiDecisionPayload["MISSION_CARD"]).success,
      };
    case "ASSASSIN_OPINION":
      return {
        type: "ASSASSIN_OPINION",
        playerId,
        content: (payload as AiDecisionPayload["ASSASSIN_OPINION"]).content,
      };
    case "ASSASSINATION":
      return {
        type: "ASSASSINATE",
        playerId,
        targetId: (payload as AiDecisionPayload["ASSASSINATION"]).targetId,
      };
    default:
      // AiDecisionKind 加了新成员却忘了在这里翻译，会在这里炸
      throw new EngineError(`不认识的决策种类 ${String(kind)}`, "INTERNAL", { kind });
  }
}

// ---------------------------------------------------------------------------
// 对外类型
// ---------------------------------------------------------------------------

export interface HumanTurn {
  kind: AiDecisionKind;
  view: PlayerView;
  legalActions: GameAction[];
}

export interface DecisionRecord {
  playerId: PlayerId;
  kind: AiDecisionKind;
  phase: Phase;
  missionIndex: number;
  /** 实际提交给引擎的动作 */
  action: GameAction;
  /** 模型原本想做的。rescued 为 true 时它与 action 不一致——这正是复盘要看的东西 */
  result: AiDecisionResult<AiDecisionKind>;
  /** 模型给的动作过不了 assertLegal，被换成了随机合法动作 */
  rescued: boolean;
  /**
   * 这一手没有调用模型：legal.ts 给的候选只有一个，问了也只有一个答案。
   * 与 fallback / rescued 是三件不同的事，复盘面板要分开标注。
   */
  auto: boolean;
  /**
   * client.decide 这一段的墙钟耗时（毫秒）。auto 决策恒为 0。
   *
   * 三个消费者：store 的自适应节奏（模型已经想了 15 秒就别再停 800ms）、
   * 复盘面板的耗时统计、real-game.test.ts 的打点。
   */
  latencyMs: number;
}

export interface OrchestratorHooks {
  /** 每次 reduce 之后。UI 用它更新 gameStateAtom */
  onState?: (state: GameState) => void | Promise<void>;
  /**
   * 每次 AI 决策之后，按座位序逐个调用（并发阶段也是）。
   * **返回 promise 会被 await**——阶段 5 的"AI 发言之间停 800ms"就靠这个实现，
   * 节奏控制是调用方的事，orchestrator 不管。
   */
  onDecision?: (record: DecisionRecord) => void | Promise<void>;
}

export interface RunGameOptions {
  state: GameState;
  client: AiClient;
  rng: RngFn;
  /** 轮到人类玩家时被调用。全 AI 局不用传 */
  onHumanAction?: (turn: HumanTurn) => Promise<GameAction>;
  hooks?: OrchestratorHooks;
  /** 中途退出。玩家关掉页面后循环还在烧 token，是真会花钱的 */
  signal?: AbortSignal;
  maxRetries?: number;
}

// ---------------------------------------------------------------------------
// 内部
// ---------------------------------------------------------------------------

function requirePersona(state: GameState, playerId: PlayerId): Persona {
  const persona = state.players.find((p) => p.id === playerId)?.persona;
  if (!persona) {
    throw new EngineError(`座位 ${playerId} 没有人设，无法构建决策请求`, "INTERNAL", {
      playerId,
    });
  }
  return persona;
}

function isHuman(state: GameState, playerId: PlayerId): boolean {
  return state.players.find((p) => p.id === playerId)?.isHuman === true;
}

/** 一个人的一次行动：可能不需要模型、可能来自人类、可能来自 AI */
interface Turn {
  action: GameAction;
  record: DecisionRecord | null;
}

async function takeTurn(
  state: GameState,
  playerId: PlayerId,
  options: RunGameOptions,
): Promise<Turn> {
  const legalActions = getLegalActions(state, playerId);
  const first = legalActions[0];
  if (!first) {
    // getAwaitingPlayerIds 说轮到他了，getLegalActions 却给不出动作，两者分叉了
    throw new EngineError(
      `${state.phase} 阶段轮到座位 ${playerId}，却没有任何合法动作`,
      "INTERNAL",
      { phase: state.phase, playerId },
    );
  }

  const kind = decisionKindOf(first);
  // 查看身份不需要模型，也不需要人类点确认之外的任何东西
  if (kind === null) return { action: first, record: null };

  const view = toPlayerView(state, playerId);

  if (isHuman(state, playerId)) {
    if (!options.onHumanAction) {
      throw new EngineError(
        `座位 ${playerId} 是人类玩家，但没有提供 onHumanAction`,
        "INTERNAL",
        { playerId, phase: state.phase },
      );
    }
    // 人类的动作不进 DecisionRecord：那份记录是给复盘面板看 AI 心证的
    return { action: await options.onHumanAction({ kind, view, legalActions }), record: null };
  }

  // 【只有一个答案的问题不必去问】好人在车上时 legal.ts 根本不给 success: false
  // （prompt.ts 的【输出格式】还要专门钉一句"没有第二个选择"）。这一手在真实模型上
  // 是十几秒的纯等待，而答案在候选列表里已经写死了。
  //
  // 规则判断没有搬家：仍然只由 legal.ts 说了算，这里只是数了一下候选个数。
  // 人类玩家不走这条——面板要把"为什么只有一个按钮"解释给他看（components/README.md）。
  if (ENUMERATED_KINDS.has(kind) && legalActions.length === 1) {
    return { action: first, record: autoRecord(state, playerId, kind, first) };
  }

  const request: AiDecisionRequest<AiDecisionKind> = {
    kind,
    view,
    persona: requirePersona(state, playerId),
    legalActions,
    maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
  };
  const startedAt = performance.now();
  const result = await options.client.decide(request);
  const latencyMs = Math.round(performance.now() - startedAt);

  const wanted = toGameAction(kind, playerId, result.payload);
  const { action, rescued } = await ensureLegal(state, request, wanted, options.rng);

  return {
    action,
    record: {
      playerId,
      kind,
      phase: state.phase,
      missionIndex: state.missionIndex,
      action,
      result,
      rescued,
      auto: false,
      latencyMs,
    },
  };
}

/**
 * 没问模型的那一手也要进 DecisionRecord —— 复盘面板要的是一条**连续**的事件流，
 * 中间缺一格会让人以为那个座位没投票。
 *
 * payload 由动作反推（而不是反过来），所以它与实际提交的动作天然一致，
 * 不存在"记录里写的和交上去的不是一回事"这种可能。debug 留空：没有 prompt 也没有原文。
 */
function autoRecord(
  state: GameState,
  playerId: PlayerId,
  kind: AiDecisionKind,
  action: GameAction,
): DecisionRecord {
  return {
    playerId,
    kind,
    phase: state.phase,
    missionIndex: state.missionIndex,
    action,
    result: {
      payload: autoPayload(kind, action),
      fallback: false,
    },
    rescued: false,
    auto: true,
    latencyMs: 0,
  };
}

/** 把唯一那个合法动作翻回 payload。ENUMERATED_KINDS 之外的 kind 走不到这里 */
function autoPayload(
  kind: AiDecisionKind,
  action: GameAction,
): AiDecisionPayload[AiDecisionKind] {
  if (kind === "VOTE" && action.type === "CAST_VOTE") {
    return { reasoning: AUTO_REASONING, approve: action.approve };
  }
  if (kind === "MISSION_CARD" && action.type === "CAST_MISSION_CARD") {
    return { reasoning: AUTO_REASONING, success: action.success };
  }
  if (kind === "ASSASSINATION" && action.type === "ASSASSINATE") {
    return { reasoning: AUTO_REASONING, targetId: action.targetId };
  }
  // ENUMERATED_KINDS 与 ACTION_KIND 分叉了，只可能是本文件自己的 bug
  throw new EngineError(`${kind} 不该走自动决策`, "INTERNAL", { kind, action: action.type });
}

/**
 * 最后一道闸：模型给的动作过不了 assertLegal 就换掉。
 *
 * 换成 mock 给的动作，而不是自己现选一个——理由与 client.ts 的兜底一样：
 * mock 只从 legalActions 里挑，好人的兜底票天然不会是失败票，
 * 这条引擎级硬约束不需要在这里再实现一遍。
 */
async function ensureLegal(
  state: GameState,
  request: AiDecisionRequest<AiDecisionKind>,
  wanted: GameAction,
  rng: RngFn,
): Promise<{ action: GameAction; rescued: boolean }> {
  try {
    assertLegal(state, wanted);
    return { action: wanted, rescued: false };
  } catch (error) {
    if (!(error instanceof EngineError)) throw error;
    const { payload } = await createMockAiClient(rng).decide(request);
    return { action: toGameAction(request.kind, request.view.selfId, payload), rescued: true };
  }
}

// ---------------------------------------------------------------------------
// 主循环
// ---------------------------------------------------------------------------

/**
 * 跑到 GAME_OVER 为止，返回终局状态。
 *
 * 循环只有一条路径，**不按阶段分叉**：
 * ```
 * awaiting = getAwaitingPlayerIds(state)
 *   为空   → 走系统动作（START_GAME / NEXT）
 *   非空   → 每个人并发决策，再按座位序逐个 reduce
 * ```
 * 引擎已经把"同时行动"编码在 awaiting 的长度里（讨论/组队/刺杀恒为 1，
 * 投票/任务票/查看身份才会 >1），所以这里不需要再抄一张阶段表——
 * 理由与 legal.ts 的 PHASE_ACTIONS 只写一处同源。
 *
 * 并发的那一批**全部基于同一个 state 快照**：这就是"同时投票、看不到别人投了什么"
 * 的正确语义，也是 orchestrator.test.ts 专门钉住的一条。
 */
export async function runGame(options: RunGameOptions): Promise<GameState> {
  const { rng, hooks, signal } = options;
  let state = options.state;

  for (let step = 0; state.phase !== "GAME_OVER"; step += 1) {
    signal?.throwIfAborted();

    if (step >= MAX_STEPS) {
      throw new EngineError(
        `跑了 ${MAX_STEPS} 步还没结束，停在 ${state.phase}`,
        "INTERNAL",
        { phase: state.phase, step },
      );
    }

    const awaiting = getAwaitingPlayerIds(state);

    if (awaiting.length === 0) {
      const systemAction = getSystemActions(state)[0];
      if (!systemAction) {
        throw new EngineError(
          `${state.phase} 阶段既无人可动，也没有系统动作——状态机卡住了`,
          "INTERNAL",
          { phase: state.phase },
        );
      }
      state = reduce(state, systemAction, rng);
      await hooks?.onState?.(state);
      continue;
    }

    // 并发决策。map 是同步跑完的，所以 rng 的消耗顺序就是座位序，确定性不受影响
    const snapshot = state;
    const turns = await Promise.all(
      awaiting.map((playerId) => takeTurn(snapshot, playerId, options)),
    );

    // 按座位序逐个落地。即使在并发阶段，UI 收到的也是一条有序的事件流
    for (const turn of turns) {
      if (turn.record) await hooks?.onDecision?.(turn.record);
      state = reduce(state, turn.action, rng);
      await hooks?.onState?.(state);
    }
  }

  return state;
}

// ---------------------------------------------------------------------------
// client 的选择
// ---------------------------------------------------------------------------

/**
 * 浏览器该用哪个 AiClient。
 *
 * 服务端的 `LLM_PROVIDER` 浏览器读不到，所以另有一个公开开关
 * `NEXT_PUBLIC_AI_MODE`（不含密钥，会被打进浏览器包）。
 *
 * **默认 mock 是刻意的**：不会因为忘了配开关就悄悄开始花钱。
 *
 * 【必须写成字面量】Next 只在构建时替换 `process.env.NEXT_PUBLIC_XXX` 这种写法，
 * 先解构 process.env 或用变量做下标**都不会被内联**，浏览器里拿到的会是 undefined。
 */
export function resolveAiClient(rng: RngFn): AiClient {
  return process.env.NEXT_PUBLIC_AI_MODE === "remote"
    ? createRemoteAiClient()
    : createMockAiClient(rng);
}
