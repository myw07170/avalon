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
import type { PlayerView } from "@/lib/game";
import { useMessages } from "@/i18n/useMessages";
import { cn } from "@/lib/utils";
import { viewAtom, personaNotesAtom, resetGameAtom, runGameAtom } from "@/store/game";
import { FlipCard, TableMotif } from "./FlipCard";
import { SeatRing } from "./SeatRing";
import { describeRole, type RoleBrief, type SeatTone } from "./role-card-model";

export function RoleCard() {
  const view = useAtomValue(viewAtom);
  const msg = useMessages();
  const personaNotes = useAtomValue(personaNotesAtom);
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

      {/* 【回退绝不静默】人设生成失败会让一桌 AI 说话雷同，不说清楚的话，
          你会去改 prompt 而不是去看这一行（rules.md §6）。
          SetupScreen 点完就卸载了，所以这句话只能落在这一屏 */}
      <PersonaNotes notes={personaNotes} />

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
            <Knowledge view={view} brief={brief} />

            <div className="flex w-full max-w-sm flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => startRun()}
                className="w-full rounded-lg bg-brass px-6 py-3.5 font-display text-lg tracking-[var(--track-3)] text-ink transition-colors hover:bg-brass/85"
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
// 你知道的
// ---------------------------------------------------------------------------

function Knowledge({ view, brief }: { view: PlayerView; brief: RoleBrief }) {
  const msg = useMessages();
  // 只列这一局真的出现过的 tone：梅林和坏人只会有 evil，派西维尔只会有 unsure，
  // 全列出来会让玩家以为自己漏看了什么
  const present = new Set(brief.marks.map((m) => m.tone));
  const legend = LEGEND.filter((item) => present.has(item.tone));

  return (
    <section className="w-full">
      <h3 className="mb-4 text-center font-display text-xs tracking-[var(--track-3)] text-muted">
        {msg.role.knowledgeTitle}
      </h3>

      {brief.hasKnownSeats && (
        <>
          <SeatRing
            count={view.players.length}
            marks={brief.marks}
            seatLabel={(id, mark) =>
              msg.turn.joinSeatParts([msg.seat.short(id), msg.role.toneLabel[mark.tone]])
            }
          />
          <ul className="mx-auto mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2">
            {legend.map((item) => (
              <li key={item.tone} className="flex items-center gap-2 text-xs text-muted">
                <span className={cn("size-3 rounded-full border", item.swatch)} />
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
 * 图例只管"哪一档配哪个色"，文字走 msg.role.toneLabel。
 *
 * 【原来这里另有一套短文案】"你知道是坏人" vs 座位上的"你知道他是坏人"——
 * 同一件事的两份措辞，差一个字，谁也不会记得同步。合成一份。
 */
const LEGEND: ReadonlyArray<{ tone: SeatTone; swatch: string }> = [
  { tone: "self", swatch: "border-brass bg-brass/20" },
  { tone: "evil", swatch: "border-mordred bg-mordred/25" },
  // 【这一条的两个座位共用同一个样式】派西维尔看到的那一对是引擎刻意抹平过的，
  // 图例上也不能暗示其中一个更像梅林
  { tone: "unsure", swatch: "border-brass border-dashed" },
];

// ---------------------------------------------------------------------------
// 小件
// ---------------------------------------------------------------------------

/** 人设生成的打点。成功那条也显示——它顺带告诉玩家这一桌是谁 */
function PersonaNotes({ notes }: { notes: readonly string[] }) {
  if (notes.length === 0) return null;

  return (
    <ul className="w-full max-w-sm space-y-1">
      {notes.map((note, i) => (
        <li
          key={i}
          className="break-words rounded-lg border border-ink-line bg-ink-raised px-3 py-2 text-xs leading-relaxed text-muted"
        >
          {note}
        </li>
      ))}
    </ul>
  );
}

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
