"use client";

/**
 * 对局中的圆桌。队长、队伍、谁还没交，加上你自己的身份认知。
 *
 * 【推导全在 seat-table-model.ts】这里只负责画。四层信息各占一条视觉通道，
 * 分配见 SeatRing 的文件头。
 *
 * 【身份认知在对局中一直显示】梅林知道谁是坏人，这一整局都不会忘——
 * 让他每轮重新回忆一遍座位号不是难度，是负担。这不构成泄漏：
 * 画出来的只有 view.knowledge 明确给他的那些座位。
 *
 * 【观战局走另一条染色路】那时没有 knowledge，改按已翻开座位的阵营染色。
 * 默认一张牌都没翻，所以观战的圆桌一开始与落座局长得一模一样。
 */
import { useAtomValue } from "jotai";
import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import type { Messages } from "@/i18n/messages";
import { useMessages } from "@/i18n/useMessages";
import { cn } from "@/lib/utils";
import {
  revealedRolesAtom,
  seatAvatarSeedAtom,
  thinkingAtom,
  viewAtom,
} from "@/store/game";
import { SeatRing } from "./SeatRing";
import { describeTable, type SeatState } from "./seat-table-model";
import { describeThinking } from "./thinking-indicator-model";
import { useOptionalAssassinationDraft } from "./AssassinationDraftContext";
import { useOptionalTeamDraft } from "./TeamDraftContext";

export function SeatTable() {
  const view = useAtomValue(viewAtom);
  const avatarSeed = useAtomValue(seatAvatarSeedAtom);
  const thinkingEntries = useAtomValue(thinkingAtom);
  // 落座局恒为 null；观战局只含**已翻开**的座位，过滤在 store 那一层做过了
  const roles = useAtomValue(revealedRolesAtom);
  const msg = useMessages();
  const teamDraft = useOptionalTeamDraft();
  const assassinationDraft = useOptionalAssassinationDraft();
  const thinking = view ? describeThinking(thinkingEntries, view.players, msg) : null;
  const thinkingSeconds = useElapsedSeconds(thinking?.startedAt ?? null);
  if (!view) return null;

  const table = describeTable(view, msg, roles);

  // TEAM_PROPOSAL 与 ASSASSINATION 互斥，同一时刻只可能有一个激活。
  // 两者共用 onTeam 这条光环视觉通道：圆桌上"被选中"就是被选中，不分组队还是刺杀
  const selection = teamDraft?.active
    ? {
        toggle: teamDraft.toggle,
        selected: teamDraft.selected,
        isDisabled: (id: number) => teamDraft.full && !teamDraft.selected.includes(id),
      }
    : assassinationDraft?.active
      ? {
          toggle: assassinationDraft.toggle,
          selected: assassinationDraft.selected,
          isDisabled: () => false,
        }
      : null;
  const selecting = selection !== null;
  const selected = new Set(selection?.selected ?? []);
  const seats = selecting
    ? table.seats.map((seat) => ({ ...seat, onTeam: selected.has(seat.id) }))
    : table.seats;

  const ring = (interactive: boolean) => (
    <SeatRing
      count={view.players.length}
      avatarSeed={avatarSeed}
      marks={seats}
      onSelect={interactive ? selection?.toggle : undefined}
      selectedIds={interactive ? selection?.selected : undefined}
      isDisabled={interactive ? selection?.isDisabled : undefined}
      seatLabel={(_id, mark) => seatDescription(seats, mark.id, msg)}
      center={
        thinking ? (
          <ThinkingCenter line={thinking.line} seconds={thinkingSeconds} msg={msg} />
        ) : (
          <>
            <p className="font-display text-xs tracking-[var(--track-3)] text-muted">
              <span className="-mr-[var(--track-3)]">{table.phaseLabel}</span>
            </p>
            {table.progressLabel && (
              <p className="tabular mt-2 text-sm text-vellum">{table.progressLabel}</p>
            )}
          </>
        )
      }
    />
  );

  return (
    <section className="w-full">
      {selecting ? (
        <>
          {/* 单列布局在右下操作区使用大触控块；这里保持只读，避免两处来回滚动。 */}
          <div className="lg:hidden">{ring(false)}</div>
          {/* 桌面端的圆桌就是选人器（组队 / 刺杀）。CSS 分岔保持 SSR 与水合输出一致。 */}
          <div className="hidden lg:block">{ring(true)}</div>
        </>
      ) : (
        ring(false)
      )}

      <p aria-live="polite" className="mt-5 text-center text-sm text-vellum">
        {table.statusLine}
      </p>

      <Legend seats={seats} />
    </section>
  );
}

