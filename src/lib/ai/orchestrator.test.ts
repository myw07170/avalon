import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createConfig } from "../game/config";
import { ROLE_TEAM } from "../game/types";
import { assertLegal, getLegalActions } from "../game/legal";
import { createRng } from "../game/rng";
import { createGame, makePlaceholderPersonas } from "../game/setup";
import {
  EngineError,
  type AiClient,
  type AiDecisionKind,
  type AiDecisionPayload,
  type AiDecisionRequest,
  type AiDecisionResult,
  type GameAction,
  type GameState,
  type PlayerId,
  type PlayerView,
  type RngFn,
} from "../game/types";
import { createMockAiClient } from "./mock";
import {
  decisionKindOf,
  resolveAiClient,
  runGame,
  toGameAction,
  type DecisionRecord,
  type HumanTurn,
} from "./orchestrator";

// ---------------------------------------------------------------------------
// 夹具
// ---------------------------------------------------------------------------

function newGame(playerCount: number, seed: number, humanSeat: PlayerId | null = null): GameState {
  return createGame({
    config: createConfig(playerCount, { seed }),
    humanSeat,
    personas: makePlaceholderPersonas(playerCount),
    rng: createRng(seed),
  });
}

/** 记录每次 decide 收到的请求，动作本身交给 mock 生成 */
function spyClient(rng: RngFn): { client: AiClient; seen: Array<AiDecisionRequest<AiDecisionKind>> } {
  const mock = createMockAiClient(rng);
  const seen: Array<AiDecisionRequest<AiDecisionKind>> = [];
  return {
    seen,
    client: {
      decide<K extends AiDecisionKind>(req: AiDecisionRequest<K>): Promise<AiDecisionResult<K>> {
        seen.push(req);
        return mock.decide(req);
      },
    },
  };
}

// ---------------------------------------------------------------------------

describe("动作与决策种类的互译", () => {
  it("五种候选动作各自对应一种决策", () => {
    const pairs: Array<[GameAction, AiDecisionKind]> = [
      [{ type: "PROPOSE_TEAM", playerId: 0, team: [0, 1], statement: "带这几个" }, "TEAM_PROPOSAL"],
      [{ type: "SPEAK", playerId: 0, content: "" }, "SPEECH"],
      [{ type: "CAST_VOTE", playerId: 0, approve: true }, "VOTE"],
      [{ type: "CAST_MISSION_CARD", playerId: 0, success: true }, "MISSION_CARD"],
      [{ type: "ASSASSINATE", playerId: 0, targetId: 1 }, "ASSASSINATION"],
    ];
    for (const [action, kind] of pairs) {
      expect(decisionKindOf(action), action.type).toBe(kind);
    }
  });

  it("查看身份不需要问模型", () => {
    expect(decisionKindOf({ type: "ACKNOWLEDGE", playerId: 0 })).toBeNull();
  });

  it("系统动作也不问模型", () => {
    expect(decisionKindOf({ type: "START_GAME" })).toBeNull();
    expect(decisionKindOf({ type: "NEXT" })).toBeNull();
  });

  it("payload 能翻回原来的动作", () => {
    const cases: Array<[AiDecisionKind, AiDecisionPayload[AiDecisionKind], GameAction]> = [
      [
        "TEAM_PROPOSAL",
        { reasoning: "", team: [1, 2], statement: "带这俩" },
        // statement 也要翻过来：它是队长的公开选人说明，引擎会把它记成一条发言
        { type: "PROPOSE_TEAM", playerId: 3, team: [1, 2], statement: "带这俩" },
      ],
      [
        "SPEECH",
        { reasoning: "", content: "我觉得 1 号有问题" },
        { type: "SPEAK", playerId: 3, content: "我觉得 1 号有问题" },
      ],
      ["VOTE", { reasoning: "", approve: false }, { type: "CAST_VOTE", playerId: 3, approve: false }],
      [
        "MISSION_CARD",
        { reasoning: "", success: true },
        { type: "CAST_MISSION_CARD", playerId: 3, success: true },
      ],
      [
        "ASSASSINATION",
        { reasoning: "", targetId: 4 },
        { type: "ASSASSINATE", playerId: 3, targetId: 4 },
      ],
    ];
    for (const [kind, payload, expected] of cases) {
      expect(toGameAction(kind, 3, payload), kind).toEqual(expected);
    }
  });

  it("翻译不了的决策种类要抛，不能悄悄返回一个空动作", () => {
    // 将来给 AiDecisionKind 加了成员却忘了在 toGameAction 里翻译，
    // 会在这里炸而不是在半局中间产出一个畸形动作
    const unknown = "SING_A_SONG" as AiDecisionKind;
    expect(() => toGameAction(unknown, 0, { reasoning: "", approve: true })).toThrow(
      EngineError,
    );
  });
});

