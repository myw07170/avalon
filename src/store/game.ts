"use client";

/**
 * Jotai atoms + 驱动层。React 世界与引擎/AI 层的唯一接缝。
 *
 * 【组件只能读 myViewAtom】gameStateAtom 是全知视角，任何组件读它都视为 bug。
 * 终局复盘面板也不例外——它读的是 view.reveal，那是引擎批准公开的部分。
 *
 * 【"use client" 不是形式】它把本文件钉在客户端边界上：
 * Server Component 误 import 这里的 atom 会在构建期就炸，而不是在运行时
 * 悄悄把全知状态渲染进 HTML。
 *
 * 本文件私有三样东西，各自堵着一类 bug，**不要导出**：
 * - `decisionsAtom`   AI 心证，对局中读到就是泄漏（见 reviewDecisionsAtom）
 * - `pendingTurnAtom` 带着 promise 的 resolve，组件拿到就能绕过校验直接放行
 * - `abortAtom`       中止句柄，组件不该有能力单方面掐断循环
 */
import { atom } from "jotai";
import {
  EngineError,
  createGame,
  createRng,
  makePlaceholderPersonas,
  toPlayerView,
  type AiClient,
  type AiDecisionKind,
  type GameAction,
  type GameConfig,
  type GameState,
  type Persona,
  type PlayerId,
  type PlayerView,
  type RngFn,
  type ActionProblem,
  type EngineErrorCode,
  type TeamConstraint,
} from "@/lib/game";
import { localeAtom } from "@/i18n/locale-atom";
import { MESSAGES, type Messages } from "@/i18n/messages";
import { AiError, type AiErrorCode } from "@/lib/ai/errors";
import { createMockAiClient } from "@/lib/ai/mock";
import {
  runGame,
  type DecisionRecord,
  type HumanTurn,
} from "@/lib/ai/orchestrator";
import { createRemoteAiClient } from "@/lib/ai/remote";

// ---------------------------------------------------------------------------
// 全知状态与视角
// ---------------------------------------------------------------------------

/** 全知状态。只有本文件的驱动层能写，组件一律不读 */
export const gameStateAtom = atom<GameState | null>(null);

/** 人类玩家的座位号，null 表示全 AI 观战局 */
export const mySeatAtom = atom<PlayerId | null>(null);

/**
 * 组件的唯一数据源。
 *
 * 两个来源任一为空都给 null——`toPlayerView` 对不存在的座位会抛 INTERNAL，
 * 判空是必须的，不是防御性编程。
 *
 * 观战局（mySeatAtom 为 null）在这里也是 null。**不要退化成读 gameStateAtom**：
 * 观战需要一份"全公开但仍不含隐藏信息"的独立投影，那是阶段 6 的事。
 *
 * 【刻意不上 selectAtom 切片】每次 gameStateAtom 写入都会重算出一个全新的
 * PlayerView（toPlayerView 逐字段抄写、不做 memo），所有订阅者跟着重渲染。
 * 但写入节奏被下面的 paceMsAtom 卡在几百毫秒一次，组件也就十来个，
 * 这点开销可以忽略。真测出掉帧再切片，现在加就是没有消费者的死代码。
 */
export const myViewAtom = atom<PlayerView | null>((get) => {
  const state = get(gameStateAtom);
  const seat = get(mySeatAtom);
  if (!state || seat === null) return null;
  return toPlayerView(state, seat);
});

// ---------------------------------------------------------------------------
// 运行状态
// ---------------------------------------------------------------------------

/**
 * "ready" 是刻意存在的一档：建局之后、循环启动之前。
 *
 * 引擎在 SETUP 阶段就已经发完牌，此时 toPlayerView 能给出 selfRole 和 knowledge，
 * 所以 RoleCard 的翻牌动效要在这一档里演。**必须有这一档**：orchestrator 对
 * ACKNOWLEDGE 不走 onHumanAction（decisionKindOf 返回 null 时直接落地），
 * 循环一旦起跑，ROLE_REVEAL 会被瞬间跳过，翻牌动效根本没有停留时间。
 */
export type RunStatus = "idle" | "ready" | "running" | "finished" | "error";

export const runStatusAtom = atom<RunStatus>("idle");

