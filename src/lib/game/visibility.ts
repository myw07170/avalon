/**
 * 可见性矩阵，rules.md §3.3 的唯一实现。
 *
 * 整个项目最容易写错、错了又最难发现的一块。规则散落到别处就等于放弃了信息隔离。
 *
 * 阶段 2 实现，见 docs/todos.md。
 */
import type { Knowledge, Player, PlayerId } from "./types";

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
  _viewerId: PlayerId,
  _players: readonly Player[],
): Knowledge[] {
  throw new Error("TODO 阶段 2：getKnownIdentities 未实现");
}
