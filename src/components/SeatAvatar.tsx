import type { PlayerId } from "@/lib/game";
import { SEAT_AVATAR_SIZE, seatAvatarCells } from "@/lib/seat-avatar";

export interface SeatAvatarProps {
  seed: number;
  id: PlayerId;
  className?: string;
}

/**
 * 纯装饰的座位纹章。精确座位号由旁边的数字和父节点 aria-label 表达，
 * 所以 SVG 不进入可访问性树，也不会给读屏器重复念一遍。
 */
export function SeatAvatar({ seed, id, className }: SeatAvatarProps) {
  const cells = seatAvatarCells(seed, id);

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${SEAT_AVATAR_SIZE} ${SEAT_AVATAR_SIZE}`}
      shapeRendering="crispEdges"
      className={className}
    >
      {cells.map((cell) => (
        <rect key={`${cell.x}:${cell.y}`} x={cell.x} y={cell.y} width="1" height="1" />
      ))}
    </svg>
  );
}