/**
 * 按 code 取出对应的文案函数再喂给它。
 *
 * 【这个断言是 TS 的已知限制，不是偷懒】`msg.actionProblem[p.code]` 与 `p` 是
 * 一对**相关联合**：键从 p.code 取，形状必然对得上，但 TS 不会把这两件事
 * 联系起来，只会把索引出的函数类型求交集，得到 never。
 * 把断言收在这一个函数里，目录那边每一条仍然是各自收窄过的强类型。
 */
function renderActionProblem(msg: Messages, problem: ActionProblem): string {
  const render = msg.actionProblem[problem.code] as (p: ActionProblem) => string;
  return render(problem);
}

/**
 * 错误的**来源**，不是错误的**文字**。【不导出】——组件只该拿到 errorAtom。
 *
 * 【为什么多这一层】错误文案要跟着语言走。存一句拼好的话，切语言时那句话
 * 就冻在原语言上了；存来源，errorAtom 派生的时候现拼，切语言当场跟着变。
 *
 * 三支的分界是"谁该看见它"：
 * - action：玩家误点。核心玩家文案，必须翻。
 * - engine：引擎不变量被破坏（"跑了 5000 步还没结束"）。那是 bug 诊断，
 *   任何语言的玩家都读不懂也不该读到——按 code 给一句人话，原文只进 console。
 * - ai：模型层出了问题（没配 key、上游 429）。同上，运维细节进 console，
 *   玩家看到的是"该做什么"那一句。
 * - raw：其余未知异常。已经是给人看的一句话了，原样透出。
 */
type ErrorSource =
  | { kind: "action"; problem: ActionProblem }
  | { kind: "engine"; code: EngineErrorCode }
  | { kind: "ai"; code: AiErrorCode }
  | { kind: "raw"; text: string };

const errorSourceAtom = atom<ErrorSource | null>(null);

/**
 * 给玩家看的一句话错误。非法提交与循环崩溃都落在这里。
 *
 * 【派生而不是可写】项目里没有 Jotai Provider（用的默认 store），所以这里
 * 直接 get(localeAtom) 就行，组件那一层一个字都不用改：它仍然是 string | null。
 */
export const errorAtom = atom<string | null>((get) => {
  const src = get(errorSourceAtom);
  if (!src) return null;

  const msg = MESSAGES[get(localeAtom)];
  switch (src.kind) {
    case "action":
      return renderActionProblem(msg, src.problem);
    case "engine":
      // code 仍然拼在后面：出问题时那串大写字母是唯一能拿去搜代码的东西
      return `${msg.engineError[src.code]}（${src.code}）`;
    case "ai":
      return `${msg.aiError[src.code]}（${src.code}）`;
    case "raw":
      return src.text;
  }
});

/**
 * 人设生成的打点，由 SetupScreen 在建局时写入。
 *
 * 【不是错误，但必须让人看见】rules.md §6：生成失败可以回退占位人设，
 * 但**绝不能静默**——悄悄回退会让你对着一桌说话雷同的 AI 找半天 prompt 的毛病。
 * 所以它单独一个 atom，而不是塞进 errorAtom（那会让开局看起来像出了故障）。
 */
export const personaNotesAtom = atom<readonly string[]>([]);

// ---------------------------------------------------------------------------
// 私有：AI 心证、人类动作桥、中止句柄
// ---------------------------------------------------------------------------

const EMPTY_DECISIONS: readonly DecisionRecord[] = Object.freeze([]);

/**
 * 【重大泄漏源，不导出】record.result.payload.reasoning 是 AI 的私密心证
 * （"我是莫甘娜，所以要保这个人"）。对局进行中任何组件读到它都等于开天眼。
 * 复盘面板走 reviewDecisionsAtom。
 */
const decisionsAtom = atom<DecisionRecord[]>([]);

interface PendingTurn {
  turn: HumanTurn;
  resolve: (action: GameAction) => void;
}

/** 【不导出】resolve 是绕过 validateHumanAction 的后门 */
const pendingTurnAtom = atom<PendingTurn | null>(null);

/** 【不导出】中止只经由 resetGameAtom */
const abortAtom = atom<AbortController | null>(null);

/**
 * 建局时创建，起跑时复用。同一个实例贯穿发牌与决策，是确定性重放的前提。
 *
 * 存的是函数，所以写入时必须包一层（`set(rngAtom, () => rng)`），
 * 否则 jotai 会把它当成 updater 调用掉。
 */
