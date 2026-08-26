/**
 * 人数配置表与角色配置表，是 docs/rules.md §2、§3.1、§3.2 的代码化。
 *
 * 这里的常量是规则的唯一副本。改数字之前先改 rules.md，否则两边会悄悄分叉。
 *
 * §3.2 的推荐配置是【默认值】而非唯一合法值：用户可以自定义角色构成，
 * 但必须满足 §3.2.1 的约束。校验逻辑集中在 checkConfig，
 * validateConfig 只是它的抛错版本——两处分头写判断迟早分叉。
 */
import {
  EngineError,
  ROLE_META,
  ROLE_TEAM,
  type ConfigIssue,
  type GameConfig,
  type MissionConfig,
  type Role,
  type RoleBound,
  type RoleCounts,
} from "./types";

/** 支持的人数范围 */
export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 10;

/** rules.md §4.2：同一轮否决达到此数，坏人直接获胜 */
export const DEFAULT_MAX_REJECTS = 5;

/**
 * rules.md §1：任务积分达到此数即分出任务胜负。
 * 好人到 3 分不等于终局——还要过刺杀那一关，判定顺序见 missionResult.ts
 */
export const MISSIONS_TO_WIN = 3;

/**
 * 角色的规范顺序。countsToRoles 按它输出，
 * 保证同一份配置永远产出同一个数组——快照测试和配置对比都依赖这条。
 */
export const ROLE_ORDER: readonly Role[] = [
  "MERLIN",
  "PERCIVAL",
  "LOYAL_SERVANT",
  "MORGANA",
  "ASSASSIN",
  "MORDRED",
  "OBERON",
  "MINION",
];

/** rules.md §2 左半张表：总人数 -> 好人/坏人名额 */
export const TEAM_SPLIT: Record<number, { good: number; evil: number }> = {
  5: { good: 3, evil: 2 },
  6: { good: 4, evil: 2 },
  7: { good: 4, evil: 3 },
  8: { good: 5, evil: 3 },
  9: { good: 6, evil: 3 },
  10: { good: 6, evil: 4 },
};

const m = (teamSize: number, failsRequired = 1): MissionConfig => ({
  teamSize,
  failsRequired,
});

/**
 * rules.md §2 右半张表。
 * 7 人及以上第 4 轮（下标 3）需要 2 张失败票，这条最容易漏。
 */
export const MISSION_TABLE: Record<number, MissionConfig[]> = {
  5: [m(2), m(3), m(2), m(3), m(3)],
  6: [m(2), m(3), m(4), m(3), m(4)],
  7: [m(2), m(3), m(3), m(4, 2), m(4)],
  8: [m(3), m(4), m(4), m(5, 2), m(5)],
  9: [m(3), m(4), m(4), m(5, 2), m(5)],
  10: [m(3), m(4), m(4), m(5, 2), m(5)],
};

/**
 * rules.md §3.1 的数量列。
 *
 * 前四个 min === max，是锁定项；莫德雷德和奥伯伦是具名单人角色，至多 1 个。
 * 爪牙和忠臣是填充位，这里的 max 只是形式上界，真正卡住它们的是 TEAM_SPLIT 的名额。
 */
export const ROLE_BOUNDS: Record<Role, RoleBound> = {
  MERLIN: { min: 1, max: 1 },
  PERCIVAL: { min: 1, max: 1 },
  MORGANA: { min: 1, max: 1 },
  ASSASSIN: { min: 1, max: 1 },
  MORDRED: { min: 0, max: 1 },
  OBERON: { min: 0, max: 1 },
  MINION: { min: 0, max: MAX_PLAYERS },
  LOYAL_SERVANT: { min: 0, max: MAX_PLAYERS },
};

/** 好人侧的锁定角色，各恰好 1 个 */
const FIXED_GOOD_ROLES: readonly Role[] = ["MERLIN", "PERCIVAL"];
/** 坏人侧的锁定角色，各恰好 1 个 */
const FIXED_EVIL_ROLES: readonly Role[] = ["MORGANA", "ASSASSIN"];
/** 坏人自由位可以填的角色 */
const FREE_EVIL_ROLES: readonly Role[] = ["MORDRED", "OBERON", "MINION"];

/**
 * rules.md §3.1 的"建议 N 人以上"。
 * 只用于产出 warning，不参与合法性判定——它是平衡性建议，不是规则。
 */
export const ROLE_RECOMMENDED_MIN_PLAYERS: Partial<Record<Role, number>> = {
  MORDRED: 9,
  OBERON: 7,
};

// ---------------------------------------------------------------------------
// 数量表与角色数组的互转
// ---------------------------------------------------------------------------

export function rolesToCounts(roles: readonly Role[]): RoleCounts {
  const counts = Object.fromEntries(ROLE_ORDER.map((r) => [r, 0])) as RoleCounts;
  for (const role of roles) counts[role] += 1;
  return counts;
}

