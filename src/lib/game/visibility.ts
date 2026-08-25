/**
 * 可见性矩阵，rules.md §3.3 的唯一实现。
 *
 * 整个项目最容易写错、错了又最难发现的一块。规则散落到别处就等于放弃了信息隔离。
 */
import {
  EngineError,
  ROLE_TEAM,
  type Knowledge,
  type Player,
  type PlayerId,
  type Role,
} from "./types";

/**
 * 互相认识的坏人集合。奥伯伦【不在其中】。
 *
 * 这一个集合同时充当"谁能看"和"谁被看到"两侧的判据——
 * 双向盲区因此在结构上就没法只实现一半，而不是靠两处各写一遍再祈祷它们不分叉。
 */
const EVIL_CONSPIRACY: ReadonlySet<Role> = new Set<Role>([
  "MORGANA",
  "ASSASSIN",
  "MORDRED",
  "MINION",
]);

/**
 * 梅林可见的坏人：全部坏人减去莫德雷德。
 * 从 ROLE_TEAM 派生而不是手抄一遍，将来加坏人角色时不会漏改这里。
 */
const EVIL_VISIBLE_TO_MERLIN: ReadonlySet<Role> = new Set<Role>(
  (Object.keys(ROLE_TEAM) as Role[]).filter(
    (role) => ROLE_TEAM[role] === "EVIL" && role !== "MORDRED",
  ),
);

/** 排序键。IS_EVIL 取座位号，MERLIN_OR_MORGANA 取升序后的第一个 */
function sortKey(k: Knowledge): PlayerId {
  return k.kind === "IS_EVIL" ? k.playerId : k.playerIds[0];
}

function requirePlayerByRole(players: readonly Player[], role: Role): Player {
  const found = players.find((p) => p.role === role);
  if (!found) {
    // 配置层锁死梅林/莫甘娜各恰好 1 个，取不到只可能是绕过 validateConfig 造出来的状态
    throw new EngineError(`本局没有${role}，可见性无法计算`, "INTERNAL", { role });
  }
  return found;
}

/**
 * 两条必须专门写测试的约定：
 *
 * 1. 奥伯伦是【双向】盲区——他看不到任何坏人，任何坏人也看不到他。
 *    只实现一个方向是最常见的错，而且两个方向的 bug 表现完全不同。
 * 2. MERLIN_OR_MORGANA 的 playerIds 必须按 id 升序。
 *    若按 [梅林, 莫甘娜] 生成，内容测试全会过，但 prompt 一渲染
 *    派西维尔每局都能秒选第一个——这是本项目最隐蔽的信息泄漏点。
 *
 * 返回数组同样按 playerId 排序，消除任何残留的顺序信息。
 */
export function getKnownIdentities(
  viewerId: PlayerId,
  players: readonly Player[],
): Knowledge[] {
  const viewer = players.find((p) => p.id === viewerId);
  if (!viewer) {
    // 只有 toPlayerView 会调用本函数，座位号不存在即为引擎自身的 bug
    throw new EngineError(`座位 ${viewerId} 不存在，无法计算可见性`, "INTERNAL", {
      viewerId,
      playerCount: players.length,
    });
  }

  const known = collect(viewer, players);
  return known.sort((a, b) => sortKey(a) - sortKey(b));
}

/** 按 viewer 的角色分派。每个分支都产出新数组，绝不改动传入的 players */
function collect(viewer: Player, players: readonly Player[]): Knowledge[] {
  switch (viewer.role) {
    case "MERLIN":
      return players
        .filter((p) => EVIL_VISIBLE_TO_MERLIN.has(p.role))
        .map((p) => ({ kind: "IS_EVIL", playerId: p.id }));

    case "PERCIVAL": {
      const merlin = requirePlayerByRole(players, "MERLIN");
      const morgana = requirePlayerByRole(players, "MORGANA");
      // 升序是硬约束，不是美观问题：见函数头注释第 2 条
      const playerIds: [PlayerId, PlayerId] =
        merlin.id < morgana.id ? [merlin.id, morgana.id] : [morgana.id, merlin.id];
      return [{ kind: "MERLIN_OR_MORGANA", playerIds }];
    }

    // 奥伯伦不在 EVIL_CONSPIRACY 里，所以走不到下面这条分支——他看不到任何人。
    // 忠臣同理，没有任何额外信息。两者显式写出来，让"这是刻意的空"在代码里看得见。
    case "OBERON":
    case "LOYAL_SERVANT":
      return [];

    case "MORGANA":
    case "ASSASSIN":
    case "MORDRED":
    case "MINION":
      return players
        .filter((p) => p.id !== viewer.id && EVIL_CONSPIRACY.has(p.role))
        .map((p) => ({ kind: "IS_EVIL", playerId: p.id }));
  }
}