const rngAtom = atom<RngFn | null>(null);

// ---------------------------------------------------------------------------
// 派生：组件的全部入口
// ---------------------------------------------------------------------------

/**
 * 轮到人类时的一手信息。
 *
 * `legalActions` 由引擎在正确时机算出（getLegalActions 要 GameState，组件读不到），
 * orchestrator 顺手把它和 view 一起递了过来。ActionPanel 直接读这里，全程不碰全知状态。
 */
export const humanTurnAtom = atom<HumanTurn | null>(
  (get) => get(pendingTurnAtom)?.turn ?? null,
);

export const isMyTurnAtom = atom<boolean>((get) => get(pendingTurnAtom) !== null);

/**
 * 现在是谁在等模型。没人在等时为 null。
 *
 * 【为什么必须有】AI 在想的时候界面一动不动，于是"15 秒"和"3 分钟"长得一模一样，
 * 玩家分不清是慢还是卡死。这是唯一能在对局中当场看出某次调用出问题的手段。
 *
 * 只含座位号与决策种类，**不含任何 payload**——那是 AI 心证，对局中读到就是开天眼。
 */
export interface Thinking {
  playerId: PlayerId;
  kind: AiDecisionKind;
  /** Date.now()。组件自己按 1 秒一跳算已等了多久 */
  startedAt: number;
}

export const thinkingAtom = atom<Thinking | null>(null);

/** 终局复盘的公开面。非 GAME_OVER 恒为 null */
export const revealAtom = atom<PlayerView["reveal"]>(
  (get) => get(myViewAtom)?.reveal ?? null,
);

/**
 * 组队时的选人约束。
 *
 * 【为什么不调 getTeamConstraint】那个函数要 GameState。而它的两个字段在
 * PlayerView 里都有对应的公开投影——teamSize 就是 currentMission.teamSize，
 * candidateIds 就是全体座位（rules.md §4.1：队长可以选自己，也可以不选）。
 * 从 view 重推一遍，组件这条线上就不存在任何一处能摸到全知状态。
 *
 * TEAM_BUILDING 的 legalActions 只给一个模板动作（legal.ts 刻意不穷举
 * C(10,5)=252 种），所以选人界面必须靠这个约束自己拼 team。
 */
export const teamConstraintAtom = atom<TeamConstraint | null>((get) => {
  const view = get(myViewAtom);
  if (!view) return null;
  return {
    teamSize: view.currentMission.teamSize,
    candidateIds: view.players.map((p) => p.id),
  };
});

/**
 * 复盘面板的 AI reasoning 回放。
 *
 * 终局之前恒为空数组——闸门在这里，不是靠组件自觉。判据用 view.reveal 而不是
 * phase，因为 reveal 才是引擎明确批准公开的那一刻。
 */
export const reviewDecisionsAtom = atom<readonly DecisionRecord[]>((get) => {
  if (get(myViewAtom)?.reveal == null) return EMPTY_DECISIONS;
  return get(decisionsAtom);
});

// ---------------------------------------------------------------------------
// 设置：mock 开关与节奏
// ---------------------------------------------------------------------------

export type AiMode = "mock" | "remote";

/**
 * 【必须写成字面量】Next 只在构建时替换 `process.env.NEXT_PUBLIC_XXX` 这种写法，
 * 先解构或用变量做下标都不会被内联。理由同 orchestrator.resolveAiClient。
 *
 * 这里重复了一次那个判断而没有复用 `resolveAiClient`：那个函数只认环境变量，
 * 给不出 SetupScreen 需要的"用户手动切换"入口，而它的函数体被 orchestrator.test.ts
 * 的源码断言钉着，为一个 UI 开关去改不划算。两边的底线一致——**默认 mock**，
 * 不会因为忘了配开关就悄悄开始花钱。
 */
export const DEFAULT_AI_MODE: AiMode =
  process.env.NEXT_PUBLIC_AI_MODE === "remote" ? "remote" : "mock";

/** SetupScreen 的 mock 开关。在点「开始」之前改都有效 */
export const aiModeAtom = atom<AiMode>(DEFAULT_AI_MODE);

/** 发言之间的基准停顿。设 0 全速跑（测试与「快进」用） */
export const DEFAULT_PACE_MS = 800;

export const paceMsAtom = atom(DEFAULT_PACE_MS);