/**
 * 数量表里有几个坏人。
 *
 * 刻意不查 TEAM_SPLIT：那张表按人数索引，用它就得处理"人数不在表里"的分支，
 * 而这里的输入是一份现成的构成表，直接数就行。
 * prompt.ts 的【本局配置】与 deduction.ts 共用这一份，不留第二处实现。
 */
export function countEvil(counts: RoleCounts): number {
  return ROLE_ORDER.filter((role) => ROLE_TEAM[role] === "EVIL").reduce(
    (sum, role) => sum + counts[role],
    0,
  );
}

/** 按 ROLE_ORDER 输出，保证同一配置产出同一数组 */
export function countsToRoles(counts: RoleCounts): Role[] {
  const roles: Role[] = [];
  for (const role of ROLE_ORDER) {
    for (let i = 0; i < counts[role]; i += 1) roles.push(role);
  }
  return roles;
}

export function isSupportedPlayerCount(playerCount: number): boolean {
  return (
    Number.isInteger(playerCount) &&
    playerCount >= MIN_PLAYERS &&
    playerCount <= MAX_PLAYERS
  );
}

function unsupported(playerCount: number): EngineError {
  return new EngineError(
    `不支持的人数：${playerCount}，仅支持 ${MIN_PLAYERS}-${MAX_PLAYERS} 人`,
    "CONFIG_INVALID",
    { playerCount },
  );
}

/** 取表前先过这个，把 noUncheckedIndexedAccess 的 undefined 挡在入口 */
function requireSplit(playerCount: number): { good: number; evil: number } {
  const split = TEAM_SPLIT[playerCount];
  if (!split) throw unsupported(playerCount);
  return split;
}

function requireMissions(playerCount: number): MissionConfig[] {
  const missions = MISSION_TABLE[playerCount];
  if (!missions) throw unsupported(playerCount);
  return missions;
}

// ---------------------------------------------------------------------------
// 自定义配置
// ---------------------------------------------------------------------------

/**
 * 该人数下坏人有几个自由位。
 * 0 表示配置固定，UI 据此显示"该人数配置固定"，而不是渲染一个点了没反应的编辑器。
 */
export function getFreeEvilSlots(playerCount: number): number {
  return requireSplit(playerCount).evil - FIXED_EVIL_ROLES.length;
}

/**
 * 该人数下所有合法的坏人自由位组合，UI 直接渲染成选项列表。
 *
 * 5/6 人局返回 [[]]——只有"什么都不加"这一种，那仍是一个合法选项而不是空列表。
 */
export function getEvilOptions(playerCount: number): Role[][] {
  const slots = getFreeEvilSlots(playerCount);
  const results: Role[][] = [];

  // 按 FREE_EVIL_ROLES 的顺序做组合，天然去重且输出顺序稳定
  const walk = (start: number, chosen: Role[]) => {
    if (chosen.length === slots) {
      results.push([...chosen]);
      return;
    }
    for (let i = start; i < FREE_EVIL_ROLES.length; i += 1) {
      const role = FREE_EVIL_ROLES[i];
      if (!role) continue;
      const bound = ROLE_BOUNDS[role];
      if (chosen.filter((r) => r === role).length >= bound.max) continue;
      chosen.push(role);
      // 爪牙可重复，所以从 i 继续；莫德雷德/奥伯伦至多 1 个，从 i + 1 继续
      walk(bound.max > 1 ? i : i + 1, chosen);
      chosen.pop();
    }
  };
  walk(0, []);

  return results;
}

/**
 * UI 的主入口：用户只挑坏人自由位，其余全部推导。
 *
 * 补上梅林/派西维尔/莫甘娜/刺客，再用忠臣把好人名额填满。
 * 常规路径上非法状态根本表示不出来，checkConfig 只是兜底（手写配置、导入的对局）。
 */
export function composeRoles(
  playerCount: number,
  freeEvilSlots: readonly Role[],
): Role[] {
  const split = requireSplit(playerCount);
  const loyalCount = split.good - FIXED_GOOD_ROLES.length;
  if (loyalCount < 0) {
    throw new EngineError(
      `${playerCount} 人局的好人名额 ${split.good} 装不下梅林和派西维尔`,
      "CONFIG_INVALID",
      { playerCount },
    );
  }

  return countsToRoles(
    rolesToCounts([
      ...FIXED_GOOD_ROLES,
      ...Array.from({ length: loyalCount }, (): Role => "LOYAL_SERVANT"),
      ...FIXED_EVIL_ROLES,
      ...freeEvilSlots,
    ]),
  );
}

/**
 * rules.md §3.2 推荐配置，现在的定位是【默认值】。
 * 由 composeRoles 从推荐的坏人自由位推导，避免把上面的表手抄两遍。
 */