describe("并发与串行", () => {
  it("同时行动的阶段：每个请求都基于同一个状态快照", async () => {
    const rng = createRng(3);
    const { client, seen } = spyClient(rng);
    await runGame({ state: newGame(6, 3), client, rng });

    // 投票阶段但凡有人先落地，后面的人就会看到 progress.submitted 变成 1。
    // 恒为 0 才说明这一批是"同时"决策的——这正是"看不到别人投了什么"的语义
    const votes = seen.filter((req) => req.kind === "VOTE");
    expect(votes.length).toBeGreaterThan(0);
    for (const req of votes) {
      expect(req.view.progress.submitted).toBe(0);
      expect(req.view.selfSubmitted).toBe(false);
    }

    const cards = seen.filter((req) => req.kind === "MISSION_CARD");
    expect(cards.length).toBeGreaterThan(0);
    for (const req of cards) {
      expect(req.view.progress.submitted).toBe(0);
    }
  });

  it("逐人发言的阶段：后发言的人看得到前面说过的话", async () => {
    const rng = createRng(4);
    const { client, seen } = spyClient(rng);
    await runGame({ state: newGame(5, 4), client, rng });

    const speeches = seen.filter((req) => req.kind === "SPEECH");
    expect(speeches.length).toBeGreaterThan(5);
    // 同一轮讨论里发言数只增不减；串行错了会出现一堆长度相同的请求
    const lengths = speeches.map((req) => req.view.speeches.length);
    expect(new Set(lengths).size).toBeGreaterThan(1);
    expect(Math.max(...lengths)).toBeGreaterThan(Math.min(...lengths));
  });

  it("整局跑到 GAME_OVER，且好人一张失败票都没有", async () => {
    const rng = createRng(7);
    const final = await runGame({ state: newGame(7, 7), client: createMockAiClient(rng), rng });

    expect(final.phase).toBe("GAME_OVER");
    const evil = new Set(
      final.players
        .filter((p) => ["MORGANA", "ASSASSIN", "MORDRED", "OBERON", "MINION"].includes(p.role))
        .map((p) => p.id),
    );
    for (const mission of final.missionHistory) {
      for (const card of mission.cards) {
        if (!card.success) expect(evil.has(card.playerId)).toBe(true);
      }
    }
  });
});

describe("人类玩家", () => {
  it("只在轮到人类时调用回调，且回调给的动作真的被应用", async () => {
    const rng = createRng(9);
    const state = newGame(5, 9, 2);
    const turns: HumanTurn[] = [];

    const final = await runGame({
      state,
      client: createMockAiClient(rng),
      rng,
      onHumanAction: async (turn) => {
        turns.push(turn);
        // 永远选候选列表里的最后一项。全 AI 时 mock 是随机挑的，
        // 固定挑法能让"这一步确实来自人类"在结果里看得出来
        const last = turn.legalActions[turn.legalActions.length - 1];
        if (!last) throw new Error("没有合法动作");
        if (last.type === "SPEAK") {
          return { ...last, content: "【人类】我先听听" };
        }
        // 人类当队长时也要填选人说明——模板给的是空串，
        // 而那段话会作为他在提议讨论里的发言公开出去
        if (last.type === "PROPOSE_TEAM") {
          return { ...last, statement: "【人类】我先听听" };
        }
        return last;
      },
    });

    expect(final.phase).toBe("GAME_OVER");
    expect(turns.length).toBeGreaterThan(0);
    // 回调只为 2 号而来
    for (const turn of turns) expect(turn.view.selfId).toBe(2);
    // 人类说过的话原样进了发言流（含他当队长时的选人说明）
    const humanSpeeches = final.speeches.filter((s) => s.playerId === 2);
    for (const speech of humanSpeeches) expect(speech.content).toBe("【人类】我先听听");
    expect(humanSpeeches.length).toBeGreaterThan(0);
  });

  it("有人类座位却不给回调 → 抛，不替他做决定", async () => {
    const rng = createRng(9);
    await expect(
      runGame({ state: newGame(5, 9, 2), client: createMockAiClient(rng), rng }),
    ).rejects.toMatchObject({ name: "EngineError", code: "INTERNAL" });
  });

  it("人类的动作不进 DecisionRecord", async () => {
    const rng = createRng(11);
    const records: DecisionRecord[] = [];
    await runGame({
      state: newGame(5, 11, 2),
      client: createMockAiClient(rng),
      rng,
      onHumanAction: async (turn) => {
        const first = turn.legalActions[0];
        if (!first) throw new Error("没有合法动作");
        return first;
      },
      hooks: { onDecision: (record) => void records.push(record) },
    });

    // 那份记录是给复盘面板看 AI 心证的，人类没有心证可看
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) expect(record.playerId).not.toBe(2);
  });
});