/**
 * 按决策种类缩放停顿。
 *
 * 不能一律 800ms：组队投票和任务票是并发阶段，orchestrator 拿到一批结果后
 * 会**逐个** await onDecision（见 orchestrator.ts 主循环）。10 人局逐个停 800ms
 * 就是 8 秒空白，而那一屏本来就该唰地一下全亮。
 * 有话说的决策才值得等，投票只需要一点点错落感。
 */
const PACE_WEIGHT: Record<AiDecisionKind, number> = {
  TEAM_PROPOSAL: 1,
  SPEECH: 1,
  ASSASSIN_OPINION: 1,
  ASSASSINATION: 1.5,
  VOTE: 0.15,
  MISSION_CARD: 0.15,
};

/**
 * 这一手还该停多久。
 *
 * 【要减掉模型真正花掉的时间】那段停顿的用意是"AI 在想"的观感；模型已经真想了
 * 15 秒，再停 800ms 就是纯粹的浪费。mock 模式下 latencyMs 近似为 0，停顿照旧，
 * 所以观感和以前完全一样——变的只有真实模型那条路。
 */
function paceOf(base: number, kind: AiDecisionKind, latencyMs: number): number {
  return Math.max(0, Math.round(base * PACE_WEIGHT[kind]) - latencyMs);
}

// ---------------------------------------------------------------------------
// 内部工具
// ---------------------------------------------------------------------------

/**
 * 可中止的等待。中止时 **resolve 而非 reject**：
 * 循环的终止由 runGame 自己的 signal.throwIfAborted 负责，
 * 这里跟着抛只会多出一条没人接的拒绝。
 */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

/**
 * 给 client 包一层，把"谁在等模型"写进 thinkingAtom。
 *
 * 包在 store 这一层而不是改 AiClient 接口：那个接口是 mock 与真实实现的共同契约，
 * 不该为一个界面指示器变形。mock 也照包——它快到看不见，但少一条分支就少一处会分叉的地方。
 *
 * finally 里清空：抛错时若不清，界面会永远停在"3 号在想…"。
 */
function withThinking(client: AiClient, set: ThinkingSetter): AiClient {
  return {
    async decide(req) {
      set(thinkingAtom, {
        playerId: req.view.selfId,
        kind: req.kind,
        startedAt: Date.now(),
      });
      try {
        return await client.decide(req);
      } finally {
        set(thinkingAtom, null);
      }
    },
  };
}

/** 只用得上写 thinkingAtom 这一种能力，不把整个 setter 的宽签名拖进来 */
type ThinkingSetter = (atom: typeof thinkingAtom, value: Thinking | null) => void;

/**
 * 把一个异常归到某一支来源上。
 *
 * 【EngineError 的原文只进 console】它是拿引擎内部状态拼出来的诊断
 * （"视角里没有自己的座位 99"），翻译它既没意义也没人读得懂。玩家看到的是
 * 按 code 写的一句人话，而排查问题的人在控制台里拿得到全部上下文。
 */
function sourceOfError(error: unknown): ErrorSource {
  if (error instanceof EngineError) {
    console.error("[store] 引擎异常：", error.code, error.message, error.context);
    return { kind: "engine", code: error.code };
  }
  if (error instanceof AiError) {
    // message 是运维信息（哪个环境变量、上游哪个状态码），玩家看不懂也帮不上忙
    console.error("[store] 模型层异常：", error.code, error.message, error.context);
    return { kind: "ai", code: error.code };
  }
  return { kind: "raw", text: error instanceof Error ? error.message : String(error) };
}

/**
 * 提交前的轻量校验。返回 null 表示放行，否则返回给玩家看的原因。
 *
 * 【这不是重复引擎规则，是防止一次误点打死整局】reduce 里的 assertLegal
 * 抛 EngineError 会让 runGame 整个 reject——玩家多勾了一个人，一局就报废了。
 * 在这里拦下来只是拒绝提交，循环仍挂在同一步等下一次点击。
 *
 * 能穷举的动作（投票、任务票、刺杀）直接跟 legalActions 比对；
 * 模板动作（组队、发言）只能校验载荷形状，因为 legalActions 里那份是占位模板。
 */
