/**
 * 观战推导的测试。
 *
 * 【最要紧的一条是"默认什么都不知道"】引擎那边 SpectatorView.roles 是全量的，
 * 一不小心就会把它整份铺到界面上。这里的第一组断言就是钉住：
 * 翻牌集合为空时，每一座的 roleLabel 都是 null、tone 都是 plain。
 */
import { describe, expect, it } from "vitest";
import { zh } from "@/i18n/messages.zh";
import { createMockAiClient } from "@/lib/ai/mock";
import { runGame, type DecisionRecord } from "@/lib/ai/orchestrator";
import {
  ROLE_TEAM,
  createConfig,
  createGame,
  createRng,
  makePlaceholderPersonas,
  toSpectatorView,
  type PlayerId,
  type SpectatorView,
} from "@/lib/game";
import {
  MIND_LIMIT,
  PACE_OPTIONS,
  describeCast,
  describeMinds,
  paceKeyOf,
} from "./spectator-model";
import { DEFAULT_PACE_MS } from "@/store/game";

// ---------------------------------------------------------------------------
// 夹具：跑一整局全 AI，拿终局的观战视角与全部决策
// ---------------------------------------------------------------------------

const PLAYER_COUNT = 5;

async function playOut(seed = 3): Promise<{
  view: SpectatorView;
  decisions: DecisionRecord[];
}> {
  const rng = createRng(seed);
  const state = createGame({
    config: createConfig(PLAYER_COUNT, { seed }),
    humanSeat: null,
    personas: makePlaceholderPersonas(PLAYER_COUNT),
    rng,
  });

  const decisions: DecisionRecord[] = [];
  const final = await runGame({
    state,
    client: createMockAiClient(rng),
    rng,
    hooks: { onDecision: (record) => void decisions.push(record) },
  });

  return { view: toSpectatorView(final), decisions };
}

const GAME = await playOut();
const NONE: ReadonlySet<PlayerId> = new Set();
const ALL: ReadonlySet<PlayerId> = new Set([0, 1, 2, 3, 4]);

// ---------------------------------------------------------------------------

describe("describeCast：默认全盖", () => {
  it("翻牌集合为空时，一张牌都不露", () => {
    const cast = describeCast(GAME.view, NONE, zh);

    expect(cast).toHaveLength(PLAYER_COUNT);
    for (const seat of cast) {
      expect(seat.revealed).toBe(false);
      expect(seat.roleLabel).toBeNull();
      expect(seat.team).toBeNull();
      // 【这一档决定了观战的圆桌一开始与落座局长得一样】
      expect(seat.tone).toBe("plain");
    }
  });

  it("整份输出里出现不了任何角色名", () => {
    const dump = JSON.stringify(describeCast(GAME.view, NONE, zh));
    for (const role of Object.keys(GAME.view.roles).map((id) => GAME.view.roles[Number(id)]!)) {
      expect(dump).not.toContain(zh.roles[role].label);
    }
  });

  it("座位标签仍然给全——盖着的是身份，不是这一桌有谁", () => {
    const cast = describeCast(GAME.view, NONE, zh);
    expect(cast.map((s) => s.id)).toEqual([0, 1, 2, 3, 4]);
    for (const seat of cast) expect(seat.label).toContain(`${seat.id} 号`);
  });
});

describe("describeCast：翻开", () => {
  it("翻一座只露一座，其余原样盖着", () => {
    const cast = describeCast(GAME.view, new Set([2]), zh);
    const two = cast.find((s) => s.id === 2)!;
    const role = GAME.view.roles[2]!;

    expect(two.revealed).toBe(true);
    expect(two.roleLabel).toBe(zh.roles[role].label);
    expect(two.team).toBe(ROLE_TEAM[role]);
    expect(two.tone).toBe(ROLE_TEAM[role] === "EVIL" ? "evil" : "good");

    for (const other of cast.filter((s) => s.id !== 2)) {
      expect(other.revealed).toBe(false);
      expect(other.roleLabel).toBeNull();
    }
  });

  it("全部翻开后每一座都按阵营染色", () => {
    for (const seat of describeCast(GAME.view, ALL, zh)) {
      const role = GAME.view.roles[seat.id]!;
      expect(seat.revealed).toBe(true);
      expect(seat.tone).toBe(ROLE_TEAM[role] === "EVIL" ? "evil" : "good");
    }
  });
});

describe("describeMinds", () => {
  it("一张牌都没翻时是空的", () => {
    expect(describeMinds(GAME.view, GAME.decisions, NONE, zh)).toEqual([]);
  });

  it("只给已翻开座位的条目", () => {
    const entries = describeMinds(GAME.view, GAME.decisions, new Set([1]), zh);

    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.playerId === 1)).toBe(true);
  });

  it("新的在前，且不超过 MIND_LIMIT 条", () => {
    const entries = describeMinds(GAME.view, GAME.decisions, ALL, zh);

    expect(entries.length).toBeLessThanOrEqual(MIND_LIMIT);
    // 一局 5 人的决策数远多于 12，所以这里必然是截断过的
    expect(GAME.decisions.length).toBeGreaterThan(MIND_LIMIT);
    expect(entries).toHaveLength(MIND_LIMIT);

    // key 就是 decisions 的下标，倒序意味着它严格递减
    const keys = entries.map((e) => Number(e.key));
    expect(keys).toEqual([...keys].sort((a, b) => b - a));
    expect(keys[0]).toBe(GAME.decisions.length - 1);
  });

  it("字段口径与终局回放一致：身份、种类、耗时、兜底标记", () => {
    const entries = describeMinds(GAME.view, GAME.decisions, ALL, zh);
    const entry = entries[0]!;
    const role = GAME.view.roles[entry.playerId]!;

    expect(entry.roleLabel).toBe(zh.roles[role].label);
    expect(entry.team).toBe(ROLE_TEAM[role]);
    expect(Object.values(zh.gameOver.kind)).toContain(entry.kindLabel);
    expect(typeof entry.reasoning).toBe("string");

    // auto 的那几手没调模型，不该印一个 0.0s 出来
    const auto = entries.find((e) => e.flags.includes(zh.gameOver.flagAuto));
    if (auto) expect(auto.latencyLabel).toBeNull();
  });
});

describe("节奏档位", () => {
  it("四档，且「正常」就是 store 的缺省值", () => {
    expect(PACE_OPTIONS.map((o) => o.key)).toEqual(["slow", "normal", "fast", "instant"]);
    expect(PACE_OPTIONS.find((o) => o.key === "normal")?.ms).toBe(DEFAULT_PACE_MS);
  });

  it("认得出当前落在哪一档，认不出时给 null 而不是硬凑一档", () => {
    expect(paceKeyOf(DEFAULT_PACE_MS)).toBe("normal");
    expect(paceKeyOf(0)).toBe("instant");
    expect(paceKeyOf(137)).toBeNull();
  });
});
