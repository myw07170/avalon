import { describe, expect, it } from "vitest";
import { zh } from "@/i18n/messages.zh";
import { createMockAiClient } from "@/lib/ai/mock";
import { decisionKindOf, runGame, type HumanTurn } from "@/lib/ai/orchestrator";
import {
  ROLE_TEAM,
  assertLegal,
  composeRoles,
  createConfig,
  createGame,
  createRng,
  getAwaitingPlayerIds,
  getLegalActions,
  makePlaceholderPersonas,
  toPlayerView,
  type GameAction,
  type GameState,
  type Role,
} from "@/lib/game";
import {
  describeTurn as describeTurnRaw,
  proposeAction,
  speakAction,
  turnKey,
  type TurnForm,
} from "./action-panel-model";

/*
 * 【这一行 shim 是刻意的】`describeX` 的第二个参数没有默认值——默认值是静默回退，
 * 会让某个漏改的调用点在英文模式下安静地渲染中文，而没有任何东西会报错。
 * 代价就是这里补一行。下面的断言仍然逐字断言中文，那才是真正在验文案。
 */
const describeTurn = (turn: HumanTurn) => describeTurnRaw(turn, zh);


// ---------------------------------------------------------------------------
// 夹具
// ---------------------------------------------------------------------------

const SEEDS = [1, 3, 7, 11, 23, 42, 99];
const EVIL: Role[] = ["MORDRED", "OBERON"];

function newGame(seed: number, humanSeat: number | null) {
  const rng = createRng(seed);
  return {
    rng,
    state: createGame({
      config: createConfig(10, { seed, roles: composeRoles(10, EVIL) }),
      humanSeat,
      personas: makePlaceholderPersonas(humanSeat === null ? 10 : 9),
      rng,
    }),
  };
}

/**
 * 一手棋：某个状态下轮到某人时，orchestrator 会递给 onHumanAction 的那份东西。
 *
 * 【测试里可以拿 GameState，面板不行】所以这里能顺手把 state 一起留着，
 * 用真正的 assertLegal 去验面板拼出来的动作——这比断言表单长什么样有力得多。
 */
interface Probe {
  /** 哪一局。同一手棋的"公开形状"在不同局里会重合，凡是按局分组的断言都要用它 */
  seed: number;
  state: GameState;
  turn: HumanTurn;
}

function probesAt(seed: number, state: GameState): Probe[] {
  const probes: Probe[] = [];
  for (const id of getAwaitingPlayerIds(state)) {
    const legalActions = getLegalActions(state, id);
    const first = legalActions[0];
    if (!first) continue;
    const kind = decisionKindOf(first);
    // ACKNOWLEDGE 不走 onHumanAction，面板永远见不到它
    if (!kind) continue;
    probes.push({
      seed,
      state,
      turn: { kind, view: toPlayerView(state, id), legalActions },
    });
  }
  return probes;
}

/**
 * 跑几局全 AI 的对局，把沿途每一步、每个待行动的人都收成一手棋。
 *
 * 这样一份池子同时覆盖好人和坏人的任务票、刺杀、刺杀前推测——
 * 不必去凑"人类恰好是刺客且好人恰好赢了"的种子。
 */
let POOL: Probe[] | null = null;

async function pool(): Promise<Probe[]> {
  if (POOL) return POOL;

  const all: Probe[] = [];
  for (const seed of SEEDS) {
    const { state, rng } = newGame(seed, null);
    all.push(...probesAt(seed, state));
    await runGame({
      state,
      client: createMockAiClient(rng),
      rng,
      hooks: {
        onState: (next) => {
          all.push(...probesAt(seed, next));
        },
      },
    });
  }
  POOL = all;
  return all;
}

async function formsOfKind(kind: HumanTurn["kind"]): Promise<TurnForm[]> {
  const forms: TurnForm[] = [];
  for (const { turn } of await pool()) {
    if (turn.kind !== kind) continue;
    const form = describeTurn(turn);
    if (form) forms.push(form);
  }
  return forms;
}

function roleOf(state: GameState, id: number): Role {
  return state.players.find((p) => p.id === id)!.role;
}

// ---------------------------------------------------------------------------

