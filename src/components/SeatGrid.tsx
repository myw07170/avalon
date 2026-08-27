/**
 * 选座方块。ActionPanel 的组队选人和 AssassinationModal 的选目标共用这一份。
 *
 * 【选中用光环，跟圆桌上"在队伍里"是同一条视觉通道】节点配色仍归身份认知
 * （见 SeatRing 文件头的四层分配），两者不打架——梅林选人时那个红块还是红的，
 * 只是多了一圈黄铜。
 *
 * 【为什么不直接用 SeatRing】圆桌是"看"的，方块是"点"的。手机上圆周排布的节点
 * 又小又挨得近，而这里的每一次点击都要准；排成会换行的方块，触控区能给到 44px。
 *
 * 本文件没有 "use client"：它只被客户端组件渲染，指令由那些文件带。
 */
import type { PlayerId } from "@/lib/game";
import { cn } from "@/lib/utils";
import type { SeatChoice } from "./action-panel-model";
import { SEAT_TONE_CLASS } from "./SeatRing";

export interface SeatGridProps {
  seats: SeatChoice[];
  selected: PlayerId[];
  /** 返回 true 的座位点不动。选满之后用它挡住其余候选 */
  disabled?: (id: PlayerId) => boolean;
  onToggle: (id: PlayerId) => void;
}

export function SeatGrid({ seats, selected, disabled, onToggle }: SeatGridProps) {
  return (
    <ul className="flex flex-wrap gap-2">
      {seats.map((seat) => {
        const on = selected.includes(seat.id);
        const off = disabled?.(seat.id) === true;

        return (
          <li key={seat.id}>
            <button
              type="button"
              aria-pressed={on}
              aria-label={seat.label}
              disabled={off}
              onClick={() => onToggle(seat.id)}
              className={cn(
                "tabular flex min-h-11 items-baseline gap-1.5 rounded-lg border px-3 py-2 text-sm transition-all",
                SEAT_TONE_CLASS[seat.tone],
                on && "ring-2 ring-brass ring-offset-2 ring-offset-ink",
                off ? "opacity-35" : "hover:border-muted",
              )}
            >
              <span aria-hidden>{seat.id}</span>
              <span aria-hidden className="text-xs opacity-70">
                {seat.isSelf ? "你" : seat.name}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