describe("钩子", () => {
  it("onDecision 与 onState 交替出现，且都被 await", async () => {
    const rng = createRng(13);
    const order: string[] = [];

    await runGame({
      state: newGame(5, 13),
      client: createMockAiClient(rng),
      rng,
      hooks: {
        // 返回 promise：不 await 的话下面这条断言里会出现乱序
        onDecision: async (record) => {
          order.push(`decide:${record.playerId}`);
          await Promise.resolve();
          order.push(`decide-done:${record.playerId}`);
        },
        onState: async () => {
          order.push("state");
          await Promise.resolve();
          order.push("state-done");
        },
      },
    });

    expect(order.length).toBeGreaterThan(10);
    // 每个 decide 后面紧跟它自己的 done —— 这是阶段 5 打字机效果的前提
    for (const [i, entry] of order.entries()) {
      if (entry.startsWith("decide:")) {
        expect(order[i + 1]).toBe(entry.replace("decide:", "decide-done:"));
      }
      if (entry === "state") expect(order[i + 1]).toBe("state-done");
    }
  });

  it("每次 reduce 之后都给了 onState", async () => {
    const rng = createRng(17);
    const states: GameState[] = [];
    const final = await runGame({
      state: newGame(5, 17),
      client: createMockAiClient(rng),
      rng,
      hooks: { onState: (s) => void states.push(s) },
    });

    expect(states.length).toBeGreaterThan(20);
    expect(states[states.length - 1]).toEqual(final);
    // 每个中间状态都是新对象，没人把引擎状态原地改了
    expect(new Set(states).size).toBe(states.length);
  });
});

describe("最后一道合法性闸", () => {
  /** 组队时永远返回一支非法队伍（座位重复且人数不对），其余交给 mock */
  function illegalTeamClient(rng: RngFn): AiClient {
    const mock = createMockAiClient(rng);
    return {
      async decide<K extends AiDecisionKind>(
        req: AiDecisionRequest<K>,
      ): Promise<AiDecisionResult<K>> {
        if (req.kind !== "TEAM_PROPOSAL") return mock.decide(req);
        return {
          // 形状完全合法，zod 拦不住；但 assertLegal 一定拒绝
          payload: { reasoning: "我要重复选人", team: [0, 0, 0], statement: "就他仨" } as AiDecisionPayload[K],
          fallback: false,
          debug: { prompt: "", raw: "", attempts: 1 },
        };
      },
    };
  }

  it("形状合法但规则非法的动作被换掉，整局照样跑完", async () => {
    const rng = createRng(21);
    const records: DecisionRecord[] = [];

    const final = await runGame({
      state: newGame(6, 21),
      client: illegalTeamClient(rng),
      rng,
      hooks: { onDecision: (record) => void records.push(record) },
    });

    expect(final.phase).toBe("GAME_OVER");

    const proposals = records.filter((r) => r.kind === "TEAM_PROPOSAL");
    expect(proposals.length).toBeGreaterThan(0);
    for (const record of proposals) {
      expect(record.rescued).toBe(true);
      // 实际提交的是一支合法队伍
      expect(record.action).toMatchObject({ type: "PROPOSE_TEAM" });
      const team = record.action.type === "PROPOSE_TEAM" ? record.action.team : [];
      expect(new Set(team).size).toBe(team.length);
      // 模型原本想干什么仍然留在记录里——复盘时要看的就是这个
      expect(record.result.payload).toMatchObject({ team: [0, 0, 0] });
    }
  });

  it("合法的动作不会被标记 rescued", async () => {
    const rng = createRng(23);
    const records: DecisionRecord[] = [];
    await runGame({
      state: newGame(5, 23),
      client: createMockAiClient(rng),
      rng,
      hooks: { onDecision: (record) => void records.push(record) },
    });

    expect(records.length).toBeGreaterThan(0);
    expect(records.every((r) => !r.rescued)).toBe(true);
  });

  it("换出来的动作在当时的状态下确实合法", async () => {
    // 「整局跑完了」只能说明没炸，说明不了每一步都合法——中途换出一个非法动作，
    // 只要它恰好被后面的流程绕开就照样跑得完。这里逐条对当时的状态验一遍
    const rng = createRng(21);
    let current = newGame(6, 21);
    let rescuedSeen = 0;

    await runGame({
      state: current,
      client: illegalTeamClient(rng),
      rng,
      hooks: {
        onDecision: (record) => {
          if (record.rescued) rescuedSeen += 1;
          expect(() => assertLegal(current, record.action)).not.toThrow();
        },
        onState: (state) => {
          current = state;
        },
      },
    });

    expect(rescuedSeen).toBeGreaterThan(0);
  });
});

