"use client";

/**
 * 按 runStatusAtom 分支的外壳。
 *
 * 四个分支都填齐了。分支本身不会再变——将来加"观战"之类的形态，
 * 加的是 RunStatus 的成员，switch 会当场提示这里漏了一支。
 */
import { useAtomValue, useSetAtom } from "jotai";
import { errorAtom, resetGameAtom, runStatusAtom } from "@/store/game";
import { ActionPanel } from "./ActionPanel";
import { GameOverPanel } from "./GameOverPanel";
import { MissionTrack } from "./MissionTrack";
import { RoleCard } from "./RoleCard";
import { SeatTable } from "./SeatTable";
import { SpeechFeed } from "./SpeechFeed";
import { SetupScreen } from "./SetupScreen";
import { ThinkingIndicator } from "./ThinkingIndicator";

export function GameShell() {
  const status = useAtomValue(runStatusAtom);

  switch (status) {
    // 配置报错也留在设置页：玩家要能看着报错把配置改对
    case "idle":
    case "error":
      return <SetupScreen />;

    case "ready":
      return <RoleCard />;

    case "running":
      return <Table />;

    case "finished":
      return <GameOverPanel />;
  }
}

/** 对局中。轮到你时 ActionPanel 自己会出现，没轮到就什么都不画 */
function Table() {
  const error = useAtomValue(errorAtom);
  const reset = useSetAtom(resetGameAtom);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-8 px-5 py-10 sm:py-14">
      <MissionTrack />
      <SeatTable />
      <SpeechFeed />

      {/* 没轮到你时这里是全屏唯一会动的东西——不给的话，慢和卡死长得一样 */}
      <ThinkingIndicator />

      <ActionPanel />

      {error && (
        <p role="alert" className="max-w-md text-center text-sm text-mordred">
          {error}
        </p>
      )}

      <SecondaryButton onClick={() => reset()}>重开</SecondaryButton>
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