export const ROLE_PRESETS: Record<number, Role[]> = {
  5: composeRoles(5, []),
  6: composeRoles(6, []),
  7: composeRoles(7, ["OBERON"]),
  8: composeRoles(8, ["MINION"]),
  9: composeRoles(9, ["MORDRED"]),
  10: composeRoles(10, ["MORDRED", "OBERON"]),
};

// ---------------------------------------------------------------------------
// 校验
// ---------------------------------------------------------------------------

/**
 * 纯查错，不抛。UI 边编辑边调用它做实时提示。
 *
 * 与 validateConfig 共用这一套判断，是"UI 提示"和"引擎硬校验"的唯一真相来源。
 */
export function checkConfig(config: GameConfig): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const { playerCount, roles, missions } = config;

  if (!isSupportedPlayerCount(playerCount)) {
    // 人数不合法时后面的表都取不出来，直接返回，避免产出一串误导性的连锁错误
    return [
      {
        severity: "error",
        code: "PLAYER_COUNT_UNSUPPORTED",
        message: `人数必须是 ${MIN_PLAYERS}-${MAX_PLAYERS} 之间的整数，当前为 ${playerCount}`,
      },
    ];
  }

  const split = requireSplit(playerCount);
  const table = requireMissions(playerCount);

  if (roles.length !== playerCount) {
    issues.push({
      severity: "error",
      code: "ROLE_COUNT_MISMATCH",
      message: `角色数量 ${roles.length} 与人数 ${playerCount} 不符`,
    });
  }

  const good = roles.filter((r) => ROLE_TEAM[r] === "GOOD").length;
  const evil = roles.length - good;
  if (good !== split.good || evil !== split.evil) {
    issues.push({
      severity: "error",
      code: "TEAM_SPLIT_MISMATCH",
      message:
        `${playerCount} 人局应为好人 ${split.good} 坏人 ${split.evil}，` +
        `当前为好人 ${good} 坏人 ${evil}`,
    });
  }

  const counts = rolesToCounts(roles);
  for (const role of ROLE_ORDER) {
    const bound = ROLE_BOUNDS[role];
    const n = counts[role];
    if (n < bound.min || n > bound.max) {
      issues.push({
        severity: "error",
        code: "ROLE_BOUND_VIOLATION",
        message:
          bound.min === bound.max
            ? `${ROLE_META[role].label}必须恰好 ${bound.min} 个，当前 ${n} 个`
            : `${ROLE_META[role].label}数量须在 ${bound.min}-${bound.max} 之间，当前 ${n} 个`,
        roles: [role],
      });
    }
  }

  const missionsMismatch =
    missions.length !== table.length ||
    missions.some((cfg, i) => {
      const expected = table[i];
      return (
        !expected ||
        cfg.teamSize !== expected.teamSize ||
        cfg.failsRequired !== expected.failsRequired
      );
    });
  if (missionsMismatch) {
    issues.push({
      severity: "error",
      code: "MISSION_TABLE_MISMATCH",
      message: `任务配置与 ${playerCount} 人局的规则表不符`,
    });
  }

  // 平衡性提示，不拦开局
  for (const role of ROLE_ORDER) {
    const recommended = ROLE_RECOMMENDED_MIN_PLAYERS[role];
    if (recommended !== undefined && counts[role] > 0 && playerCount < recommended) {
      issues.push({
        severity: "warning",
        code: "BELOW_RECOMMENDED_COUNT",
        message: `${ROLE_META[role].label}建议 ${recommended} 人以上使用，当前 ${playerCount} 人`,
        roles: [role],
      });
    }
  }

  return issues;
}

/** 引擎入口。有任何 error 就抛，warning 不拦 */
export function validateConfig(config: GameConfig): void {
  const errors = checkConfig(config).filter((i) => i.severity === "error");
  if (errors.length > 0) {
    throw new EngineError(
      `配置非法：${errors.map((e) => e.message).join("；")}`,
      "CONFIG_INVALID",
      { issues: errors },
    );
  }
}

/** 按人数产出配置。roles 缺省时取 ROLE_PRESETS，即 §3.2 的推荐配置 */
export function createConfig(
  playerCount: number,
  overrides?: Partial<
    Pick<GameConfig, "roles" | "maxRejects" | "forcePassOnLastAttempt" | "seed">
  >,
): GameConfig {
  const preset = ROLE_PRESETS[playerCount];
  if (!preset) throw unsupported(playerCount);

  const config: GameConfig = {
    playerCount,
    roles: overrides?.roles ? [...overrides.roles] : [...preset],
    missions: requireMissions(playerCount).map((cfg) => ({ ...cfg })),
    maxRejects: overrides?.maxRejects ?? DEFAULT_MAX_REJECTS,
    forcePassOnLastAttempt: overrides?.forcePassOnLastAttempt ?? false,
    seed: overrides?.seed ?? 0,
  };

  validateConfig(config);
  return config;
}
