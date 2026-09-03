import type { PlayerId } from "@/lib/game/types";

/**
 * PlayerId 是引擎内部的零基标识；玩家和模型看到的座位号从 1 开始。
 * 所有跨这条展示边界的代码都走这两个函数，避免局部的 `+ 1` / `- 1` 分叉。
 */
export function toDisplaySeatNumber(id: PlayerId): number {
  return id + 1;
}

export function fromDisplaySeatNumber(seatNumber: number): PlayerId {
  return seatNumber - 1;
}