function validateHumanAction(turn: HumanTurn, action: GameAction): ActionProblem | null {
  const { view, legalActions } = turn;
  const allowed = legalActions.map((a) => a.type);

  if (!allowed.includes(action.type)) {
    return { code: "WRONG_ACTION", got: action.type, allowed };
  }
  if (action.type === "START_GAME" || action.type === "NEXT") {
    // 系统动作不属于任何玩家，只由驱动循环推进
    return { code: "SYSTEM_ACTION", got: action.type };
  }
  if (action.playerId !== view.selfId) {
    return { code: "NOT_YOUR_SEAT", seat: action.playerId };
  }

  switch (action.type) {
    case "PROPOSE_TEAM": {
      const { teamSize } = view.currentMission;
      if (action.team.length !== teamSize) {
        return { code: "TEAM_SIZE", need: teamSize, got: action.team.length };
      }
      if (new Set(action.team).size !== action.team.length) {
        return { code: "TEAM_DUPLICATE" };
      }
      const seats = new Set(view.players.map((p) => p.id));
      const stranger = action.team.find((id) => !seats.has(id));
      if (stranger !== undefined) return { code: "SEAT_MISSING", seat: stranger };
      return null;
    }

    case "CAST_VOTE": {
      const ok = legalActions.some(
        (a) => a.type === "CAST_VOTE" && a.approve === action.approve,
      );
      return ok ? null : { code: "VOTE_NOT_OFFERED" };
    }

    // 好人的 legalActions 里没有 success: false（legal.ts 那条最要紧的分支）。
    // 放行的话 reduce 会抛 GOOD_CANNOT_FAIL，整局跟着炸
    case "CAST_MISSION_CARD": {
      const ok = legalActions.some(
        (a) => a.type === "CAST_MISSION_CARD" && a.success === action.success,
      );
      return ok ? null : { code: "GOOD_CANNOT_FAIL" };
    }

    case "ASSASSINATE": {
      const ok = legalActions.some(
        (a) => a.type === "ASSASSINATE" && a.targetId === action.targetId,
      );
      return ok ? null : { code: "BAD_TARGET", seat: action.targetId };
    }

    // 自由文本：引擎不校验内容，只校验轮没轮到你，上面已经查过了
    case "SPEAK":
    case "ASSASSIN_OPINION":
    case "ACKNOWLEDGE":
      return null;
  }
}

// ---------------------------------------------------------------------------
// 人类动作提交
// ---------------------------------------------------------------------------

/**
 * 把玩家的选择交给挂起中的驱动循环。
 *
 * 静默返回（而不是报错）有两种情形：没轮到你、以及同一步被点了第二次——
 * 后者是真会发生的，promise 已经 resolve，再放行一次就多推进了一步。
 */
export const submitActionAtom = atom(null, (get, set, action: GameAction) => {
  const pending = get(pendingTurnAtom);
  if (!pending) return;

  const problem = validateHumanAction(pending.turn, action);
  if (problem) {
    // 不 resolve：循环继续挂在这一步，玩家改一改再点
    set(errorSourceAtom, { kind: "action", problem });
    return;
  }

  set(errorSourceAtom, null);
  // 先清面板再放行。反过来的话，runGame 会在 UI 还显示着上一轮操作面板时继续推进
  set(pendingTurnAtom, null);
  pending.resolve(action);
});

// ---------------------------------------------------------------------------
// 开局：建局 -> 看身份 -> 起跑
// ---------------------------------------------------------------------------

export interface CreateGameInput {
  config: GameConfig;
  /** null 表示全 AI 观战局 */
  humanSeat: PlayerId | null;
  /** 缺省时用占位人设。真人设走 /api/personas，由 SetupScreen 取好了传进来 */
  personas?: Persona[];
  /** 人设生成的打点。回退到占位时必须让玩家看见，见 personaNotesAtom */
  personaNotes?: string[];
}

/**
 * 建局，停在 SETUP。
 *
 * 同步函数，因为 createGame 本身是纯的。异步的只有人设生成，那一步在调用方。
 */
