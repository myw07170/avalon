/**
 * AiClient 的假实现：随机合法动作 + 模板发言。
 *
 * 先做这个再做 client.ts。它让整条调度链路能在零 token 成本下调完，
 * 开发期默认就跑它（LLM_PROVIDER=mock）。真实 client 出问题时，
 * 切回 mock 就能判断"是链路坏了还是模型坏了"。
 *
 * 【核心约定】动作一律从 req.legalActions 里挑，不自由发挥。
 * 这让 mock 与 sim/random.ts 的随机策略同源，"好人投不出失败票"这条
 * 引擎级硬约束在 AI 链路上照样成立——好人拿到的列表里根本没有 success: false。
 *
 * 唯一的例外是组队：legal.ts 刻意不穷举 C(10,5) 种组合，只给一个模板。
 * mock 于是自己从 view 里选人——注意是从 **view** 而不是从 GameState，
 * 它拿到的信息必须和真实 LLM 一模一样，否则调通了也不算调通。
 */
import { pick, shuffle } from "../game/rng";
import { PROMPT_COPY } from "./prompt-copy";
import {
  EngineError,
  type ActionType,
  type AiClient,
  type AiDecisionKind,
  type AiDecisionPayload,
  type AiDecisionRequest,
  type AiDecisionResult,
  type GameAction,
  type PlayerId,
  type PlayerView,
  type RngFn,
} from "../game/types";
import { AI_SCHEMAS } from "./schema";

/** 泛型收窄后的候选动作。写成显式谓词，不依赖 TS 对 filter 的类型推断 */
function actionsOfType<T extends ActionType>(
  actions: readonly GameAction[],
  type: T,
): Array<Extract<GameAction, { type: T }>> {
  return actions.filter(
    (action): action is Extract<GameAction, { type: T }> => action.type === type,
  );
}

/**
 * 取某一类候选动作，取不到就抛。
 *
 * kind 与 legalActions 对不上，只可能是调用方（orchestrator / UI）算错了阶段。
 * 静默兜底会把这个 bug 藏起来，等到线上才表现为"AI 在错误的时机发言"。
 */
function requireActions<T extends ActionType>(
  req: AiDecisionRequest<AiDecisionKind>,
  type: T,
): Array<Extract<GameAction, { type: T }>> {
  const candidates = actionsOfType(req.legalActions, type);
  if (candidates.length === 0) {
    throw new EngineError(
      `决策 ${req.kind} 需要 ${type} 候选动作，但 legalActions 里一个都没有`,
      "INTERNAL",
      {
        kind: req.kind,
        phase: req.view.phase,
        playerId: req.view.selfId,
        received: req.legalActions.map((a) => a.type),
      },
    );
  }
  return candidates;
}

/**
 * 模板文本。带上人设与局势，让 UI 有东西可渲染。
 *
 * 【mock 也要分语言】它是 dev 用的，但**会渲染进 SpeechFeed**——
 * 英文界面配一屏中文的 [mock] 发言，跟真实模式下 AI 说中文是同一种半成品。
 */
function mockText(req: AiDecisionRequest<AiDecisionKind>, topic: string): string {
  const { view, persona } = req;
  const c = PROMPT_COPY[req.locale];
  return c.mock.text(
    persona.name,
    c.seat(view.selfId),
    c.nth(view.missionIndex),
    topic,
    view.goodScore,
    view.evilScore,
    view.rejectCount,
  );
}

/**
 * 随机怀疑度。约定是 0-1，与 prompt 里写给模型的一致。
 * 每次都填，好让这个可选字段在阶段 6 的热力图落地之前就不是死字段。
 */
function mockSuspicions(
  view: PlayerView,
  rng: RngFn,
): Array<{ playerId: PlayerId; score: number }> {
  return view.players
    .filter((p) => p.id !== view.selfId)
    .map((p) => ({ playerId: p.id, score: Math.round(rng() * 100) / 100 }));
}

