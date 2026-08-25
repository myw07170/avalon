import { describe, expect, it } from "vitest";
import {
  ROLE_PRESETS,
  TEAM_SPLIT,
  composeRoles,
  createConfig,
  getEvilOptions,
  rolesToCounts,
} from "./config";
import { createRng } from "./rng";
import { createGame, makePlaceholderPersonas } from "./setup";
import { EngineError, ROLE_TEAM, createPending, type GameState } from "./types";

const ALL_COUNTS = [5, 6, 7, 8, 9, 10];

const build = (
  playerCount: number,
  seed: number,
  opts: { humanSeat?: number | null; roles?: ReturnType<typeof composeRoles> } = {},
): GameState =>
  createGame({
    config: createConfig(playerCount, opts.roles ? { roles: opts.roles } : undefined),
    humanSeat: opts.humanSeat === undefined ? 0 : opts.humanSeat,
    personas: makePlaceholderPersonas(playerCount),
    rng: createRng(seed),
  });

describe("发牌数量正确", () => {
  it("6 种人数各建 100 局，角色分布与配置完全一致", () => {
    for (const n of ALL_COUNTS) {
      const expected = rolesToCounts(ROLE_PRESETS[n]!);
      for (let seed = 0; seed < 100; seed += 1) {
        const state = build(n, seed);
        expect(state.players, `${n} 人局座位数不对`).toHaveLength(n);
        expect(
          rolesToCounts(state.players.map((p) => p.role)),
          `${n} 人局 seed=${seed} 的角色分布与配置不符`,
        ).toEqual(expected);
      }
    }
  });

  it("好人/坏人数量与 §2 表格一致", () => {
    for (const n of ALL_COUNTS) {
      for (let seed = 0; seed < 20; seed += 1) {
        const state = build(n, seed);
        const evil = state.players.filter((p) => ROLE_TEAM[p.role] === "EVIL").length;
        expect(evil, `${n} 人局的坏人数量不对`).toBe(TEAM_SPLIT[n]!.evil);
      }
    }
  });

  it("座位号连续且与数组下标一致", () => {
    for (const n of ALL_COUNTS) {
      const state = build(n, 1);
      expect(state.players.map((p) => p.id)).toEqual(
        Array.from({ length: n }, (_, i) => i),
      );
    }
  });

  it("任务配置来自 §2 表格，且是副本", () => {
    const state = build(7, 1);
    expect(state.config.missions).toHaveLength(5);
    expect(state.config.missions[3]!.failsRequired).toBe(2);
  });
});

describe("角色确实被洗过", () => {
  it("梅林不会每局都在 0 号位", () => {
    const seats = new Set<number>();
    for (let seed = 0; seed < 200; seed += 1) {
      const state = build(7, seed);
      seats.add(state.players.find((p) => p.role === "MERLIN")!.id);
    }
    expect(
      seats.size,
      "梅林只出现在少数座位上，多半是忘了 shuffle 直接按下标发牌",
    ).toBe(7);
  });

  it("每个角色都能出现在每个座位上", () => {
    const seatsByRole = new Map<string, Set<number>>();
    for (let seed = 0; seed < 400; seed += 1) {
      for (const p of build(5, seed).players) {
        if (!seatsByRole.has(p.role)) seatsByRole.set(p.role, new Set());
        seatsByRole.get(p.role)!.add(p.id);
      }
    }
    for (const [role, seats] of seatsByRole) {
      expect(seats.size, `${role} 没有覆盖全部 5 个座位`).toBe(5);
    }
  });

  it("首任队长不是固定的", () => {
    const leaders = new Set<number>();
    for (let seed = 0; seed < 200; seed += 1) leaders.add(build(7, seed).currentLeaderId);
    expect(leaders.size, "首任队长应当随机").toBe(7);
  });
});

describe("自定义配置也能建局", () => {
  it("每个人数的每一种自由位组合都能正常发牌", () => {
    for (const n of ALL_COUNTS) {
      for (const option of getEvilOptions(n)) {
        const roles = composeRoles(n, option);
        const state = build(n, 7, { roles });
        expect(
          rolesToCounts(state.players.map((p) => p.role)),
          `${n} 人局 [${option.join("+")}] 发牌结果与自定义配置不符`,
        ).toEqual(rolesToCounts(roles));
      }
    }
  });

  it("自定义的坏人角色真的出现在牌堆里", () => {
    const state = build(10, 3, { roles: composeRoles(10, ["MINION", "MINION"]) });
    const counts = rolesToCounts(state.players.map((p) => p.role));
    expect(counts.MINION).toBe(2);
    expect(counts.MORDRED).toBe(0);
    expect(counts.OBERON).toBe(0);
  });

  it("非法配置在建局时就被拦下", () => {
    expect(() =>
      createGame({
        config: { ...createConfig(7), roles: composeRoles(7, ["OBERON"]).slice(0, 6) },
        humanSeat: 0,
        personas: makePlaceholderPersonas(7),
        rng: createRng(1),
      }),
    ).toThrow(EngineError);
  });
});

