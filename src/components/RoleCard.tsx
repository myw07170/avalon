"use client";

/**
 * 看身份。翻牌，看清自己知道什么，然后开局。
 *
 * 【这一屏存在的理由】orchestrator 对 ACKNOWLEDGE 不走 onHumanAction
 * （decisionKindOf 返回 null 时直接落地），循环一起跑 ROLE_REVEAL 就被瞬间跳过。
 * store 里 "ready" 这一档就是为了给这张卡留出时间，见 store/game.ts 的注释。
 *
 * 【翻牌要玩家自己点】现实里就是这个动作；更实际的是旁边有人时，
 * 什么时候把身份亮出来该由玩家决定——所以还能再点一次盖回去。
 */
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useAtomValue, useSetAtom } from "jotai";
import { useMessages } from "@/i18n/useMessages";
import { cn } from "@/lib/utils";
import {
  viewAtom,
  resetGameAtom,
  runGameAtom,
  seatAvatarSeedAtom,
} from "@/store/game";
import { FlipCard, TableMotif } from "./FlipCard";
import { RoleKnowledge } from "./RoleKnowledge";
import { describeRole, type RoleBrief } from "./role-card-model";

export function RoleCard() {
  const view = useAtomValue(viewAtom);
  const avatarSeed = useAtomValue(seatAvatarSeedAtom);
  const msg = useMessages();
  const startRun = useSetAtom(runGameAtom);
  const reset = useSetAtom(resetGameAtom);
  const [flipped, setFlipped] = useState(false);
  const reduced = useReducedMotion();

  // 观战局走的是 SpectatorIntro（GameShell 按 isSpectatingAtom 分的岔），
  // 所以这里 selfId 必然不是 null。走到这一支说明状态不该出现，给句话别崩
  if (!view || view.selfId === null) {
    return (
      <Screen>
        <p className="text-sm text-muted">{msg.role.noSeat}</p>
        <SecondaryButton onClick={() => reset()}>{msg.shell.restart}</SecondaryButton>
      </Screen>
    );
  }

  const brief = describeRole(view, msg);

  return (
    <Screen>
      <p className="font-display text-xs tracking-[var(--track-3)] text-muted">
        {msg.role.seatLine(view.players.length, view.selfId)}
      </p>

      <RoleFlipCard
        flipped={flipped}
        reduced={reduced === true}
        onToggle={() => setFlipped((f) => !f)}
        brief={brief}
      />

      <AnimatePresence>
        {flipped && (
          <motion.div
            key="revealed"
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: reduced ? 0 : 0.28 }}
            className="flex w-full flex-col items-center gap-8"
          >
            <RoleKnowledge view={view} brief={brief} avatarSeed={avatarSeed} />

            <div className="flex w-full max-w-sm flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => startRun()}
                className="w-full rounded-lg bg-brass px-6 py-3.5 font-display text-lg tracking-[var(--track-3)] text-on-brass transition-colors hover:bg-brass/85"
              >
                <span className="-mr-[var(--track-3)]">{msg.role.start}</span>
              </button>
              <SecondaryButton onClick={() => reset()}>{msg.shell.restart}</SecondaryButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// 卡片
// ---------------------------------------------------------------------------

interface RoleFlipCardProps {
  flipped: boolean;
  reduced: boolean;
  onToggle: () => void;
  brief: RoleBrief;
}

/**
 * 身份卡的牌面。翻牌的机械部分在 FlipCard 里，与观战的身份牌堆共用。
 */
function RoleFlipCard({ flipped, reduced, onToggle, brief }: RoleFlipCardProps) {
  const msg = useMessages();
  const isEvil = brief.team === "EVIL";

  return (
    <FlipCard
      flipped={flipped}
      reduced={reduced}
      onToggle={onToggle}
      label={flipped ? msg.role.flipToBack : msg.role.flipToFront}
      className="aspect-[3/4] w-full max-w-sm sm:aspect-[4/5]"
      back={
        <div className="grid size-full place-content-center gap-6 rounded-2xl border border-ink-line bg-ink-raised">
          <TableMotif />
          <p className="font-display text-sm tracking-[var(--track-3)] text-muted">
            <span className="-mr-[var(--track-3)]">{msg.role.tapToReveal}</span>
          </p>
        </div>
      }
      front={
        <div
          className={cn(
            "flex size-full flex-col items-center justify-center gap-4 rounded-2xl border-2 bg-ink-raised px-7 text-center",
            isEvil ? "border-mordred/60" : "border-loyal/60",
          )}
        >
          <p
            className={cn(
              "font-display text-xs tracking-[var(--track-3)]",
              isEvil ? "text-mordred" : "text-loyal",
            )}
          >
            <span className="-mr-[var(--track-3)]">{brief.teamLabel}</span>
          </p>
          <h2 className="-mr-[var(--track-1)] font-display text-4xl tracking-[var(--track-1)]">
            {brief.label}
          </h2>
          <p className="text-sm leading-relaxed text-muted">{brief.ability}</p>
        </div>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// 小件
// ---------------------------------------------------------------------------

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-8 px-5 py-12 sm:py-16">
      {children}
    </main>
  );
}

function SecondaryButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-ink-line bg-ink-raised min-h-11 px-6 py-2.5 text-sm text-muted transition-colors hover:border-muted hover:text-vellum"
    >
      {children}
    </button>
  );
}
