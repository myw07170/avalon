"use client";

/**
 * 观战的身份牌堆。**默认一桌牌全扣着**，点一张翻开那一座。
 *
 * 【为什么不是一上来就铺开】引擎那边 SpectatorView.roles 是全量的，全显示出来
 * 技术上毫无障碍——但那样"谁在撒谎"就没有悬念了，而那恰好是观战唯一好看的地方。
 * 交给观战者自己翻，当推理题看和当剧场看就都成立，还能在同一局里随时切。
 *
 * 【翻牌的动作复用 FlipCard】那套 3D 翻牌在 RoleCard 上已经有了，
 * 观战不该另画一种——玩家在这个项目里见到的"翻身份"始终是同一个动作。
 */
import { useAtomValue, useSetAtom } from "jotai";
import { useReducedMotion } from "framer-motion";
import { useMessages } from "@/i18n/useMessages";
import { cn } from "@/lib/utils";
import {
  hideAllSeatsAtom,
  revealAllSeatsAtom,
  revealedSeatsAtom,
  toggleSeatAtom,
  viewAtom,
} from "@/store/game";
import { FlipCard, TableMotif } from "./FlipCard";
import { describeCast, type CastSeat } from "./spectator-model";

export function IdentityDeck() {
  const view = useAtomValue(viewAtom);
  const revealed = useAtomValue(revealedSeatsAtom);
  const toggleSeat = useSetAtom(toggleSeatAtom);
  const revealAll = useSetAtom(revealAllSeatsAtom);
  const hideAll = useSetAtom(hideAllSeatsAtom);
  const msg = useMessages();
  const reduced = useReducedMotion() === true;

  // 观战屏只在 isSpectatingAtom 为真时挂载，所以这一支走不到；判空是为了收窄类型
  if (!view || view.selfId !== null) return null;

  const cast = describeCast(view, revealed, msg);
  const allUp = revealed.size === cast.length;

  return (
    <section className="w-full">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xs tracking-[var(--track-3)] text-muted">
          {msg.spectator.deckTitle}
        </h2>
        <div className="flex items-center gap-3">
          <span className="tabular text-xs text-muted">
            {msg.spectator.revealedCount(revealed.size, cast.length)}
          </span>
          <button
            type="button"
            onClick={() => (allUp ? hideAll() : revealAll())}
            className="rounded-lg border border-ink-line bg-ink-raised px-3 py-1.5 text-xs text-muted transition-colors hover:border-muted hover:text-vellum"
          >
            {allUp ? msg.spectator.hideAll : msg.spectator.revealAll}
          </button>
        </div>
      </header>

      {/* 横向滚动而不是换行：十张牌换行会把发言流挤下去半屏，
          而这一排是随时瞥一眼的东西，不该占那么多垂直空间 */}
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {cast.map((seat) => (
          <li key={seat.id} className="shrink-0">
            <Card seat={seat} reduced={reduced} onToggle={() => toggleSeat(seat.id)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Card({
  seat,
  reduced,
  onToggle,
}: {
  seat: CastSeat;
  reduced: boolean;
  onToggle: () => void;
}) {
  const msg = useMessages();

  return (
    <FlipCard
      flipped={seat.revealed}
      reduced={reduced}
      onToggle={onToggle}
      label={
        seat.revealed ? msg.spectator.hideAria(seat.id) : msg.spectator.flipAria(seat.id)
      }
      className="h-28 w-20"
      back={
        <div className="flex size-full flex-col items-center justify-center gap-2 rounded-2xl border border-ink-line bg-ink-raised px-1">
          <TableMotif className="size-8" />
          <p className="tabular text-[10px] text-muted">{seat.id}</p>
        </div>
      }
      front={
        <div
          className={cn(
            "flex size-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 bg-ink-raised px-1.5 text-center",
            seat.team === "EVIL" ? "border-mordred/60" : "border-loyal/60",
          )}
        >
          <p className="tabular text-[10px] text-muted">{seat.id}</p>
          <p
            className={cn(
              "font-display text-xs leading-tight",
              seat.team === "EVIL" ? "text-mordred" : "text-loyal",
            )}
          >
            {seat.roleLabel}
          </p>
        </div>
      }
    />
  );
}
