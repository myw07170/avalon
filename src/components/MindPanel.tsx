"use client";

/**
 * 观战时的实时 AI 心证。这是"看 AI 玩"相对"看人玩"唯一多出来的东西。
 *
 * 【两道闸，性质完全不同，别搞混】
 * - `liveDecisionsAtom` 在有人落座时恒为空：那是**信息隔离**，对手的内心分析
 *   边打边读就是开天眼，与 reviewDecisionsAtom 的「终局之前恒空」同规格。
 * - `revealedSeatsAtom` 的筛选：那是**观战者给自己设的剧透闸**，可以随时撤销，
 *   而且不密封——翻开 3 号的心证，很可能顺带读到"我知道 5 号是坏人"。
 *   面板上那句 mindsSpoilerNote 就是为这件事写的，别删。
 *
 * 【默认收起】它是全屏最剧透的一块，展开该是一个明确的动作。
 */
import { useState } from "react";
import { useAtomValue } from "jotai";
import { useMessages } from "@/i18n/useMessages";
import { cn } from "@/lib/utils";
import { liveDecisionsAtom, revealedSeatsAtom, viewAtom } from "@/store/game";
import { describeMinds, type MindEntry } from "./spectator-model";

export function MindPanel() {
  const view = useAtomValue(viewAtom);
  const decisions = useAtomValue(liveDecisionsAtom);
  const revealed = useAtomValue(revealedSeatsAtom);
  const msg = useMessages();
  const [open, setOpen] = useState(false);

  // 观战屏只在 isSpectatingAtom 为真时挂载，所以这一支走不到；判空是为了收窄类型
  if (!view || view.selfId !== null) return null;

  const entries = describeMinds(view, decisions, revealed, msg);

  return (
    <section className="ui-panel w-full p-4 sm:p-5">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-medium text-muted">
          {msg.spectator.mindsTitle}
        </h2>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="ui-button"
        >
          {open ? msg.spectator.mindsCollapse : msg.spectator.mindsExpand}
        </button>
      </header>

      {open && (
        <>
          <p className="mb-3 rounded-lg border border-brass-line bg-brass-soft px-4 py-2.5 text-xs leading-relaxed text-brass">
            {msg.spectator.mindsSpoilerNote}
          </p>

          {entries.length === 0 ? (
            <p className="text-xs leading-relaxed text-muted">
              {revealed.size === 0 ? msg.spectator.mindsEmpty : msg.spectator.mindsWaiting}
            </p>
          ) : (
            <ol className="flex flex-col gap-2.5">
              {entries.map((entry) => (
                <Entry key={entry.key} entry={entry} />
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

function Entry({ entry }: { entry: MindEntry }) {
  return (
    <li className="rounded-lg border border-ink-line bg-ink-raised px-4 py-3">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
        <span className="text-vellum">{entry.seatLabel}</span>
        <span className={entry.team === "EVIL" ? "text-mordred" : "text-loyal"}>
          {entry.roleLabel}
        </span>
        <span className="text-muted">{entry.kindLabel}</span>
        {entry.latencyLabel && (
          <span className="tabular text-muted">{entry.latencyLabel}</span>
        )}
        {entry.flags.map((flag) => (
          <span
            key={flag}
            className="rounded border border-ink-line px-1.5 py-0.5 text-[10px] text-muted"
          >
            {flag}
          </span>
        ))}
      </p>
      <p className={cn("mt-1.5 text-sm leading-relaxed text-muted")}>{entry.reasoning}</p>
    </li>
  );
}
