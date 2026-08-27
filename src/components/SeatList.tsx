/**
 * 窄屏下的座位列表 —— 圆桌的降级形态。
 *
 * 【为什么必须降级而不只是缩小】圆桌容器是 clamp(15rem, 78vw, 24rem)，而座位节点
 * 是固定 44px。所以屏幕越窄，节点越挤：360px 上跑 10 人局，每个 44px 的圆只离
 * 邻居 16px 左右，队长徽标和「在队伍里」的光环还都往节点外面伸。
 * 这正是 SeatGrid 文件头那句话的另一半——**圆桌是"看"的，窄屏上要能看清才行**。
 *
 * 【吃的是和圆桌完全一样的 SeatRingMark】所以四处调用方
 * （选座 / 身份卡 / 对局中 / 结算）一行都不用改，"圆桌只有一份"这条约定继续成立。
 *
 * 【四层信息在这里摊成四列】圆桌上它们靠配色、光环、徽标、角标区分；
 * 列表里有横向空间，直接写成字，反而比圆桌更好读：
 *   座位号 · 身份认知（tone 的文案）· 队长 · 在队伍里 · 已提交
 *
 * 本文件没有 "use client"：它只被客户端组件渲染，指令由那些文件带。
 */
import type { PlayerId } from "@/lib/game";
import { cn } from "@/lib/utils";
import { SEAT_TONE_LABEL } from "./role-card-model";
import { SEAT_TONE_CLASS, type SeatRingMark } from "./SeatRing";

export interface SeatListProps {
  count: number;
  marks?: SeatRingMark[];
  /** 给了才渲染成按钮。不给就是只读列表 */
  onSelect?: (id: PlayerId) => void;
  seatLabel?: (id: PlayerId, mark: SeatRingMark) => string;
}

const DEFAULT_MARK: SeatRingMark = { id: -1, tone: "plain" };

export function SeatList({ count, marks, onSelect, seatLabel }: SeatListProps) {
  const markOf = new Map(marks?.map((m) => [m.id, m]));

  return (
    <ul className="flex w-full flex-col gap-1.5">
      {Array.from({ length: count }, (_, id) => {
        const mark = markOf.get(id) ?? { ...DEFAULT_MARK, id };
        const label = seatLabel?.(id, mark) ?? `${id} 号座位`;

        // 选中态用光环，与圆桌上"在队伍里"、SeatGrid 里"已选中"是同一条视觉通道
        const row = cn(
          "flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm",
          "transition-[background-color,border-color,color] duration-300",
          SEAT_TONE_CLASS[mark.tone],
          mark.onTeam && "ring-2 ring-brass ring-offset-2 ring-offset-ink",
          onSelect && "hover:border-muted hover:text-vellum",
        );

        const inner = (
          <>
            <span aria-hidden className="tabular w-6 shrink-0 text-center">
              {id}
            </span>

            <span aria-hidden className="min-w-0 flex-1 truncate text-xs opacity-80">
              {SEAT_TONE_LABEL[mark.tone]}
            </span>

            <span aria-hidden className="flex shrink-0 items-center gap-1.5 text-[10px]">
              {mark.isLeader && (
                <span className="rounded-sm bg-brass px-1 leading-tight text-ink">队长</span>
              )}
              {mark.onTeam && (
                <span className="rounded-sm border border-brass px-1 leading-tight text-brass">
                  在队伍
                </span>
              )}
              {mark.status === "done" && (
                <span className="grid size-4 place-content-center rounded-full bg-loyal leading-none text-ink">
                  ✓
                </span>
              )}
              {mark.status === "acting" && (
                <span className="animate-pulse rounded-sm border border-muted px-1 leading-tight text-muted">
                  行动中
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
                aria-pressed={mark.tone === "self"}
                aria-label={label}
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
