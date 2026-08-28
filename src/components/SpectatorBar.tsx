"use client";

/**
 * 观战的节奏条：暂停 / 继续、四档速度。
 *
 * 【为什么只有观战需要它】落座时每一轮都会停在你的操作面板上，节奏由你自己定；
 * 观战没有任何一处会等人，一局要么太慢看不完、要么太快跟不上。这是观战屏上
 * 唯一可交互的东西（翻牌之外），少了它这一屏就是个只能干瞪眼的视频。
 *
 * 【中止不从这里走】`abortAtom` 故意不导出（store 文件头）。这里给的是暂停，
 * 「退出观战」仍然走 resetGameAtom——那是唯一受控的出口。
 */
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useMessages } from "@/i18n/useMessages";
import { cn } from "@/lib/utils";
import { paceMsAtom, pausedAtom, togglePauseAtom } from "@/store/game";
import { PACE_OPTIONS, paceKeyOf } from "./spectator-model";

export function SpectatorBar() {
  const [paceMs, setPaceMs] = useAtom(paceMsAtom);
  const paused = useAtomValue(pausedAtom);
  const togglePause = useSetAtom(togglePauseAtom);
  const msg = useMessages();

  const active = paceKeyOf(paceMs);

  return (
    <div className="flex w-full flex-wrap items-center justify-center gap-3">
      <span className="font-display text-xs tracking-[var(--track-3)] text-muted">
        {msg.spectator.pauseField}
      </span>

      <button
        type="button"
        onClick={() => togglePause()}
        aria-pressed={paused}
        className={cn(
          "min-h-11 rounded-lg border px-5 py-2 text-sm transition-colors",
          paused
            ? "border-brass bg-brass/15 text-vellum"
            : "border-ink-line bg-ink-raised text-muted hover:border-muted hover:text-vellum",
        )}
      >
        {paused ? msg.spectator.resume : msg.spectator.pause}
      </button>

      {/* 与 SetupScreen 的几组开关同一个做法：互斥单选用 radiogroup，
          读屏软件才报得出"4 选 2"，切换按钮报不出来 */}
      <div
        role="radiogroup"
        aria-label={msg.spectator.pauseField}
        className="flex gap-2"
      >
        {PACE_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={option.key === active}
            onClick={() => setPaceMs(option.ms)}
            className={cn(
              "min-h-11 rounded-lg border px-3 py-2 text-sm transition-colors",
              option.key === active
                ? "border-brass bg-brass/15 text-vellum"
                : "border-ink-line bg-ink-raised text-muted hover:border-muted hover:text-vellum",
            )}
          >
            {msg.spectator.pace[option.key]}
          </button>
        ))}
      </div>
    </div>
  );
}
