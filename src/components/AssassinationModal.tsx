"use client";

/**
 * 刺杀面板。
 *
 * 【为什么这一步要抢过整个屏幕】它是整局唯一不可撤销、且当场决定胜负的动作。
 * 和别的操作并排放在页面底部，误触的代价是整局作废。所以用 Dialog：
 * 焦点被圈住、背景被压暗、Esc 与点击外部都能退出去。
 *
 * 【但必须能关掉】刺客决定前十有八九要回去重读发言流。关掉之后面板上留一个
 * 重新打开的入口，选中的目标也留着。
 *
 * 推导在 assassination-model.ts，那里解释了为什么奥伯伦标不出来。
 */
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { GameAction, PlayerId, PlayerView } from "@/lib/game";
import { cn } from "@/lib/utils";
import { SeatGrid } from "./SeatGrid";
import type { AssassinationForm } from "./action-panel-model";
import { describeStrike, strikeLabel } from "./assassination-model";
import type { FeedEntry } from "./speech-feed-model";

export interface AssassinationModalProps {
  form: AssassinationForm;
  view: PlayerView;
  submit: (action: GameAction) => void;
}

export function AssassinationModal({ form, view, submit }: AssassinationModalProps) {
  // 轮到你就直接打开：这一步没什么好预告的，多一次点击只是拖延
  const [open, setOpen] = useState(true);
  const [aimed, setAimed] = useState<PlayerId | null>(null);
  const [sent, setSent] = useState(false);

  const brief = describeStrike(form, view);
  const target = brief.targets.find((t) => t.id === aimed) ?? null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg bg-mordred px-6 py-3 font-display text-base tracking-[0.2em] text-vellum transition-colors hover:bg-mordred/85"
      >
        <span className="-mr-[0.2em]">打开刺杀面板</span>
      </button>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        关掉面板可以回去重读发言，随时能再打开；选好的目标会留着。
      </p>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-veil fixed inset-0 z-40 bg-ink/85 backdrop-blur-sm" />

          <Dialog.Content
            className={cn(
              "dialog-rise fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
              "flex max-h-[88dvh] w-[min(34rem,94vw)] flex-col overflow-y-auto",
              "rounded-2xl border border-mordred/50 bg-ink-raised",
            )}
          >
            <div className="px-6 pt-6">
              <p className="font-display text-[10px] tracking-[0.3em] text-mordred">
                <span className="-mr-[0.3em]">最后一步</span>
              </p>
              <Dialog.Title className="mt-2 -mr-[0.2em] font-display text-3xl tracking-[0.2em] text-vellum">
                {form.title}
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted">
                {form.hint}
              </Dialog.Description>
            </div>

            <div className="space-y-5 px-6 py-5">
              <Opinions entries={brief.opinions} allSilent={brief.allSilent} />

              <p className="rounded-lg border border-ink-line px-3 py-2.5 text-xs leading-relaxed text-muted">
                {brief.hiddenAllyHint}
              </p>

              <div>
                <p className="mb-2 text-xs text-muted">选一个人</p>
                <SeatGrid
                  seats={brief.targets}
                  selected={aimed === null ? [] : [aimed]}
                  onToggle={(id) => setAimed((prev) => (prev === id ? null : id))}
                />
              </div>
            </div>

            {/*
              卡片可能要滚动，而这一刀是唯一要紧的控件，钉在底部。

              【pb 要加 safe-area】iPhone 上 sticky bottom-0 正好压在 home indicator
              下面，按钮点不着。layout.tsx 的 viewport 里配了 viewport-fit: "cover"，
              env() 才有非零值
            */}
            <div
              className="sticky bottom-0 space-y-3 border-t border-ink-line bg-ink-raised px-6 pt-5"
              style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
            >
              {target?.risk && (
                <p role="alert" className="text-sm leading-relaxed text-mordred">
                  {target.risk}
                </p>
              )}

              <button
                type="button"
                disabled={!target || sent}
                onClick={() => {
                  if (!target) return;
                  setSent(true);
                  submit(target.action);
                }}
                className={cn(
                  "w-full rounded-lg px-6 py-3.5 font-display text-lg tracking-[0.2em] transition-colors",
                  "disabled:cursor-not-allowed disabled:border disabled:border-ink-line disabled:bg-transparent disabled:text-muted",
                  "bg-mordred text-vellum hover:bg-mordred/85",
                )}
              >
                <span className="-mr-[0.2em]">{strikeLabel(target)}</span>
              </button>

              <Dialog.Close asChild>
                <button
                  type="button"
                  className="w-full rounded-lg border border-ink-line min-h-11 px-6 py-2.5 text-sm text-muted transition-colors hover:border-muted hover:text-vellum"
                >
                  再想想
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

/**
 * 队友刚才当众说的推测。
 *
 * 这些是公开发言（assassination.ts 把它们记进 speeches，好人也听得到），
 * 搬进来只是省得玩家回去翻发言流。
 */
function Opinions({ entries, allSilent }: { entries: FeedEntry[]; allSilent: boolean }) {
  if (entries.length === 0) return null;

  return (
    <section>
      <h3 className="mb-2 font-display text-xs tracking-[0.3em] text-muted">
        <span className="-mr-[0.3em]">刚才的推测</span>
      </h3>

      {allSilent ? (
        // 一条条列「（没有开口）」是噪音，但"全场都没开口"这件事本身要说
        <p className="text-sm leading-relaxed text-muted">
          {entries.length} 个队友都没有开口，这一刀只能靠你自己。
        </p>
      ) : (
      <ol className="max-h-52 space-y-2.5 overflow-y-auto">
        {entries.map((entry) => (
          <li key={entry.seq} className="text-sm leading-relaxed">
            <span
              className={cn("tabular text-xs", entry.isSelf ? "text-brass" : "text-muted")}
            >
              {entry.playerId} 号 · {entry.isSelf ? "你" : entry.name}
            </span>
            {entry.isSilent ? (
              <p className="italic text-muted">（没有开口）</p>
            ) : (
              <p className="whitespace-pre-wrap break-words text-vellum">{entry.content}</p>
            )}
          </li>
        ))}
      </ol>
      )}
    </section>
  );
}