function ThinkingCenter({
  line,
  seconds,
  msg,
}: {
  line: string;
  seconds: number;
  msg: Messages;
}) {
  return (
    <div role="status" aria-live="polite" className="mx-auto max-w-[11rem]">
      <LoaderCircle
        aria-hidden
        className="mx-auto size-5 animate-spin text-brass"
      />
      <p className="mt-2 text-sm leading-snug text-vellum">{line}</p>
      <p className="tabular mt-1 text-[11px] text-muted">{msg.thinking.seconds(seconds)}</p>
    </div>
  );
}

function useElapsedSeconds(startedAt: number | null): number {
  const [now, setNow] = useState(0);
  const [seen, setSeen] = useState(startedAt);

  if (seen !== startedAt) {
    setSeen(startedAt);
    setNow(startedAt ?? 0);
  }

  useEffect(() => {
    if (startedAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  if (startedAt === null) return 0;
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

/** 读屏用的一句话。把四层信息按同一个顺序念出来 */
function seatDescription(seats: SeatState[], id: number, msg: Messages): string {
  const seat = seats.find((s) => s.id === id);
  if (!seat) return msg.seat.short(id);

  const parts = [msg.seat.short(seat.id), seat.isSelf ? msg.seat.you : seat.name];
  if (seat.isLeader) parts.push(msg.seat.leader);
  if (seat.onTeam) parts.push(msg.table.onTeam);
  if (seat.status === "acting") parts.push(msg.table.acting);
  if (seat.status === "done") parts.push(msg.table.done);
  if (seat.tone === "evil") parts.push(msg.role.toneLabel.evil);
  if (seat.tone === "unsure") parts.push(msg.role.toneLabel.unsure);
  return msg.turn.joinSeatParts(parts);
}

/**
 * 图例只列这一局真的出现过的标记。
 * 队伍和队长在不同阶段来去，全列出来会让玩家找不存在的东西。
 */
function Legend({ seats }: { seats: SeatState[] }) {
  const msg = useMessages();
  const items: Array<{ key: string; label: string; swatch: React.ReactNode }> = [];

  if (seats.some((s) => s.onTeam)) {
    items.push({
      key: "team",
      label: msg.table.onTeam,
      swatch: <span className="size-2.5 rounded-full bg-ink-raised ring-2 ring-brass" />,
    });
  }
  if (seats.some((s) => s.status === "done")) {
    items.push({
      key: "done",
      label: msg.table.done,
      swatch: (
        <span className="grid size-3.5 place-content-center rounded-full bg-loyal-fill text-[8px] leading-none text-on-loyal">
          ✓
        </span>
      ),
    });
  }
  if (seats.some((s) => s.tone === "evil")) {
    items.push({
      key: "evil",
      label: msg.role.toneLabel.evil,
      swatch: <span className="size-3 rounded-full border border-mordred bg-mordred-soft" />,
    });
  }
  if (seats.some((s) => s.tone === "unsure")) {
    items.push({
      key: "unsure",
      // 【两个座位共用一条图例】引擎刻意抹平了这一对的顺序，
      // 图例上也不能暗示其中一个更像梅林
      label: msg.role.toneLabel.unsure,
      swatch: <span className="size-3 rounded-full border border-dashed border-brass" />,
    });
  }

  if (items.length === 0) return null;

  return (
    <ul className={cn("mx-auto mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2")}>
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-2 text-xs text-muted">
          {item.swatch}
          {item.label}
        </li>
      ))}
    </ul>
  );
}
