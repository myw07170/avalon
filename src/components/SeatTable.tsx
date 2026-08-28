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
 */
import { useAtomValue } from "jotai";
import type { Messages } from "@/i18n/messages";
import { useMessages } from "@/i18n/useMessages";
import { cn } from "@/lib/utils";
import { myViewAtom } from "@/store/game";
import { SeatRing } from "./SeatRing";
import { describeTable, type SeatState } from "./seat-table-model";

export function SeatTable() {
  const view = useAtomValue(myViewAtom);
  const msg = useMessages();
  if (!view) return null;

  const table = describeTable(view, msg);

  return (
    <section className="w-full">
      <SeatRing
        count={view.players.length}
        marks={table.seats}
        seatLabel={(_id, mark) => seatDescription(table.seats, mark.id, msg)}
        center={
          <>
            <p className="font-display text-xs tracking-[var(--track-3)] text-muted">
              <span className="-mr-[var(--track-3)]">{table.phaseLabel}</span>
            </p>
            {table.progressLabel && (
              <p className="tabular mt-2 text-sm text-vellum">{table.progressLabel}</p>
            )}
            <p className="tabular mt-2 text-[11px] text-muted">{table.roundLabel}</p>
          </>
        }
      />

      <p aria-live="polite" className="mt-5 text-center text-sm text-vellum">
        {table.statusLine}
      </p>

      <Legend seats={table.seats} />
    </section>
  );
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
        <span className="grid size-3.5 place-content-center rounded-full bg-loyal text-[8px] leading-none text-ink">
          ✓
        </span>
      ),
    });
  }
  if (seats.some((s) => s.tone === "evil")) {
    items.push({
      key: "evil",
      label: msg.role.toneLabel.evil,
      swatch: <span className="size-3 rounded-full border border-mordred bg-mordred/25" />,
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
