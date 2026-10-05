/**
 * 窄屏下的座位列表 —— 圆桌的降级形态。
 *
 * 【为什么必须降级而不只是缩小】圆桌容器是 clamp(15rem, 78vw, 24rem)，而座位节点
 * 是固定 44px。所以屏幕越窄，节点越挤：360px 上跑 10 人局，每个 44px 的圆只离
 * 邻居 16px 左右，队长徽标和「在队伍里」的光环还都往节点外面伸。
 * 这正是 SeatGrid 文件头那句话的另一半——**圆桌是"看"的，窄屏上要能看清才行**。
 *
 * 【吃的是和圆桌完全一样的 SeatRingMark + avatarSeed】所以选座、身份卡、对局中、
 * 结算不会各画一套，"圆桌只有一份"这条约定继续成立。
 *
 * 【四层信息在这里摊成四列】圆桌上它们靠配色、光环、徽标、角标区分；
 * 列表里有横向空间，直接写成字，反而比圆桌更好读：
 *   identicon + 座位号 · 身份认知（tone 的文案）· 队长 · 在队伍里 · 已提交
 *
 * 本文件没有 "use client"：它只被客户端组件渲染，指令由那些文件带。
 */
import type { PlayerId } from "@/lib/game";
import { useMessages } from "@/i18n/useMessages";
import { toDisplaySeatNumber } from "@/lib/seat-number";
import { cn } from "@/lib/utils";
import { SEAT_TONE_CLASS, type SeatRingMark } from "./SeatRing";
import { SeatAvatar } from "./SeatAvatar";

export interface SeatListProps {
  count: number;
  avatarSeed: number;
  marks?: SeatRingMark[];
  /** 给了才渲染成按钮。不给就是只读列表 */
  onSelect?: (id: PlayerId) => void;
  selectedIds?: readonly PlayerId[];
  isDisabled?: (id: PlayerId) => boolean;
  seatLabel?: (id: PlayerId, mark: SeatRingMark) => string;
}

const DEFAULT_MARK: SeatRingMark = { id: -1, tone: "plain" };

export function SeatList({
  count,
  avatarSeed,
  marks,
  onSelect,
  selectedIds,
  isDisabled,
  seatLabel,
}: SeatListProps) {
  const msg = useMessages();
  const markOf = new Map(marks?.map((m) => [m.id, m]));
  const selected = selectedIds ? new Set(selectedIds) : null;

  return (
    <ul className="flex w-full flex-col gap-1.5">
      {Array.from({ length: count }, (_, id) => {
        const mark = markOf.get(id) ?? { ...DEFAULT_MARK, id };
        const label = seatLabel?.(id, mark) ?? msg.seat.short(id);
        const pressed = selected?.has(id) ?? mark.tone === "self";
        const disabled = isDisabled?.(id) === true;

        // 选中态用光环，与圆桌上"在队伍里"、SeatGrid 里"已选中"是同一条视觉通道
        const row = cn(
          "flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm",
          "transition-[background-color,border-color,color] duration-300",
          SEAT_TONE_CLASS[mark.tone],
          mark.onTeam && "ring-2 ring-brass ring-offset-2 ring-offset-ink",
          onSelect && !disabled && "hover:border-muted hover:text-vellum",
          disabled && "cursor-not-allowed",
        );

        const inner = (
          <>
            <SeatAvatar
              seed={avatarSeed}
              id={id}
              className="size-10 shrink-0"
            />

            <span aria-hidden className="tabular w-6 shrink-0 text-center">
              {toDisplaySeatNumber(id)}
            </span>

            <span aria-hidden className="min-w-0 flex-1 truncate text-xs">
              {msg.role.toneLabel[mark.tone]}
            </span>

            <span aria-hidden className="flex shrink-0 items-center gap-1.5 text-[10px]">
              {mark.isLeader && (
                <span className="rounded-sm bg-brass px-1 leading-tight text-on-brass">
                  {msg.seat.leader}
                </span>
              )}
              {mark.onTeam && (
                <span className="rounded-sm border border-brass px-1 leading-tight text-brass">
                  {msg.table.onTeam}
                </span>
              )}
              {mark.status === "done" && (
                <span className="grid size-4 place-content-center rounded-full bg-loyal-fill leading-none text-on-loyal">
                  ✓
                </span>
              )}
              {mark.status === "acting" && (
                <span className=" rounded-sm border border-muted px-1 leading-tight text-muted">
                  {msg.table.acting}
                </span>
              )}
            </span>
          </>
        );

        return (
          <li key={id}>
            {onSelect ? (
              <button
                type="button"
                data-tone={mark.tone}
                aria-pressed={pressed}
                aria-label={label}
                disabled={disabled}
                onClick={() => onSelect(id)}
                className={row}
              >
                {inner}
              </button>
            ) : (
              <div role="img" aria-label={label} className={row}>
                {inner}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