describe("describeTurn", () => {
  it("每一手都给得出表单，且 kind 对得上", async () => {
    for (const { turn } of await pool()) {
      const form = describeTurn(turn);
      expect(form, `${turn.kind} 没给出表单`).not.toBeNull();
      expect(form!.kind).toBe(turn.kind);
      expect(form!.title.length).toBeGreaterThan(0);
      expect(form!.hint.length).toBeGreaterThan(0);
    }
  });

  it("六种决策全都出现过，断言不是空跑", async () => {
    const kinds = new Set((await pool()).map((p) => p.turn.kind));
    expect(kinds).toEqual(
      new Set([
        "TEAM_PROPOSAL",
        "SPEECH",
        "VOTE",
        "MISSION_CARD",
        "ASSASSIN_OPINION",
        "ASSASSINATION",
      ]),
    );
  });

  it("候选项一律来自 legalActions，不是面板自己拼的", async () => {
    for (const { turn } of await pool()) {
      const form = describeTurn(turn);
      const options: GameAction[] =
        form?.kind === "VOTE" || form?.kind === "MISSION_CARD"
          ? form.options.map((o) => o.action)
          : form?.kind === "ASSASSINATION"
            ? form.targets.map((t) => t.action)
            : [];
      for (const action of options) {
        expect(turn.legalActions).toContain(action);
      }
    }
  });
});

describe("组队", () => {
  it("全体座位都是候选，队长就是自己", async () => {
    for (const { turn } of await pool()) {
      if (turn.kind !== "TEAM_PROPOSAL") continue;
      const form = describeTurn(turn);
      expect(form?.kind).toBe("TEAM_PROPOSAL");
      if (form?.kind !== "TEAM_PROPOSAL") continue;

      // 队长可以选自己，也可以不选（rules.md §4.1）——所以候选是全体，不是"除自己外"
      expect(form.candidates.map((c) => c.id)).toEqual(turn.view.players.map((p) => p.id));
      expect(form.candidates.filter((c) => c.isSelf)).toHaveLength(1);
      expect(form.candidates.filter((c) => c.isLeader)).toHaveLength(1);
      expect(form.candidates.find((c) => c.isLeader)!.id).toBe(turn.view.selfId);
      expect(form.teamSize).toBe(turn.view.currentMission.teamSize);
    }
  });

  it("拼出来的名单引擎收得下", async () => {
    for (const { state, turn } of await pool()) {
      const form = describeTurn(turn);
      if (form?.kind !== "TEAM_PROPOSAL") continue;

      // 挑法不重要，重要的是拼出来的动作合法
      const team = form.candidates.slice(0, form.teamSize).map((c) => c.id);
      const action = proposeAction(form, team, "就这几个");
      expect(() => assertLegal(state, action)).not.toThrow();
    }
  });

  it("按座位号升序提交，不保留点击顺序", async () => {
    const [first] = await formsOfKind("TEAM_PROPOSAL");
    expect(first?.kind).toBe("TEAM_PROPOSAL");
    if (first?.kind !== "TEAM_PROPOSAL") return;

    // 点击顺序会随 proposedTeam 原样进每个人的 view，prompt.ts 直接念给所有 AI 听
    const clicked = [...first.candidates].reverse().slice(0, first.teamSize).map((c) => c.id);
    const action = proposeAction(first, clicked, "");
    expect(action.type).toBe("PROPOSE_TEAM");
    if (action.type !== "PROPOSE_TEAM") return;
    expect(action.team).toEqual([...action.team].sort((a, b) => a - b));
    expect(action.team).not.toEqual(clicked);
  });

  it("type 与 playerId 沿用引擎给的模板", async () => {
    for (const { turn } of await pool()) {
      const form = describeTurn(turn);
      if (form?.kind !== "TEAM_PROPOSAL") continue;
      expect(form.template.type).toBe("PROPOSE_TEAM");
      expect(form.template.playerId).toBe(turn.view.selfId);
    }
  });
});

