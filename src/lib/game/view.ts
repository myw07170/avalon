/**
 * GameState -> PlayerView 的唯一转换点。
 *
 * 这个文件是信息隔离的最后一道防线。改动它的任何一行都必须跑 view.leak.test.ts。
 *
 * 阶段 3 实现，见 docs/todos.md。
 */
import type { GameState, PlayerId, PlayerView } from "./types";

/**
 * 三条不能破的规则：
 * - missionHistory 映射成 PublicMissionRecord，丢弃 cards（任务票来源永不公开）
 * - state.pending 的任何内容都不进去，只折算成 progress 的两个数字和 selfSubmitted
 * - reveal 仅在 GAME_OVER 时填充
 */
export function toPlayerView(
  _state: GameState,
  _playerId: PlayerId,
): PlayerView {
  throw new Error("TODO 阶段 3：toPlayerView 未实现");
}
