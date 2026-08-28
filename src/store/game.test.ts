/**
 * store 的驱动层测试。
 *
 * 不需要 jsdom 也不需要 testing-library：atoms 本身与 React 无关，
 * `createStore()` 就能在 node 里把整条链路跑起来。组件测试是后面的事。
 */
import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import { zh } from "@/i18n/messages.zh";
import { createConfig } from "@/lib/game/config";
import { createRng } from "@/lib/game/rng";
import { createGame, makePlaceholderPersonas } from "@/lib/game/setup";
import { describeTurn } from "@/components/action-panel-model";
import { describeGameOver } from "@/components/game-over-model";
import type { GameAction, PlayerId } from "@/lib/game/types";
import type { HumanTurn } from "@/lib/ai/orchestrator";
import {
  aiModeAtom,
  createGameAtom,
  errorAtom,
  gameStateAtom,
  humanTurnAtom,
  isMyTurnAtom,
  myViewAtom,
  mySeatAtom,
  paceMsAtom,
  resetGameAtom,
  revealAtom,
  reviewDecisionsAtom,
  runGameAtom,
  runStatusAtom,
  submitActionAtom,
  teamConstraintAtom,
} from "./game";

// ---------------------------------------------------------------------------
// 夹具
// ---------------------------------------------------------------------------

type Store = ReturnType<typeof createStore>;

const SEAT: PlayerId = 0;

