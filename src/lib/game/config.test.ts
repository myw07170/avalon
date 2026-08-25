import { describe, expect, it } from "vitest";
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  MISSION_TABLE,
  ROLE_BOUNDS,
  ROLE_ORDER,
  ROLE_PRESETS,
  TEAM_SPLIT,
  checkConfig,
  composeRoles,
  countsToRoles,
  createConfig,
  getEvilOptions,
  getFreeEvilSlots,
  rolesToCounts,
  validateConfig,
} from "./config";
import { EngineError, ROLE_TEAM, type ConfigIssueCode, type Role } from "./types";

const ALL_COUNTS = [5, 6, 7, 8, 9, 10];

const errorsOf = (config: Parameters<typeof checkConfig>[0]) =>
  checkConfig(config).filter((i) => i.severity === "error");

const codesOf = (config: Parameters<typeof checkConfig>[0]): ConfigIssueCode[] =>
  checkConfig(config).map((i) => i.code);

/** 造一个除了指定改动外都合法的配置 */
const configWithRoles = (playerCount: number, roles: Role[]) => ({
  ...createConfig(playerCount),
  roles,
});

describe("规则表之间不许分叉", () => {
  it("TEAM_SPLIT / MISSION_TABLE / ROLE_PRESETS 覆盖同一组人数", () => {
    const keys = (o: Record<number, unknown>) => Object.keys(o).map(Number).sort((a, b) => a - b);
    expect(keys(TEAM_SPLIT)).toEqual(ALL_COUNTS);
    expect(keys(MISSION_TABLE)).toEqual(ALL_COUNTS);
    expect(keys(ROLE_PRESETS)).toEqual(ALL_COUNTS);
    expect([MIN_PLAYERS, MAX_PLAYERS]).toEqual([5, 10]);
  });

  it("好人数 + 坏人数 == 总人数", () => {
    for (const n of ALL_COUNTS) {
      const split = TEAM_SPLIT[n]!;
      expect(split.good + split.evil, `${n} 人局的名额加起来不等于 ${n}`).toBe(n);
    }
  });

  it("每个人数都是 5 轮任务，且 7 人以上第 4 轮需要 2 张失败票", () => {
    for (const n of ALL_COUNTS) {
      const missions = MISSION_TABLE[n]!;
      expect(missions).toHaveLength(5);
      expect(missions[3]!.failsRequired, `${n} 人局第 4 轮的失败门槛不对`).toBe(
        n >= 7 ? 2 : 1,
      );
      for (const [i, cfg] of missions.entries()) {
        if (i !== 3) expect(cfg.failsRequired).toBe(1);
      }
    }
  });

  it("ROLE_ORDER 覆盖全部 8 个角色", () => {
    expect([...ROLE_ORDER].sort()).toEqual(Object.keys(ROLE_TEAM).sort());
  });
});

describe("推荐配置（rules.md §3.2）", () => {
  it("6 套预设全部合法，且不含任何 error", () => {
    for (const n of ALL_COUNTS) {
      expect(errorsOf(createConfig(n)), `${n} 人局的推荐配置不合法`).toEqual([]);
    }
  });

  it("与 §3.2 表格逐字一致", () => {
    const label = (roles: Role[]) => countsToRoles(rolesToCounts(roles)).join(",");
    expect(label(ROLE_PRESETS[5]!)).toBe(
      "MERLIN,PERCIVAL,LOYAL_SERVANT,MORGANA,ASSASSIN",
    );
    expect(label(ROLE_PRESETS[6]!)).toBe(
      "MERLIN,PERCIVAL,LOYAL_SERVANT,LOYAL_SERVANT,MORGANA,ASSASSIN",
    );
    expect(label(ROLE_PRESETS[7]!)).toBe(
      "MERLIN,PERCIVAL,LOYAL_SERVANT,LOYAL_SERVANT,MORGANA,ASSASSIN,OBERON",
    );
    expect(label(ROLE_PRESETS[8]!)).toBe(
      "MERLIN,PERCIVAL,LOYAL_SERVANT,LOYAL_SERVANT,LOYAL_SERVANT,MORGANA,ASSASSIN,MINION",
    );
    expect(label(ROLE_PRESETS[9]!)).toBe(
      "MERLIN,PERCIVAL,LOYAL_SERVANT,LOYAL_SERVANT,LOYAL_SERVANT,LOYAL_SERVANT,MORGANA,ASSASSIN,MORDRED",
    );
    expect(label(ROLE_PRESETS[10]!)).toBe(
      "MERLIN,PERCIVAL,LOYAL_SERVANT,LOYAL_SERVANT,LOYAL_SERVANT,LOYAL_SERVANT,MORGANA,ASSASSIN,MORDRED,OBERON",
    );
  });

  it("createConfig 不传 roles 时用推荐配置，传了就用传的", () => {
    expect(createConfig(9).roles).toEqual(ROLE_PRESETS[9]);
    const custom = composeRoles(9, ["MINION"]);
    expect(createConfig(9, { roles: custom }).roles).toEqual(custom);
  });

  it("createConfig 返回的是副本，改它不会污染 ROLE_PRESETS", () => {
    const config = createConfig(7);
    config.roles.push("MINION");
    config.missions[0]!.teamSize = 99;
    expect(ROLE_PRESETS[7]).toHaveLength(7);
    expect(MISSION_TABLE[7]![0]!.teamSize).toBe(2);
  });
});