describe("发言", () => {
  it("空发言也是合法动作", async () => {
    let checked = 0;
    for (const { state, turn } of await pool()) {
      const form = describeTurn(turn);
      if (form?.kind !== "SPEECH" && form?.kind !== "ASSASSIN_OPINION") continue;
      // legal.ts 只校验"轮没轮到你"，不管文本本身——所以"不说了"这个出口是真的
      expect(() => assertLegal(state, speakAction(form, ""))).not.toThrow();
      expect(() => assertLegal(state, speakAction(form, "我先听听"))).not.toThrow();
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("SPEAK 与 ASSASSIN_OPINION 的 type 都由模板带着", async () => {
    for (const { turn } of await pool()) {
      const form = describeTurn(turn);
      if (form?.kind !== "SPEECH" && form?.kind !== "ASSASSIN_OPINION") continue;
      expect(speakAction(form, "x").type).toBe(form.template.type);
      expect(form.template.type).toBe(form.kind === "SPEECH" ? "SPEAK" : "ASSASSIN_OPINION");
    }
  });

  it("刺杀前的推测要说清楚是公开发言", async () => {
    const forms = await formsOfKind("ASSASSIN_OPINION");
    expect(forms.length).toBeGreaterThan(0);
    for (const form of forms) expect(form.hint).toContain("公开");
  });

  it("组队讨论与复盘讨论给的提示不一样", async () => {
    const hints = new Set<string>();
    for (const { turn } of await pool()) {
      const form = describeTurn(turn);
      if (form?.kind === "SPEECH") hints.add(form.hint);
    }
    expect(hints.size).toBe(2);
  });
});

describe("投票", () => {
  it("两个选项，赞成在前，都是引擎给的那两张票", async () => {
    const forms = await formsOfKind("VOTE");
    expect(forms.length).toBeGreaterThan(0);
    for (const form of forms) {
      if (form.kind !== "VOTE") continue;
      expect(form.options).toHaveLength(2);
      expect(form.options.map((o) => o.label)).toEqual(["赞成", "反对"]);
      expect(form.options.map((o) => o.tone)).toEqual(["positive", "negative"]);
    }
  });

  it("列出正在表决的队伍，顺序与 proposedTeam 一致", async () => {
    for (const { turn } of await pool()) {
      const form = describeTurn(turn);
      if (form?.kind !== "VOTE") continue;
      expect(form.team.map((s) => s.id)).toEqual(turn.view.proposedTeam ?? []);
      expect(form.team.length).toBe(turn.view.currentMission.teamSize);
    }
  });

  it("只在最后一次机会时警告", async () => {
    let warned = 0;
    for (const { turn } of await pool()) {
      const form = describeTurn(turn);
      if (form?.kind !== "VOTE") continue;

      const lastChance = turn.view.rejectCount === turn.view.maxRejects - 1;
      if (lastChance) {
        expect(form.warning).toContain("坏人直接获胜");
        warned += 1;
      } else {
        expect(form.warning).toBeNull();
      }
    }
    expect(warned).toBeGreaterThan(0);
  });
});

describe("任务票", () => {
  it("好人只有一个选项，并解释为什么", async () => {
    let good = 0;
    for (const { state, turn } of await pool()) {
      const form = describeTurn(turn);
      if (form?.kind !== "MISSION_CARD") continue;
      if (ROLE_TEAM[roleOf(state, turn.view.selfId)] !== "GOOD") continue;

      // 整个项目最要紧的一条：好人的候选里根本没有"投失败"
      expect(form.options).toHaveLength(1);
      expect(form.options[0]!.label).toBe("任务成功");
      expect(form.note).not.toBeNull();
      good += 1;
    }
    expect(good).toBeGreaterThan(0);
  });

  it("坏人两个选项，不需要额外解释", async () => {
    let evil = 0;
    for (const { state, turn } of await pool()) {
      const form = describeTurn(turn);
      if (form?.kind !== "MISSION_CARD") continue;
      if (ROLE_TEAM[roleOf(state, turn.view.selfId)] !== "EVIL") continue;

      expect(form.options.map((o) => o.label)).toEqual(["任务成功", "任务失败"]);
      expect(form.note).toBeNull();
      evil += 1;
    }
    expect(evil).toBeGreaterThan(0);
  });

  it("双失败票的那一轮要说出来", async () => {
    // 10 人局第 4 轮要 2 张失败票。不说的话，坏人可能白扔一张
    let doubled = 0;
    let single = 0;
    for (const { turn } of await pool()) {
      const form = describeTurn(turn);
      if (form?.kind !== "MISSION_CARD" && form?.kind !== "TEAM_PROPOSAL") continue;

      if (turn.view.currentMission.failsRequired > 1) {
        expect(form.hint).toContain("2 张失败票");
        doubled += 1;
      } else {
        expect(form.hint).not.toContain("失败票");
        single += 1;
      }
    }
    expect(doubled).toBeGreaterThan(0);
    expect(single).toBeGreaterThan(0);
  });

  it("每一张票引擎都收得下", async () => {
    for (const { state, turn } of await pool()) {
      const form = describeTurn(turn);
      if (form?.kind !== "MISSION_CARD") continue;
      for (const option of form.options) {
        expect(() => assertLegal(state, option.action)).not.toThrow();
      }
    }
  });
});

describe("刺杀", () => {
  it("全体座位都是目标，含自己和坏人队友", async () => {
    const forms = await formsOfKind("ASSASSINATION");
    expect(forms.length).toBeGreaterThan(0);
    for (const form of forms) {
      if (form.kind !== "ASSASSINATION") continue;
      // rules.md §4.5 明确允许，就是为了避免"没有合法目标"的死循环
      expect(form.targets.filter((t) => t.isSelf)).toHaveLength(1);
      expect(form.targets.some((t) => t.tone === "evil")).toBe(true);
    }
  });

  it("目标覆盖全场，每一刀引擎都收得下", async () => {
    for (const { state, turn } of await pool()) {
      const form = describeTurn(turn);
      if (form?.kind !== "ASSASSINATION") continue;
      expect(form.targets.map((t) => t.id)).toEqual(turn.view.players.map((p) => p.id));
      for (const target of form.targets) {
        expect(() => assertLegal(state, target.action)).not.toThrow();
      }
    }
  });
});

describe("turnKey", () => {
  it("同一局里，同一个人的两手棋不会撞 key", async () => {
    const seen = new Map<string, Set<string>>();
    for (const { seed, turn } of await pool()) {
      const who = `${seed}#${turn.view.selfId}`;
      const keys = seen.get(who) ?? new Set<string>();
      const key = turnKey(turn);
      // 撞了就意味着上一手打了一半的发言会原样留在下一手的输入框里
      expect(keys.has(key), `${who} 的 key 撞了：${key}`).toBe(false);
      keys.add(key);
      seen.set(who, keys);
    }
  });

  it("【只在一局之内成立】换一局，同一手棋的 key 会重合", async () => {
    // turnKey 只看公开形状，不含种子——不同对局之间本来就可能长得一模一样。
    // 面板一次只活在一局里，所以够用；但别拿它当全局唯一 id
    const byKey = new Map<string, Set<number>>();
    for (const { seed, turn } of await pool()) {
      const seeds = byKey.get(turnKey(turn)) ?? new Set<number>();
      seeds.add(seed);
      byKey.set(turnKey(turn), seeds);
    }
    expect([...byKey.values()].some((seeds) => seeds.size > 1)).toBe(true);
  });

  it("同一手棋反复求值恒等", async () => {
    for (const { turn } of (await pool()).slice(0, 50)) {
      expect(turnKey(turn)).toBe(turnKey(turn));
    }
  });
});

describe("端到端", () => {
  it("人类全程照着表单出牌，一局能完整跑完", async () => {
    const seen = new Set<string>();
    const { state, rng } = newGame(7, 0);

    const final = await runGame({
      state,
      client: createMockAiClient(rng),
      rng,
      // 模拟一个只会点面板的玩家：他能做的每一件事都来自 describeTurn
      onHumanAction: async (turn) => {
        const form = describeTurn(turn);
        if (!form) throw new Error(`describeTurn 给不出表单：${turn.kind}`);
        seen.add(form.kind);

        switch (form.kind) {
          case "TEAM_PROPOSAL":
            return proposeAction(
              form,
              form.candidates.slice(0, form.teamSize).map((c) => c.id),
              "先试试这几个。",
            );
          case "SPEECH":
          case "ASSASSIN_OPINION":
            return speakAction(form, "我再看看。");
          case "VOTE":
          case "MISSION_CARD":
            return form.options[0]!.action;
          case "ASSASSINATION":
            return form.targets[0]!.action;
        }
      },
    });

    // 拼出来的动作只要有一个非法，reduce 里的 assertLegal 就会把整局打死
    expect(final.phase).toBe("GAME_OVER");
    expect(seen.has("TEAM_PROPOSAL")).toBe(true);
    expect(seen.has("VOTE")).toBe(true);
  });
});
