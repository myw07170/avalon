/**
 * 建局：洗牌发牌，产出初始 GameState。
 *
 * 阶段 1 实现，见 docs/todos.md。
 */
import type { GameConfig, GameState, Persona, PlayerId, RngFn } from "./types";

export interface CreateGameOptions {
  config: GameConfig;
  /** 人类玩家的座位号，null 表示全 AI 观战局 */
  humanSeat: PlayerId | null;
  /** AI 人设，长度需覆盖所有非人类座位 */
  personas: Persona[];
  rng: RngFn;
}

/**
 * 产出 phase 为 ROLE_REVEAL 的初始状态。
 *
 * 易错点：必须先 shuffle(ROLE_PRESETS[n]) 再按座位分配。
 * 直接按下标发牌，数量测试照样全绿，但每局梅林都固定在 0 号位。
 */
export function createGame(_options: CreateGameOptions): GameState {
  throw new Error("TODO 阶段 1：createGame 未实现");
}