describe("自由位（§3.2.1）", () => {
  it("自由位数量 = 坏人名额 - 莫甘娜和刺客", () => {
    expect(ALL_COUNTS.map(getFreeEvilSlots)).toEqual([0, 0, 1, 1, 1, 2]);
  });

  it("可选配置数：5/6 人各 1 种，7/8/9 人各 3 种，10 人 4 种", () => {
    expect(ALL_COUNTS.map((n) => getEvilOptions(n).length)).toEqual([1, 1, 3, 3, 3, 4]);
  });

  it("5、6 人局仍返回一个空组合，而不是空列表", () => {
    expect(getEvilOptions(5)).toEqual([[]]);
    expect(getEvilOptions(6)).toEqual([[]]);
  });

  it("10 人局的两个自由位允许双爪牙，但不允许双莫德雷德或双奥伯伦", () => {
    const options = getEvilOptions(10).map((o) => o.join("+"));
    expect(options).toContain("MINION+MINION");
    expect(options).not.toContain("MORDRED+MORDRED");
    expect(options).not.toContain("OBERON+OBERON");
  });

  it("每个人数的每一种自由位组合都通过 validateConfig", () => {
    for (const n of ALL_COUNTS) {
      for (const option of getEvilOptions(n)) {
        const config = configWithRoles(n, composeRoles(n, option));
        expect(
          errorsOf(config),
          `${n} 人局配置 [${option.join("+")}] 不该报错`,
        ).toEqual([]);
      }
    }
  });
});

describe("composeRoles", () => {
  it("好人侧恒为 梅林 + 派西维尔 + 忠臣填充，与自由位无关", () => {
    for (const n of ALL_COUNTS) {
      for (const option of getEvilOptions(n)) {
        const counts = rolesToCounts(composeRoles(n, option));
        const split = TEAM_SPLIT[n]!;
        expect(counts.MERLIN).toBe(1);
        expect(counts.PERCIVAL).toBe(1);
        expect(
          counts.LOYAL_SERVANT,
          `${n} 人局的忠臣数量应由好人名额算出`,
        ).toBe(split.good - 2);
      }
    }
  });

  it("莫甘娜和刺客恒在，用户挑的自由位原样保留", () => {
    const counts = rolesToCounts(composeRoles(10, ["MINION", "MINION"]));
    expect(counts.MORGANA).toBe(1);
    expect(counts.ASSASSIN).toBe(1);
    expect(counts.MINION).toBe(2);
    expect(counts.MORDRED).toBe(0);
    expect(counts.OBERON).toBe(0);
  });

  it("输出按 ROLE_ORDER 排列，与用户挑选顺序无关", () => {
    expect(composeRoles(10, ["OBERON", "MORDRED"])).toEqual(
      composeRoles(10, ["MORDRED", "OBERON"]),
    );
  });

  it("人数不支持时抛 EngineError", () => {
    expect(() => composeRoles(4, [])).toThrow(EngineError);
    expect(() => composeRoles(11, [])).toThrow(EngineError);
  });
});

describe("数量表互转", () => {
  it("countsToRoles(rolesToCounts(r)) 与 r 排序后相等", () => {
    for (const n of ALL_COUNTS) {
      const roles = ROLE_PRESETS[n]!;
      expect([...countsToRoles(rolesToCounts(roles))].sort()).toEqual(
        [...roles].sort(),
      );
    }
  });

  it("缺席的角色计 0 而不是 undefined", () => {
    const counts = rolesToCounts(["MERLIN"]);
    for (const role of ROLE_ORDER) {
      expect(typeof counts[role]).toBe("number");
    }
    expect(counts.OBERON).toBe(0);
    expect(counts.MERLIN).toBe(1);
  });
});

