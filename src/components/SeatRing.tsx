/**
 * 圆桌。SetupScreen 的选座器、RoleCard 的已知座位、对局中的 SeatTable、
 * 结算的全身份公开共用这一份——玩家从头到尾看到的是同一张桌子。
 *
 * **窄屏（< 640px）自动降级成 SeatList 的竖排列表**，见下面 SeatRing 的注释。
 *
 * 坐标来自 seat-ring.ts，头像来自 lib/seat-avatar.ts（都是纯函数，单独测）。这里只管画。
 * identicon 是座位身份，不承载局势：同一局不变，颜色仍完全由 tone 决定。
 *
 * 【四层信息各占一条视觉通道】一个座位可能同时是队长、在队伍里、还没投票、
 * 而且你知道他是坏人。压进一个颜色会互相盖掉，所以分开：
 *
 *   节点配色  -> tone，你的身份认知（一整局不变）
 *   外圈光环  -> onTeam，在本次提议的队伍里
 *   上方徽标  -> isLeader，队长
 *   右下角点  -> status，交没交
 *
 * 本文件没有 "use client"：它只被客户端组件渲染，指令由那些文件带。
 */
import type { PlayerId } from "@/lib/game";
import { useMessages } from "@/i18n/useMessages";
import { cn } from "@/lib/utils";
import type { SeatTone } from "./role-card-model";
import { SeatAvatar } from "./SeatAvatar";
import type { SeatStatus } from "./seat-table-model";
import { seatRingPositions } from "./seat-ring";
import { SeatList } from "./SeatList";

export interface SeatRingMark {
  id: PlayerId;
  tone: SeatTone;
  /** 在本次提议的队伍里 */
  onTeam?: boolean;
  isLeader?: boolean;
  status?: SeatStatus;
}

export interface SeatRingProps {
  count: number;
  /** 独立的 UI seed；绝不能传决定发牌的 GameConfig.seed */
  avatarSeed: number;
  /** 缺席的座位按 plain / idle 处理 */
  marks?: SeatRingMark[];
  /** 环心内容。SetupScreen 放阵营分配，对局里放阶段与进度 */
  center?: React.ReactNode;
  /** 给了才渲染成按钮。不给就是只读的展示环 */
  onSelect?: (id: PlayerId) => void;
  /** 交互模式下真正的选中项；不传时沿用选座页的 self tone 兼容语义。 */
  selectedIds?: readonly PlayerId[];
  /** 返回 true 的座位不能再选；已选座位仍应保持可取消。 */
  isDisabled?: (id: PlayerId) => boolean;
  seatLabel?: (id: PlayerId, mark: SeatRingMark) => string;
}

/**
 * tone -> 配色。新增 tone 只改这一处。
 *
 * 【unsure 的两个座位必须共用一套样式】派西维尔看到的那一对是刻意抹平过的，
 * 给其中一个多一点权重就把答案泄回去了。所以这里按 tone 给色，不按位置。
 *
 * 只有颜色，没有形状与尺寸——ActionPanel 的选人方块也用它，
 * 圆桌上的红圈和面板里的红块因此永远是同一个红。
 */
export const SEAT_TONE_CLASS: Record<SeatTone, string> = {
  plain: "border-ink-line bg-ink-raised text-muted",
  self: "border-brass bg-brass/20 text-vellum",
  evil: "border-mordred bg-mordred/25 text-vellum",
  unsure: "border-brass border-dashed bg-ink-raised text-brass",
  // 只出现在终局复盘。对局中没有任何一个座位配得上"确定是好人"
  good: "border-loyal bg-loyal/20 text-vellum",
};

const INTERACTIVE_CLASS =
  "hover:border-muted hover:text-vellum data-[tone=self]:hover:border-brass";

const DEFAULT_MARK: SeatRingMark = { id: -1, tone: "plain" };

/**
 * 座位展示。**宽屏是圆桌，窄屏（< 640px）降级成列表。**
 *
 * 【降级用 CSS 断点，不用 matchMedia】三个理由，都不是风格问题：
 * - `display: none` 的那一半自动退出可访问性树，所以任何宽度下都恰好有一份在树里，
 *   不需要 aria-hidden 去手工维护
 * - SSR 与水合的输出完全一致，不引入 hydration mismatch（服务端读不到视口宽度）
 * - 项目至今没有一个 useMediaQuery，不为这件事开先例
 *
 * 【降级放在这一层，而不是让四处调用方各判一次】选座 / 身份卡 / 对局中 / 结算
 * 因此一行都不用改，"圆桌只有一份"这条约定继续成立。
 */
