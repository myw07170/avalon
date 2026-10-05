"use client";

/**
 * 观战中的一屏。与落座局的 Table 同一套零件（MissionTrack / SeatTable / SpeechFeed），
 * 换掉的只有两处：没有 ActionPanel（没有你的回合），多了节奏条、身份牌堆和心证面板。
 *
 * 【为什么不复用 GameShell 里的 Table 再加几个 if】两种形态仍各自组合内容，避免
 * 在同一段 JSX 里堆观战条件；只复用没有游戏语义的 InGameLayout 空间骨架。
 */
import { useAtomValue, useSetAtom } from "jotai";
import { useMessages } from "@/i18n/useMessages";
import { errorAtom, pausedAtom, restartGameAtom } from "@/store/game";
import { IdentityDeck } from "./IdentityDeck";
import { InGameLayout } from "./InGameLayout";
import { MindPanel } from "./MindPanel";
import { MissionTrack } from "./MissionTrack";
import { SeatTable } from "./SeatTable";
import { SpectatorBar } from "./SpectatorBar";
import { SpeechFeed } from "./SpeechFeed";
import { VoteMatrix } from "./VoteMatrix";

export function SpectatorTable() {
  const error = useAtomValue(errorAtom);
  const paused = useAtomValue(pausedAtom);
  const reset = useSetAtom(restartGameAtom);
  const msg = useMessages();

  return (
    <InGameLayout
      overview={
        <>
          <SeatTable />

          <MissionTrack />
          <VoteMatrix />

          <p className="text-xs font-medium text-muted">
            <span className="-mr-[var(--track-3)]">
              {paused ? msg.spectator.paused : msg.spectator.badge}
            </span>
          </p>

          <IdentityDeck />
        </>
      }
      conversation={<SpeechFeed />}
      controls={
        <>
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
        </>
      }
    />
  );
}