describe("非法配置逐条命中错误码", () => {
  it("2 个梅林 -> ROLE_BOUND_VIOLATION", () => {
    const roles = composeRoles(7, ["OBERON"]).map((r) =>
      r === "LOYAL_SERVANT" ? "MERLIN" : r,
    );
    expect(codesOf(configWithRoles(7, roles))).toContain("ROLE_BOUND_VIOLATION");
  });

  it("0 个派西维尔 -> ROLE_BOUND_VIOLATION", () => {
    const roles = composeRoles(7, ["OBERON"]).map((r) =>
      r === "PERCIVAL" ? "LOYAL_SERVANT" : r,
    );
    expect(codesOf(configWithRoles(7, roles))).toContain("ROLE_BOUND_VIOLATION");
  });

  it("2 个莫德雷德 -> ROLE_BOUND_VIOLATION", () => {
    const roles: Role[] = [
      "MERLIN",
      "PERCIVAL",
      "LOYAL_SERVANT",
      "LOYAL_SERVANT",
      "LOYAL_SERVANT",
      "LOYAL_SERVANT",
      "MORGANA",
      "ASSASSIN",
      "MORDRED",
      "MORDRED",
    ];
    expect(codesOf(configWithRoles(10, roles))).toContain("ROLE_BOUND_VIOLATION");
  });

  it("坏人数不符 -> TEAM_SPLIT_MISMATCH", () => {
    // 9 人局塞 4 个坏人：把一个忠臣换成爪牙
    const roles = [...composeRoles(9, ["MORDRED"])];
    roles[roles.indexOf("LOYAL_SERVANT")] = "MINION";
    expect(codesOf(configWithRoles(9, roles))).toContain("TEAM_SPLIT_MISMATCH");
  });

  it("roles 长度不符 -> ROLE_COUNT_MISMATCH", () => {
    const roles = composeRoles(9, ["MORDRED"]).slice(0, 8);
    expect(codesOf(configWithRoles(9, roles))).toContain("ROLE_COUNT_MISMATCH");
  });

  it("人数越界 -> PLAYER_COUNT_UNSUPPORTED，且不产生连锁错误", () => {
    const base = createConfig(5);
    for (const playerCount of [4, 11, 5.5]) {
      const issues = checkConfig({ ...base, playerCount });
      expect(issues).toHaveLength(1);
      expect(issues[0]!.code).toBe("PLAYER_COUNT_UNSUPPORTED");
    }
  });

  it("任务表被改动 -> MISSION_TABLE_MISMATCH", () => {
    const config = createConfig(7);
    config.missions[3] = { teamSize: 4, failsRequired: 1 };
    expect(codesOf(config)).toContain("MISSION_TABLE_MISMATCH");
  });

  it("validateConfig 对非法配置抛 EngineError，code 为 CONFIG_INVALID", () => {
    const roles = composeRoles(9, ["MORDRED"]).slice(0, 8);
    try {
      validateConfig(configWithRoles(9, roles));
      expect.unreachable("应该抛错");
    } catch (err) {
      expect(err).toBeInstanceOf(EngineError);
      expect((err as EngineError).code).toBe("CONFIG_INVALID");
    }
  });
});

describe("平衡性提示不拦开局", () => {
  it("莫德雷德在 7 人局：有 warning 但无 error", () => {
    const config = configWithRoles(7, composeRoles(7, ["MORDRED"]));
    const issues = checkConfig(config);
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(issues.filter((i) => i.code === "BELOW_RECOMMENDED_COUNT")).toHaveLength(1);
    // warning 不该拦住开局
    expect(() => validateConfig(config)).not.toThrow();
  });

  it("莫德雷德在 9 人局：无任何提示", () => {
    expect(checkConfig(configWithRoles(9, composeRoles(9, ["MORDRED"])))).toEqual([]);
  });

  it("奥伯伦在 7 人局不触发提示（建议 7 人以上，7 人正好达标）", () => {
    expect(checkConfig(configWithRoles(7, composeRoles(7, ["OBERON"])))).toEqual([]);
  });
});

describe("ROLE_BOUNDS 与放开范围一致", () => {
  it("梅林、派西维尔、莫甘娜、刺客锁定为 1", () => {
    for (const role of ["MERLIN", "PERCIVAL", "MORGANA", "ASSASSIN"] as const) {
      expect(ROLE_BOUNDS[role], `${role} 应锁定为 1`).toEqual({ min: 1, max: 1 });
    }
  });

  it("莫德雷德、奥伯伦是 0-1 的具名单人角色", () => {
    for (const role of ["MORDRED", "OBERON"] as const) {
      expect(ROLE_BOUNDS[role]).toEqual({ min: 0, max: 1 });
    }
  });

  it("爪牙、忠臣是填充位，下界为 0", () => {
    for (const role of ["MINION", "LOYAL_SERVANT"] as const) {
      expect(ROLE_BOUNDS[role].min).toBe(0);
      expect(ROLE_BOUNDS[role].max).toBeGreaterThan(1);
    }
  });
});
