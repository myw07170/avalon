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
import { cn } from "@/lib/utils";
import { myViewAtom } from "@/store/game";
import { SeatRing } from "./SeatRing";
import { describeTable, type SeatState } from "./seat-table-model";

export function SeatTable() {
  const view = useAtomValue(myViewAtom);
  if (!view) return null;

  const table = describeTable(view);

  return (
    <section className="w-full">
      <SeatRing
        count={view.players.length}
        marks={table.seats}
        seatLabel={(_id, mark) => seatDescription(table.seats, mark.id)}
        center={
          <>
            <p className="font-display text-xs tracking-[0.3em] text-muted">
              <span className="-mr-[0.3em]">{table.phaseLabel}</span>
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
function seatDescription(seats: SeatState[], id: number): string {
  const seat = seats.find((s) => s.id === id);
  if (!seat) return `${id} 号座位`;

  const parts = [`${seat.id} 号`, seat.isSelf ? "你" : seat.name];
  if (seat.isLeader) parts.push("队长");
  if (seat.onTeam) parts.push("在队伍里");
  if (seat.status === "acting") parts.push("正在行动");
  if (seat.status === "done") parts.push("已提交");
  if (seat.tone === "evil") parts.push("你知道他是坏人");
  if (seat.tone === "unsure") parts.push("梅林与莫甘娜二者之一");
  return parts.join("，");
}

/**
 * 图例只列这一局真的出现过的标记。
 * 队伍和队长在不同阶段来去，全列出来会让玩家找不存在的东西。
 */
function Legend({ seats }: { seats: SeatState[] }) {
  const items: Array<{ key: string; label: string; swatch: React.ReactNode }> = [];

  if (seats.some((s) => s.onTeam)) {
    items.push({
      key: "team",
      label: "在队伍里",
      swatch: <span className="size-2.5 rounded-full bg-ink-raised ring-2 ring-brass" />,
    });
  }
  if (seats.some((s) => s.status === "done")) {
    items.push({
      key: "done",
      label: "已提交",
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
      label: "你知道是坏人",
      swatch: <span className="size-3 rounded-full border border-mordred bg-mordred/25" />,
    });
  }
  if (seats.some((s) => s.tone === "unsure")) {
    items.push({
      key: "unsure",
      // 【两个座位共用一条图例】引擎刻意抹平了这一对的顺序，
      // 图例上也不能暗示其中一个更像梅林
      label: "梅林与莫甘娜二者之一",
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