/**
 * 按 kind 造出一份未校验的载荷。
 *
 * 返回联合类型，由调用方用 AI_SCHEMAS[req.kind] 收窄回 AiDecisionPayload[K]——
 * 那一步既是运行时校验，也顺带把泛型接了回来，所以本文件没有一处类型断言。
 */
function buildPayload(
  req: AiDecisionRequest<AiDecisionKind>,
  rng: RngFn,
): AiDecisionPayload[AiDecisionKind] {
  const { view } = req;
  const mock = PROMPT_COPY[req.locale].mock;

  switch (req.kind) {
    case "TEAM_PROPOSAL": {
      // 候选动作只用来确认"确实轮到我组队"，队伍自己从 view 里选
      requireActions(req, "PROPOSE_TEAM");
      const team = shuffle(
        view.players.map((p) => p.id),
        rng,
      )
        .slice(0, view.currentMission.teamSize)
        .sort((a, b) => a - b);
      return {
        reasoning: mock.reasoningTeam(view.players.length, view.currentMission.teamSize),
        team,
        statement: mockText(req, mock.topicProposal),
      };
    }

    case "SPEECH":
      requireActions(req, "SPEAK");
      return {
        reasoning: mock.reasoningSpeech,
        content: mockText(req, mock.topicSpeech),
        suspicions: mockSuspicions(view, rng),
      };

    case "VOTE": {
      const chosen = pick(requireActions(req, "CAST_VOTE"), rng);
      return {
        reasoning: mock.reasoningVote(chosen.approve),
        approve: chosen.approve,
      };
    }

    // 整个文件最要紧的一行：候选项来自 legalActions，
    // 好人的那份里没有 success: false，mock 想投失败也投不出去
    case "MISSION_CARD": {
      const chosen = pick(requireActions(req, "CAST_MISSION_CARD"), rng);
      return {
        reasoning: mock.reasoningCard(req.legalActions.length),
        success: chosen.success,
      };
    }

    case "ASSASSINATION": {
      const chosen = pick(requireActions(req, "ASSASSINATE"), rng);
      return {
        reasoning: mock.reasoningStrike,
        targetId: chosen.targetId,
      };
    }
  }
}

/**
 * debug.prompt 的占位。
 *
 * 刻意不调用 buildPrompt——它现在还是 throw。等 prompt.ts 落地后可以换成真的，
 * 那时 mock 顺带成为 prompt 构建的冒烟测试（零 token 跑完整局）。
 */
function promptStub(req: AiDecisionRequest<AiDecisionKind>): string {
  return `[mock] kind=${req.kind} phase=${req.view.phase} seat=${req.view.selfId} legalActions=${req.legalActions.length}`;
}

/**
 * rng 从建局一路用到最后一个决策，"同 seed == 同一局"才成立。
 *
 * decide 写成 async 但体内没有 await，两件事同时成立：
 * - 抛错变成 rejection，与真实 client（网络失败）的失败形态一致，
 *   调用方不必对 mock 和真实实现写两套错误处理；
 * - 函数体依然同步执行，所以并发阶段（组队投票、任务票）的 rng 消耗顺序
 *   等于调用顺序，确定性不会被 microtask 调度打乱。
 */
export function createMockAiClient(rng: RngFn): AiClient {
  return {
    async decide<K extends AiDecisionKind>(
      req: AiDecisionRequest<K>,
    ): Promise<AiDecisionResult<K>> {
      // 自己的输出也过一遍 schema：mock 与真实 client 必须交出同一形状的东西，
      // 否则 orchestrator 在 mock 下调通了，换真实 client 又会炸
      const payload = AI_SCHEMAS[req.kind].parse(buildPayload(req, rng));
      return {
        payload,
        fallback: false,
        debug: {
          prompt: promptStub(req),
          raw: JSON.stringify(payload),
          attempts: 1,
        },
      };
    },
  };
}
