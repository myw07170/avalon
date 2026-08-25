/**
 * Jotai atoms。
 *
 * 【组件只能读 myViewAtom】gameStateAtom 是全知视角，任何组件读它都视为 bug。
 * 终局复盘面板也不例外——它读的是 view.reveal，那是引擎批准公开的部分。
 *
 * 阶段 5 实现，见 docs/todos.md。
 */
import { atom } from "jotai";
import type { GameState, PlayerId } from "@/lib/game/types";

/** 全知状态。只有引擎驱动层能写，组件一律不读 */
export const gameStateAtom = atom<GameState | null>(null);

/** 人类玩家的座位号，null 表示全 AI 观战局 */
export const mySeatAtom = atom<PlayerId | null>(null);