describe("中途退出", () => {
  it("abort 之后立刻停下，不再调用 client", async () => {
    const rng = createRng(29);
    const controller = new AbortController();
    let calls = 0;
    const mock = createMockAiClient(rng);
    const client: AiClient = {
      decide<K extends AiDecisionKind>(req: AiDecisionRequest<K>): Promise<AiDecisionResult<K>> {
        calls += 1;
        if (calls === 5) controller.abort();
        return mock.decide(req);
      },
    };

    await expect(
      runGame({ state: newGame(5, 29), client, rng, signal: controller.signal }),
    ).rejects.toThrow();

    const afterAbort = calls;
    await new Promise((resolve) => setTimeout(resolve, 0));
    // 玩家关掉页面后循环还在烧 token，是真会花钱的
    expect(calls).toBe(afterAbort);
  });
});

describe("client 的选择", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("默认（未设置）用 mock，一次网络都不发", async () => {
    vi.stubEnv("NEXT_PUBLIC_AI_MODE", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const rng = createRng(31);
    const state = newGame(5, 31);
    const client = resolveAiClient(rng);
    const legalActions = getLegalActions(
      // 推进到有决策可做的阶段：直接构造一个 VOTE 请求最省事
      state,
      state.players[0]?.id ?? 0,
    );
    expect(legalActions).toEqual([]); // SETUP 阶段没人可动，下面用整局验

    const final = await runGame({ state, client, rng });
    expect(final.phase).toBe("GAME_OVER");
    // 默认走 mock 是刻意的：不会因为忘了配开关就悄悄开始花钱
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("显式写 mock 也一样", async () => {
    vi.stubEnv("NEXT_PUBLIC_AI_MODE", "mock");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const rng = createRng(33);
    await runGame({ state: newGame(5, 33), client: resolveAiClient(rng), rng });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("设成 remote 时会去请求 /api/ai", async () => {
    vi.stubEnv("NEXT_PUBLIC_AI_MODE", "remote");
    const urls: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      urls.push(url);
      return Promise.resolve(
        Response.json({
          payload: { reasoning: "", approve: true },
          fallback: false,
        }),
      );
    });

    const rng = createRng(35);
    const client = resolveAiClient(rng);
    const view = { selfId: 0 } as PlayerView;
    await client.decide({
      kind: "VOTE",
      view,
      persona: { name: "P0", traits: [], speechStyle: "" },
      legalActions: [{ type: "CAST_VOTE", playerId: 0, approve: true }],
      locale: "zh",
      maxRetries: 2,
    });

    expect(urls).toEqual(["/api/ai"]);
  });
});

describe("边界", () => {
  /**
   * AI 层只认 PlayerView。
   *
   * 【类型已经拦住了，为什么还要一条源码断言】SpectatorView.selfId 是字面量 null，
   * 传进 AiDecisionRequest 是编译错误——这确实是主防线。但把某个参数放宽成
   * AnyView "先让它编过去"是一次极小的改动，而它会把观战的全场身份直接接到 prompt 上，
   * 出问题的样子是"AI 推理准得反常但不报错"。所以这里再钝钝地钉一次：
   * **AI 层的任何一个文件里都不该出现这个类型名。**
   */
  it.each(["orchestrator.ts", "prompt.ts", "client.ts", "remote.ts", "perspective.ts"])(
    "%s 不认识 SpectatorView",
    (name) => {
      const source = readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
      expect(source).not.toContain("SpectatorView");
      expect(source).not.toContain("AnyView");
    },
  );

  it("不 import client.ts —— 那是服务端的东西", () => {
    const source = readFileSync(new URL("./orchestrator.ts", import.meta.url), "utf8");
    expect(source).not.toContain("./client");
    // 服务端专用的环境变量（LLM_API_KEY / LLM_PROVIDER…）一个都不该出现。
    // 只查 import 不够：直接读 env 同样是把服务端配置搬进了浏览器
    expect(source).not.toMatch(/process\.env\.LLM_/);
  });

  it("mock 造出来的动作全都过得了 assertLegal", async () => {
    // orchestrator 的兜底完全依赖这条性质。它在 mock.test.ts 里是间接成立的，
    // 这里直接钉一次：兜底动作非法的话，rescue 只会把崩溃推迟一行
    const rng = createRng(37);
    const records: DecisionRecord[] = [];
    let last = newGame(6, 37);
    await runGame({
      state: last,
      client: createMockAiClient(rng),
      rng,
      hooks: {
        onDecision: (record) => {
          expect(() => assertLegal(last, record.action)).not.toThrow();
          records.push(record);
        },
        onState: (state) => {
          last = state;
        },
      },
    });
    expect(records.length).toBeGreaterThan(0);
  });
});

describe("只有一个合法动作时不问模型", () => {
  /** 5 人局跑到底，把每次任务票的座位、阵营、是否问过模型收齐 */
  async function missionCards(seed: number) {
    const rng = createRng(seed);
    const { client, seen } = spyClient(rng);
    const records: DecisionRecord[] = [];
    const final = await runGame({
      state: newGame(5, seed),
      client,
      rng,
      hooks: { onDecision: (r) => void records.push(r) },
    });
    const evil = new Set(
      final.players.filter((p) => ROLE_TEAM[p.role] === "EVIL").map((p) => p.id),
    );
    return {
      evil,
      asked: seen.filter((r) => r.kind === "MISSION_CARD").map((r) => r.view.selfId),
      cards: records.filter((r) => r.kind === "MISSION_CARD"),
    };
  }

  it("好人的任务票一次都不问模型，坏人的照问", async () => {
    const { evil, asked, cards } = await missionCards(7);

    // 好人上过车（否则这条什么都没证明）
    const good = cards.filter((r) => !evil.has(r.playerId));
    expect(good.length).toBeGreaterThan(0);

    for (const r of good) {
      expect(r.auto, `好人座位 ${r.playerId}`).toBe(true);
    }
    // 问过模型的那些，一个好人都没有
    for (const id of asked) {
      expect(evil.has(id), `座位 ${id} 是好人，不该被问`).toBe(true);
    }
  });

  it("自动决策交上去的就是唯一那个合法动作，且照样进复盘记录", async () => {
    const { cards } = await missionCards(7);
    for (const r of cards.filter((r) => r.auto)) {
      expect(r.action).toEqual({
        type: "CAST_MISSION_CARD",
        playerId: r.playerId,
        success: true,
      });
      // 没问模型 → 没有 prompt 也没有原文，但记录本身不能缺
      expect(r.result.debug).toBeUndefined();
      expect(r.result.fallback).toBe(false);
      expect(r.rescued).toBe(false);
      expect(r.latencyMs).toBe(0);
    }
  });

  it("模板动作绝不走这条捷径——发言与组队的候选长度恒为 1", async () => {
    const rng = createRng(11);
    const { client, seen } = spyClient(rng);
    const records: DecisionRecord[] = [];
    await runGame({
      state: newGame(5, 11),
      client,
      rng,
      hooks: { onDecision: (r) => void records.push(r) },
    });

    const templates: AiDecisionKind[] = ["SPEECH", "TEAM_PROPOSAL"];
    for (const kind of templates) {
      const mine = records.filter((r) => r.kind === kind);
      expect(mine.length, kind).toBeGreaterThan(0);
      for (const r of mine) expect(r.auto, `${kind} 座位 ${r.playerId}`).toBe(false);
      // 每一条都真的问过模型
      expect(seen.filter((r) => r.kind === kind)).toHaveLength(mine.length);
    }
  });

  it("投票有两个候选，永远要问模型", async () => {
    const rng = createRng(3);
    const { client, seen } = spyClient(rng);
    const records: DecisionRecord[] = [];
    await runGame({
      state: newGame(5, 3),
      client,
      rng,
      hooks: { onDecision: (r) => void records.push(r) },
    });
    const votes = records.filter((r) => r.kind === "VOTE");
    expect(votes.length).toBeGreaterThan(0);
    for (const r of votes) expect(r.auto).toBe(false);
    expect(seen.filter((r) => r.kind === "VOTE")).toHaveLength(votes.length);
  });

  it("人类玩家不走这条捷径——面板要把「为什么只有一个按钮」解释给他看", async () => {
    const rng = createRng(7);
    const turns: HumanTurn[] = [];
    await runGame({
      state: newGame(5, 7, 0),
      client: createMockAiClient(rng),
      rng,
      onHumanAction: async (turn) => {
        turns.push(turn);
        return turn.legalActions[0]!;
      },
    });
    // 发言模板只有一个合法动作，但人类仍应拿到表单自己填写内容。
    expect(turns.some((t) => t.kind === "SPEECH" && t.legalActions.length === 1)).toBe(true);
  });
});
