/**
 * 一份 PlayerView 对应的「你知道的」。
 *
 * RoleCard 与新手教程共用这一块：圆桌、图例、逐条说明和梅林的隐藏坏人提示
 * 因此不会在两个入口里长成两套。调用方负责用 describeRole 产出 brief，
 * 本组件只负责展示受限视角。
 */
import { useMessages } from "@/i18n/useMessages";
import type { PlayerView } from "@/lib/game";
import { cn } from "@/lib/utils";
import { SeatRing } from "./SeatRing";
import type { RoleBrief, SeatTone } from "./role-card-model";

export interface RoleKnowledgeProps {
  view: PlayerView;
  brief: RoleBrief;
  avatarSeed: number;
  /** 教程里即使没有额外信息也保留整张桌，让“全是未知”本身可见 */
  showTableWhenEmpty?: boolean;
}

export function RoleKnowledge({
  view,
  brief,
  avatarSeed,
  showTableWhenEmpty = false,
}: RoleKnowledgeProps) {
  const msg = useMessages();
  // 只列这一份视角真的出现过的 tone。全列会让玩家以为自己漏看了什么。
  const present = new Set(brief.marks.map((mark) => mark.tone));
  const legend = LEGEND.filter((item) => present.has(item.tone));

  return (
    <section className="w-full">
      <h3 className="mb-4 text-center font-display text-xs tracking-[var(--track-3)] text-muted">
        {msg.role.knowledgeTitle}
      </h3>

      {(brief.hasKnownSeats || showTableWhenEmpty) && (
        <>
          <SeatRing
            count={view.players.length}
            avatarSeed={avatarSeed}
            marks={brief.marks}
            seatLabel={(id, mark) =>
              msg.turn.joinSeatParts([msg.seat.short(id), msg.role.toneLabel[mark.tone]])
            }
          />
          <ul className="mx-auto mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2">
            {legend.map((item) => (
              <li key={item.tone} className="flex items-center gap-2 text-xs text-muted">
                <span aria-hidden className={cn("size-3 rounded-full border", item.swatch)} />
                {msg.role.toneLabel[item.tone]}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mx-auto mt-6 max-w-md space-y-2 text-center">
        {brief.lines.map((line) => (
          <p key={line} className="text-sm leading-relaxed text-vellum">
            {line}
          </p>
        ))}
        {brief.hiddenEvilHint && (
          <p className="pt-1 text-xs leading-relaxed text-muted">{brief.hiddenEvilHint}</p>
        )}
      </div>
    </section>
  );
}

/**
 * 图例只管配色，文字走 role.toneLabel。
 * unsure 的两个座位必须完全同权，不能按位置加任何视觉权重。
 */
const LEGEND: ReadonlyArray<{ tone: SeatTone; swatch: string }> = [
  { tone: "self", swatch: "border-brass bg-brass-soft" },
  { tone: "evil", swatch: "border-mordred bg-mordred-soft" },
  { tone: "unsure", swatch: "border-brass border-dashed" },
];
