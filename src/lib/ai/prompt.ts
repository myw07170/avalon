/**
 * PlayerView -> prompt 字符串。
 *
 * 【类型层面的防泄漏】本文件的函数签名只接受 AiDecisionRequest，永远不接受 GameState。
 * 谁想加一个 state 参数进来，就是在拆信息隔离，不要同意。
 *
 * 阶段 4 实现，见 docs/todos.md。
 */
import type { AiDecisionKind, AiDecisionRequest } from "../game/types";

/**
 * 结构：角色与能力（取 ROLE_META）→ 人设 → 当前局势（比分/轮次/否决数）
 *   → 历史（提议、投票、任务结果）→ 全场发言 → 本次决策 + 合法选项 → 输出格式。
 *
 * 发言长度限制 80-150 字写进 prompt。
 * 梅林"别把坏人名单说太明"的约束也写在这里，不写进引擎——那是策略失误不是非法操作。
 */
export function buildPrompt<K extends AiDecisionKind>(
  _req: AiDecisionRequest<K>,
): string {
  throw new Error("TODO 阶段 4：buildPrompt 未实现");
}
