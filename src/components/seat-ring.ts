/**
 * 圆桌座位的圆周坐标。
 *
 * 纯函数、无 React、无 DOM——所以它能用 .ts 测试直接覆盖，
 * 也能被 SetupScreen 的选座器和对局中的 SeatTable 共用一份。
 *
 * 【为什么给百分比而不是像素】容器用 aspect-square + clamp() 定尺寸，
 * 从 320px 的手机到桌面端只是同一个环在缩放，这里一行都不用改。
 */
import type { PlayerId } from "@/lib/game";

export interface SeatPoint {
  id: PlayerId;
  /** 圆心为 (50, 50) 的百分比坐标，直接塞进 style 的 left / top */
  leftPercent: number;
  topPercent: number;
}

/**
 * 环的半径，占容器的百分比。
 *
 * 不是 50：座位节点本身有大小，它的中心落在环上，边缘会往外溢出半个节点。
 * 留 12 个点的余量，容器就不必再套一层 padding。
 */
export const SEAT_RING_RADIUS = 38;

/**
 * 座位沿圆周的位置。**0 号位在正下方，序号顺时针递增**。
 *
 * 0 号在下方是因为人类默认坐 0 号——视线先落在自己身上，
 * 而不是先落在一个陌生 AI 上。顺时针递增对应"轮到你左手边"的常规牌序。
 */
export function seatRingPositions(
  count: number,
  radius: number = SEAT_RING_RADIUS,
): SeatPoint[] {
  if (!Number.isInteger(count) || count <= 0) return [];

  return Array.from({ length: count }, (_, id) => {
    const angle = (id / count) * Math.PI * 2;
    return {
      id,
      // 屏幕坐标 y 向下，所以 +cos 是下方；-sin 让序号顺时针走
      leftPercent: 50 - radius * Math.sin(angle),
      topPercent: 50 + radius * Math.cos(angle),
    };
  });
}