export const createGameAtom = atom(null, (_get, set, input: CreateGameInput) => {
  set(resetGameAtom);

  const { config, humanSeat } = input;
  const rng = createRng(config.seed);
  const aiSeatCount =
    humanSeat === null ? config.playerCount : config.playerCount - 1;
  const personas = input.personas ?? makePlaceholderPersonas(aiSeatCount);

  try {
    const state = createGame({ config, humanSeat, personas, rng });
    set(gameStateAtom, state);
    set(mySeatAtom, humanSeat);
    set(personaNotesAtom, input.personaNotes ?? []);
    set(rngAtom, () => rng);
    set(runStatusAtom, "ready");
  } catch (error) {
    // 配置非法（CONFIG_INVALID）在这里落地，不让异常穿透到 React 事件处理器
    set(errorSourceAtom, sourceOfError(error));
    set(runStatusAtom, "error");
  }
});

/**
 * 起跑，一路跑到 GAME_OVER。
 *
 * 返回的 promise 在终局、出错或中止时结算。调用方不必等它。
 */
export const runGameAtom = atom(null, async (get, set) => {
  // 【统一闸门】React 19 的 StrictMode 会把 effect 跑两遍，玩家也会连点。
  // 只有 "ready" 能起跑，且下面立刻改成 "running"，第二次调用在这里就被挡回去
  if (get(runStatusAtom) !== "ready") return;

  const state = get(gameStateAtom);
  const rng = get(rngAtom);
  if (!state || !rng) {
    set(errorSourceAtom, { kind: "action", problem: { code: "NO_GAME" } });
    set(runStatusAtom, "error");
    return;
  }

  const controller = new AbortController();
  const { signal } = controller;
  set(abortAtom, controller);
  set(runStatusAtom, "running");

  // signal 必须传下去：不传的话「重开」只是让循环下一步不再开始，
  // 在途的那次请求仍在跑，服务端也仍在向 provider 要结果（见 remote.ts 的说明）
  const client: AiClient = withThinking(
    get(aiModeAtom) === "remote"
      ? createRemoteAiClient({ signal })
      : createMockAiClient(rng),
    set,
  );

  const onHumanAction = (turn: HumanTurn) =>
    new Promise<GameAction>((resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      // 【必须挂 abort】不挂的话，玩家点「重开」时这个 promise 永远不结算：
      // runGame 不 unwind、finally 不执行、监听器和控制器一起泄漏
      const onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
      set(pendingTurnAtom, {
        turn,
        resolve: (action) => {
          signal.removeEventListener("abort", onAbort);
          resolve(action);
        },
      });
    });

  try {
    const final = await runGame({
      state,
      client,
      rng,
      onHumanAction,
      signal,
      // 【开局取一次，之后不跟着界面变】玩家中途切语言，UI 立刻变，
      // 但 AI 仍然说开局那种语言——一份 transcript 不该说到一半换语言
      locale: get(localeAtom),
      hooks: {
        onState: (next) => {
          set(gameStateAtom, next);
        },
        // orchestrator 会 await 这个 promise（有测试钉住），节奏控制就落在这里。
        // 顺序是 onDecision -> reduce -> onState，所以停顿发生在这条发言出现【之前】，
        // 观感正好是"AI 在想"，而不是"发完了卡一下"
        onDecision: async (record) => {
          set(decisionsAtom, (prev) => [...prev, record]);
          await sleep(paceOf(get(paceMsAtom), record.kind, record.latencyMs), signal);
        },
      },
    });
    set(gameStateAtom, final);
    set(runStatusAtom, "finished");
  } catch (error) {
    // 主动中止不是错误，不该在界面上弹红字。状态已由 resetGameAtom 归位
    if (signal.aborted) return;
    set(errorSourceAtom, sourceOfError(error));
    set(runStatusAtom, "error");
  } finally {
    // 只清理自己那一局。中途 reset 再开新局时，这段跑得比新局晚，
    // 不加这道判断会把新局的 pendingTurn 一起抹掉
    if (get(abortAtom) === controller) {
      set(abortAtom, null);
      set(pendingTurnAtom, null);
      set(thinkingAtom, null);
    }
  }
});

/** 回到开局前。跑着的循环会被中止，挂起的人类动作会被拒绝 */
export const resetGameAtom = atom(null, (get, set) => {
  get(abortAtom)?.abort();
  set(abortAtom, null);
  set(gameStateAtom, null);
  set(mySeatAtom, null);
  set(pendingTurnAtom, null);
  set(decisionsAtom, []);
  set(thinkingAtom, null);
  set(personaNotesAtom, []);
  set(rngAtom, null);
  set(runStatusAtom, "idle");
  set(errorSourceAtom, null);
});