/** 一个开好局、停在 "ready" 的 store。mock + 零节奏，跑得完且确定 */
function newStore(playerCount = 5, seed = 42, humanSeat: PlayerId | null = SEAT): Store {
  const store = createStore();
  store.set(aiModeAtom, "mock");
  store.set(paceMsAtom, 0);
  store.set(createGameAtom, {
    config: createConfig(playerCount, { seed }),
    humanSeat,
  });
  return store;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * 上限只是防止某天 store 改坏后整个测试套件挂死。
 * 正常一局的宏任务数约等于人类回合数，离这个数很远。
 */
const MAX_TICKS = 5000;

/** 第一个合法动作。组队那一项是 legal.ts 给的模板队伍，本身就合法 */
function firstLegal(turn: HumanTurn): GameAction {
  const action = turn.legalActions[0];
  if (!action) throw new Error(`轮到人类却没有合法动作：${turn.kind}`);
  return action;
}

/**
 * 自动替人类点「第一个合法动作」，直到循环结算，或撞上 pauseWhen。
 *
 * 撞上时返回那个 HumanTurn 并且**不提交**——循环仍挂在那一步，
 * 测试可以在此检查中途状态，之后再调一次 drive 继续跑完。
 */
async function drive(
  store: Store,
  run: Promise<unknown>,
  pauseWhen: (turn: HumanTurn) => boolean = () => false,
  choose: (turn: HumanTurn) => GameAction = firstLegal,
): Promise<HumanTurn | null> {
  let settled = false;
  const done = () => {
    settled = true;
  };
  run.then(done, done);

  for (let i = 0; i < MAX_TICKS && !settled; i += 1) {
    const turn = store.get(humanTurnAtom);
    if (turn) {
      if (pauseWhen(turn)) return turn;
      store.set(submitActionAtom, choose(turn));
    }
    await tick();
  }

  if (!settled) throw new Error("驱动循环没有在预期步数内结算");
  await run;
  return null;
}

// ---------------------------------------------------------------------------

describe("myViewAtom", () => {
  it("状态或座位缺一个就给 null，不抛错", () => {
    const store = createStore();
    expect(store.get(myViewAtom)).toBeNull();

    store.set(mySeatAtom, 0);
    expect(store.get(myViewAtom)).toBeNull();
  });

  it("全 AI 观战局没有视角", () => {
    const store = newStore(5, 42, null);
    expect(store.get(gameStateAtom)).not.toBeNull();
    expect(store.get(myViewAtom)).toBeNull();
  });
});

describe("建局", () => {
  it("停在 ready，且此时身份与 knowledge 已可读", () => {
    const store = newStore();

    expect(store.get(runStatusAtom)).toBe("ready");
    expect(store.get(errorAtom)).toBeNull();

    const view = store.get(myViewAtom);
    expect(view).not.toBeNull();
    // RoleCard 的翻牌动效就靠这一档：SETUP 阶段身份已经发完
    expect(view?.phase).toBe("SETUP");
    expect(view?.selfId).toBe(SEAT);
    expect(view?.selfRole).toBeTruthy();
    expect(Array.isArray(view?.knowledge)).toBe(true);
  });

  it("组队约束从 view 推出来，不需要 GameState", () => {
    const store = newStore(7);
    const constraint = store.get(teamConstraintAtom);
    expect(constraint).toEqual({
      teamSize: store.get(myViewAtom)?.currentMission.teamSize,
      candidateIds: [0, 1, 2, 3, 4, 5, 6],
    });
  });

  it("配置非法落在 errorAtom，不向外抛", () => {
    const store = createStore();
    expect(() =>
      store.set(createGameAtom, {
        config: createConfig(5, { seed: 1 }),
        humanSeat: 99,
      }),
    ).not.toThrow();

    expect(store.get(runStatusAtom)).toBe("error");
    expect(store.get(errorAtom)).toContain("CONFIG_INVALID");
    expect(store.get(gameStateAtom)).toBeNull();
  });
});

describe("跑完整一局", () => {
  it("人类一路点第一个合法动作，能跑到终局", async () => {
    const store = newStore();
    await drive(store, store.set(runGameAtom));

    expect(store.get(runStatusAtom)).toBe("finished");
    expect(store.get(errorAtom)).toBeNull();
    expect(store.get(myViewAtom)?.phase).toBe("GAME_OVER");

    const reveal = store.get(revealAtom);
    expect(reveal).not.toBeNull();
    expect(Object.keys(reveal?.roles ?? {})).toHaveLength(5);

    // 循环结算后不该再有挂起的操作面板
    expect(store.get(isMyTurnAtom)).toBe(false);
    expect(store.get(humanTurnAtom)).toBeNull();
  });

  it("终局后再点开始不会重跑", async () => {
    const store = newStore();
    await drive(store, store.set(runGameAtom));

    const final = store.get(gameStateAtom);
    await store.set(runGameAtom);

    expect(store.get(runStatusAtom)).toBe("finished");
    expect(store.get(gameStateAtom)).toBe(final);
  });
});

/**
 * 阶段 5 完成标准第一条：**人类以梅林身份完整玩完一局，含刺杀阶段**。
 *
 * 【和上面那条的区别】上面那条只证明"能给引擎喂合法动作"。这一条锁死了三件事：
 * 人类是梅林（信息最多、最容易被泄漏坑到的角色）、对局真的走到了刺杀、
 * 而且**出牌一律经由 describeTurn 拼出的表单**——也就是"只会点面板的玩家"能打完，
 * 而不是"能直接调引擎 API 的人"能打完。
 *
 * 这也是全项目唯一一条把 store → orchestrator → 引擎 → 操作面板 → 复盘面板
 * 串起来跑的端到端。
 */
describe("以梅林身份完整玩完一局", () => {
  /** 面板拼出来的动作。每一手都走 describeTurn，认不出的形状直接失败 */
  function fromPanel(turn: HumanTurn): GameAction {
    const form = describeTurn(turn, zh);
    if (!form) throw new Error(`面板认不出这一手：${turn.kind}`);

    switch (form.kind) {
      // 模板动作：type 与 playerId 沿用引擎给的模板，界面只填内容
      case "TEAM_PROPOSAL":
        return {
          ...form.template,
          // 面板按座位号升序提交，不保留点击顺序
          team: form.candidates.slice(0, form.teamSize).map((c) => c.id).sort((a, b) => a - b),
          statement: "就带这几个人",
        };
      case "SPEECH":
      case "ASSASSIN_OPINION":
        return { ...form.template, content: "我先听听大家怎么说" };

      // 能穷举的动作：一律原样取用 legalActions 里那几个，面板不自己拼
      case "VOTE":
      case "MISSION_CARD":
        return required(form.options[0]?.action, form.kind);
      case "ASSASSINATION":
        return required(form.targets[0]?.action, form.kind);
    }
  }

  function required(action: GameAction | undefined, kind: string): GameAction {
    if (!action) throw new Error(`${kind} 的面板一个候选都没给`);
    return action;
  }

  /**
   * 找一颗"0 号是梅林"的种子。
   *
   * 发牌是纯函数，所以这一步不跑对局，很便宜；真正贵的是后面那一局。
   * 走不走得到刺杀要跑完才知道，所以外层还要再筛一次。
   */
  function merlinSeeds(limit: number): number[] {
    const found: number[] = [];
    for (let seed = 0; found.length < limit && seed < 500; seed += 1) {
      const state = createGame({
        config: createConfig(5, { seed }),
        humanSeat: SEAT,
        personas: makePlaceholderPersonas(4),
        rng: createRng(seed),
      });
      if (state.players[SEAT]?.role === "MERLIN") found.push(seed);
    }
    return found;
  }

  it("走到刺杀、看到结果，全程只用操作面板给的选项", async () => {
    let played: { store: Store; seed: number } | null = null;

    // 好人要先集齐 3 分才会触发刺杀，随机策略下不是每局都到得了，所以要多试几颗
    for (const seed of merlinSeeds(30)) {
      const store = newStore(5, seed);
      await drive(store, store.set(runGameAtom), () => false, fromPanel);

      const reason = store.get(gameStateAtom)?.winReason;
      if (reason === "ASSASSINATION_HIT" || reason === "ASSASSINATION_MISS") {
        played = { store, seed };
        break;
      }
    }
    if (!played) throw new Error("30 颗梅林种子里没有一局走到刺杀，夹具要加种子");

    const { store } = played;
    const view = store.get(myViewAtom);

    // 1. 对局正常收尾
    expect(store.get(runStatusAtom)).toBe("finished");
    expect(store.get(errorAtom)).toBeNull();
    expect(view?.selfRole).toBe("MERLIN");

    // 2. 全程都轮到过人类，而且面板每一手都认得出（fromPanel 认不出就已经抛了）
    expect(store.get(humanTurnAtom)).toBeNull();

    // 3. 终局公开面到位
    const reveal = store.get(revealAtom);
    expect(reveal?.assassination).not.toBeNull();

    // 4. 复盘面板画得出这一刀，而且梅林那一行指向人类座位
    const brief = describeGameOver(view, store.get(reviewDecisionsAtom), zh);
    expect(brief?.strike).not.toBeNull();
    expect(brief?.strike?.merlinLabel).toContain(`${SEAT} 号`);
    expect(brief?.strike?.headline).toMatch(/刺中|刺空/);
    // 梅林是好人，胜负与好人阵营一致
    expect(brief?.youWon).toBe(reveal?.winner === "GOOD");
  });
});

describe("reviewDecisionsAtom 的泄漏闸", () => {
  it("对局进行中恒为空，终局后才有 AI 心证", async () => {
    const store = newStore();
    const run = store.set(runGameAtom);

    // 停在一个已经有 AI 发过言的回合——说明决策确实攒下了，只是拿不到
    const paused = await drive(store, run, (turn) => turn.view.speeches.length > 0);
    expect(paused).not.toBeNull();
    expect(store.get(runStatusAtom)).toBe("running");
    expect(store.get(myViewAtom)?.reveal).toBeNull();
    expect(store.get(reviewDecisionsAtom)).toEqual([]);

    await drive(store, run);

    expect(store.get(revealAtom)).not.toBeNull();
    expect(store.get(reviewDecisionsAtom).length).toBeGreaterThan(0);
  });
});

describe("人类动作提交", () => {
  it("同一步点两次只推进一步", async () => {
    const store = newStore();
    const run = store.set(runGameAtom);

    const paused = await drive(store, run, () => true);
    expect(paused).not.toBeNull();

    const action = firstLegal(paused!);
    store.set(submitActionAtom, action);
    // 第二次静默返回：promise 已经 resolve，再放行一次就多走一步
    store.set(submitActionAtom, action);

    expect(store.get(humanTurnAtom)).toBeNull();
    expect(store.get(errorAtom)).toBeNull();

    await drive(store, run);
    expect(store.get(runStatusAtom)).toBe("finished");
  });

  it("没轮到自己时提交是空操作", () => {
    const store = newStore();
    expect(() =>
      store.set(submitActionAtom, { type: "SPEAK", playerId: SEAT, content: "喂" }),
    ).not.toThrow();
    expect(store.get(errorAtom)).toBeNull();
  });

  it("人数不对的组队被拦下，对局继续挂着而不是崩掉", async () => {
    const store = newStore();
    const run = store.set(runGameAtom);

    const paused = await drive(store, run, (turn) => turn.kind === "TEAM_PROPOSAL");
    expect(paused).not.toBeNull();

    const teamSize = paused!.view.currentMission.teamSize;
    store.set(submitActionAtom, {
      type: "PROPOSE_TEAM",
      playerId: SEAT,
      team: [0],
      statement: "只带我自己",
    });

    expect(store.get(errorAtom)).toContain(`需要 ${teamSize} 人`);
    // 关键：循环没死，面板还在，玩家可以改了再点
    expect(store.get(runStatusAtom)).toBe("running");
    expect(store.get(humanTurnAtom)).toBe(paused);

    await drive(store, run);
    expect(store.get(runStatusAtom)).toBe("finished");
    expect(store.get(errorAtom)).toBeNull();
  });

  it("替别人行动会被拦下", async () => {
    const store = newStore();
    const run = store.set(runGameAtom);

    const paused = await drive(store, run, () => true);
    const stolen = { ...firstLegal(paused!), playerId: 1 } as GameAction;
    store.set(submitActionAtom, stolen);

    expect(store.get(errorAtom)).toContain("不能替座位 1 行动");
    expect(store.get(humanTurnAtom)).toBe(paused);

    await drive(store, run);
  });
});

describe("中止与重开", () => {
  it("挂在人类回合时 reset，循环干净地结算", async () => {
    const store = newStore();
    const run = store.set(runGameAtom);

    const paused = await drive(store, run, () => true);
    expect(paused).not.toBeNull();

    store.set(resetGameAtom);
    // 主动中止不是错误：promise 正常 resolve，不留未处理拒绝
    await expect(run).resolves.toBeUndefined();

    expect(store.get(runStatusAtom)).toBe("idle");
    expect(store.get(gameStateAtom)).toBeNull();
    expect(store.get(mySeatAtom)).toBeNull();
    expect(store.get(humanTurnAtom)).toBeNull();
    expect(store.get(errorAtom)).toBeNull();
  });

  it("重开一局能正常跑完", async () => {
    const store = newStore();
    const run = store.set(runGameAtom);
    await drive(store, run, () => true);
    store.set(resetGameAtom);
    await run;

    store.set(createGameAtom, { config: createConfig(5, { seed: 7 }), humanSeat: SEAT });
    expect(store.get(runStatusAtom)).toBe("ready");

    await drive(store, store.set(runGameAtom));
    expect(store.get(runStatusAtom)).toBe("finished");
  });
});

describe("重入闸门", () => {
  it("StrictMode 式的连续两次起跑只跑一局", async () => {
    const store = newStore();

    const first = store.set(runGameAtom);
    const second = store.set(runGameAtom);
    // 第二次在 runStatus !== "ready" 处就返回了
    await expect(second).resolves.toBeUndefined();
    expect(store.get(runStatusAtom)).toBe("running");

    await drive(store, first);
    expect(store.get(runStatusAtom)).toBe("finished");
    expect(store.get(revealAtom)).not.toBeNull();
  });

  it("没建局就起跑会报错而不是静默卡住", async () => {
    const store = createStore();
    await store.set(runGameAtom);
    // runStatus 是 "idle"，闸门直接挡回去，不该留下半开的循环
    expect(store.get(runStatusAtom)).toBe("idle");
    expect(store.get(gameStateAtom)).toBeNull();
  });
});