describe("初始状态停在 SETUP", () => {
  it("phase 是 SETUP，而不是 ROLE_REVEAL", () => {
    // state-machine.md §2：SETUP 负责分配角色和首任队长，再由 START_GAME 转入 ROLE_REVEAL。
    // 这里若直接给 ROLE_REVEAL，SETUP 阶段和 START_GAME 动作就成了死代码。
    expect(build(5, 1).phase).toBe("SETUP");
  });

  it("计分、轮次、历史全部归零", () => {
    const s = build(8, 5);
    expect(s.missionIndex).toBe(0);
    expect(s.rejectCount).toBe(0);
    expect(s.goodScore).toBe(0);
    expect(s.evilScore).toBe(0);
    expect(s.proposedTeam).toBeNull();
    expect(s.proposalHistory).toEqual([]);
    expect(s.missionHistory).toEqual([]);
    expect(s.speeches).toEqual([]);
    expect(s.log).toEqual([]);
    expect(s.assassination).toBeNull();
    expect(s.winner).toBeNull();
    expect(s.winReason).toBeNull();
  });

  it("pending 是全新的空对象", () => {
    const a = build(5, 1);
    const b = build(5, 2);
    expect(a.pending).toEqual(createPending());
    expect(a.pending).not.toBe(b.pending);
    expect(a.pending.votes).not.toBe(b.pending.votes);
  });

  it("首任队长是合法座位号", () => {
    for (const n of ALL_COUNTS) {
      for (let seed = 0; seed < 30; seed += 1) {
        const leader = build(n, seed).currentLeaderId;
        expect(leader).toBeGreaterThanOrEqual(0);
        expect(leader).toBeLessThan(n);
      }
    }
  });
});

describe("人类座位与人设", () => {
  it("人类座位标记正确，且没有人设", () => {
    const state = build(7, 1, { humanSeat: 3 });
    const human = state.players.filter((p) => p.isHuman);
    expect(human).toHaveLength(1);
    expect(human[0]!.id).toBe(3);
    expect(human[0]!.persona).toBeNull();
  });

  it("humanSeat 为 null 时全是 AI", () => {
    const state = build(6, 1, { humanSeat: null });
    expect(state.players.every((p) => !p.isHuman)).toBe(true);
    expect(state.players.every((p) => p.persona !== null)).toBe(true);
  });

  it("每个 AI 拿到不同的人设，人设不会被复用", () => {
    const state = build(9, 1, { humanSeat: 2 });
    const names = state.players.filter((p) => !p.isHuman).map((p) => p.persona!.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("玩家名与其人设名一致", () => {
    for (const p of build(6, 1, { humanSeat: null }).players) {
      expect(p.name).toBe(p.persona!.name);
    }
  });

  it("humanSeat 越界时抛 EngineError", () => {
    for (const seat of [-1, 7, 1.5]) {
      expect(() =>
        createGame({
          config: createConfig(7),
          humanSeat: seat,
          personas: makePlaceholderPersonas(7),
          rng: createRng(1),
        }),
      ).toThrow(EngineError);
    }
  });

  it("人设数量不够时抛 EngineError", () => {
    expect(() =>
      createGame({
        config: createConfig(7),
        humanSeat: 0,
        personas: makePlaceholderPersonas(5), // 需要 6 份
        rng: createRng(1),
      }),
    ).toThrow(EngineError);
  });

  it("全 AI 局需要的人设数等于总人数", () => {
    expect(() =>
      createGame({
        config: createConfig(7),
        humanSeat: null,
        personas: makePlaceholderPersonas(6),
        rng: createRng(1),
      }),
    ).toThrow(EngineError);
  });
});

describe("可复现", () => {
  it("同一种子建出完全相同的一局", () => {
    for (const n of ALL_COUNTS) {
      expect(build(n, 2026)).toEqual(build(n, 2026));
    }
  });

  it("不同种子建出不同的一局", () => {
    const fingerprints = new Set(
      Array.from({ length: 30 }, (_, seed) => {
        const s = build(8, seed);
        return `${s.currentLeaderId}:${s.players.map((p) => p.role).join(",")}`;
      }),
    );
    expect(fingerprints.size).toBeGreaterThan(20);
  });
});