export function SeatRing(props: SeatRingProps) {
  const { count, avatarSeed, marks, center, onSelect, selectedIds, isDisabled, seatLabel } =
    props;

  return (
    <>
      <div className="w-full sm:hidden">
        {center && <div className="mb-3 text-center">{center}</div>}
        <SeatList
          count={count}
          avatarSeed={avatarSeed}
          marks={marks}
          onSelect={onSelect}
          selectedIds={selectedIds}
          isDisabled={isDisabled}
          seatLabel={seatLabel}
        />
      </div>

      <div className="hidden sm:block">
        <Ring {...props} />
      </div>
    </>
  );
}

function Ring({
  count,
  avatarSeed,
  marks,
  center,
  onSelect,
  selectedIds,
  isDisabled,
  seatLabel,
}: SeatRingProps) {
  const msg = useMessages();
  const markOf = new Map(marks?.map((m) => [m.id, m]));
  const selected = selectedIds ? new Set(selectedIds) : null;

  return (
    <div className="relative mx-auto aspect-square w-[clamp(15rem,78vw,24rem)]">
      {/* 环。inset 12% 对应 seat-ring 的 SEAT_RING_RADIUS = 38 */}
      <div className="absolute inset-[12%] rounded-full border border-ink-line" />

      {center && (
        <div className="absolute inset-0 grid place-content-center text-center">
          {center}
        </div>
      )}

      {seatRingPositions(count).map((point) => {
        const mark = markOf.get(point.id) ?? { ...DEFAULT_MARK, id: point.id };
        const label = seatLabel?.(point.id, mark) ?? msg.seat.short(point.id);
        const pressed = selected?.has(point.id) ?? mark.tone === "self";
        const disabled = isDisabled?.(point.id) === true;

        // 光环画在外层：节点自己的 border 归 tone 用，两者不打架
        const wrapper = cn(
          "absolute -translate-x-1/2 -translate-y-1/2 rounded-full",
          "transition-[left,top] duration-300",
          mark.onTeam && "ring-2 ring-brass ring-offset-2 ring-offset-ink",
        );
        const node = cn(
          "relative flex size-11 flex-col items-center justify-center gap-0.5 rounded-full border",
          "transition-[background-color,border-color,color] duration-300",
          SEAT_TONE_CLASS[mark.tone],
          mark.status === "acting" && "animate-pulse",
          onSelect && !disabled && INTERACTIVE_CLASS,
        );
        const style = { left: `${point.leftPercent}%`, top: `${point.topPercent}%` };
        const badges = (
          <>
            {mark.isLeader && (
              <span
                aria-hidden
                className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-sm bg-brass px-1 text-[9px] leading-tight text-on-brass"
              >
                {msg.seat.leader}
              </span>
            )}
            {mark.status === "done" && (
              <span
                aria-hidden
                className="absolute -bottom-0.5 -right-0.5 grid size-4 place-content-center rounded-full border border-ink bg-loyal text-[9px] leading-none text-on-loyal"
              >
                ✓
              </span>
            )}
          </>
        );

        return onSelect ? (
          <button
            key={point.id}
            type="button"
            data-tone={mark.tone}
            aria-pressed={pressed}
            aria-label={label}
            disabled={disabled}
            onClick={() => onSelect(point.id)}
            style={style}
            className={cn(wrapper, disabled && "cursor-not-allowed opacity-40")}
          >
            <span className={node}>
              <SeatAvatar
                seed={avatarSeed}
                id={point.id}
                className="size-5 shrink-0 fill-current opacity-75"
              />
              <span className="tabular text-[10px] leading-none">{point.id}</span>
            </span>
            {badges}
          </button>
        ) : (
          <div
            key={point.id}
            role="img"
            aria-label={label}
            style={style}
            className={wrapper}
          >
            <span aria-hidden className={node}>
              <SeatAvatar
                seed={avatarSeed}
                id={point.id}
                className="size-5 shrink-0 fill-current opacity-75"
              />
              <span className="tabular text-[10px] leading-none">{point.id}</span>
            </span>
            {badges}
          </div>
        );
      })}
    </div>
  );
}
