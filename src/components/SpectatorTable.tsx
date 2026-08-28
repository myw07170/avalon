"use client";

/**
 * 观战中的一屏。与落座局的 Table 同一套零件（MissionTrack / SeatTable / SpeechFeed），
 * 换掉的只有两处：没有 ActionPanel（没有你的回合），多了节奏条、身份牌堆和心证面板。
 *
 * 【为什么不复用 GameShell 里的 Table 再加几个 if】那个组件的每一块都假定
 * "轮到你时 ActionPanel 会出现"，塞进三个观战专属的条件分支之后，两种形态
 * 会在同一段 JSX 里互相绊。两个组件各自读得懂，代价只有一份布局的重复。
 */
import { useAtomValue, useSetAtom } from "jotai";
import { useMessages } from "@/i18n/useMessages";
import { errorAtom, pausedAtom, resetGameAtom } from "@/store/game";
import { IdentityDeck } from "./IdentityDeck";
import { MindPanel } from "./MindPanel";
import { MissionTrack } from "./MissionTrack";
import { SeatTable } from "./SeatTable";
import { SpectatorBar } from "./SpectatorBar";
import { SpeechFeed } from "./SpeechFeed";
import { ThinkingIndicator } from "./ThinkingIndicator";

export function SpectatorTable() {
  const error = useAtomValue(errorAtom);
  const paused = useAtomValue(pausedAtom);
  const reset = useSetAtom(resetGameAtom);
  const msg = useMessages();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-8 px-5 py-10 sm:py-14">
      <p className="font-display text-xs tracking-[var(--track-3)] text-muted">
        <span className="-mr-[var(--track-3)]">
          {paused ? msg.spectator.paused : msg.spectator.badge}
        </span>
      </p>

      <MissionTrack />
      <SeatTable />
      <IdentityDeck />
      <SpeechFeed />

      {/* 没有人类回合，所以这是全屏唯一能看出"它还活着"的东西 */}
      <ThinkingIndicator />

      <SpectatorBar />
      <MindPanel />

      {error && (
        <p role="alert" className="max-w-md text-center text-sm text-mordred">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => reset()}
        className="rounded-lg border border-ink-line bg-ink-raised min-h-11 px-6 py-2.5 text-sm text-muted transition-colors hover:border-muted hover:text-vellum"
      >
        {msg.spectator.exit}
      </button>
    </main>
  );
}
