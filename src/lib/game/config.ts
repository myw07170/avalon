/**
 * 人数配置表与角色配置表，是 docs/rules.md §2 和 §3.2 的代码化。
 *
 * 这里的常量是规则的唯一副本。改数字之前先改 rules.md，否则两边会悄悄分叉。
 *
 * 阶段 1 实现，见 docs/todos.md。
 */
import type { GameConfig, MissionConfig, Role } from "./types";

/** 支持的人数范围 */
export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 10;

/** rules.md §4.2：同一轮否决达到此数，坏人直接获胜 */
export const DEFAULT_MAX_REJECTS = 5;

/**
 * rules.md §2：每轮任务的队伍规模与失败门槛。
 * 注意 7 人及以上第 4 轮（下标 3）的 failsRequired 是 2，这条最容易漏。
 */
export const MISSION_TABLE: Record<number, MissionConfig[]> = {};

/** rules.md §3.2：各人数的推荐角色配置 */
export const ROLE_PRESETS: Record<number, Role[]> = {};

/**
 * 断言配置自洽：roles 长度 == playerCount、坏人数量与 MISSION_TABLE 一致、
 * 梅林/派西维尔/莫甘娜/刺客各恰好 1 个。不满足抛 EngineError("CONFIG_INVALID")。
 */
export function validateConfig(_config: GameConfig): void {
  throw new Error("TODO 阶段 1：validateConfig 未实现");
}

/** 按人数产出默认配置，UI 的 SetupScreen 和测试都走它 */
export function createConfig(
  _playerCount: number,
  _overrides?: Partial<Pick<GameConfig, "roles" | "maxRejects" | "forcePassOnLastAttempt" | "seed">>,
): GameConfig {
  throw new Error("TODO 阶段 1：createConfig 未实现");
}
