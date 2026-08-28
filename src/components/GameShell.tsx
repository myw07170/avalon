"use client";

/**
 * 按 runStatusAtom 分支的外壳。
 *
 * 【观战没有加进 RunStatus，这是刻意的】原来这里写着"将来加观战之类的形态，
 * 加的是 RunStatus 的成员"。做的时候发现那样不对：runStatus 是**生命周期**
 * （建了没有、跑了没有、完了没有），而观战是与它**正交的形态**——观战局同样会
 * 经历 ready / running / finished 三档。加成第五个成员会立刻逼出
 * "spectating 之后是什么状态"这种答不上来的问题。
 *
 * 所以分岔是二维的：先按 runStatus 取生命周期，再在三档里各自按
 * isSpectatingAtom 二选一。switch 仍然是穷尽的。
 */
import { useAtomValue, useSetAtom } from "jotai";
import { LocaleGate } from "@/i18n/LocaleGate";
import { useMessages } from "@/i18n/useMessages";
import { LocaleSwitcher } from "@/i18n/LocaleSwitcher";
import { errorAtom, isSpectatingAtom, resetGameAtom, runStatusAtom } from "@/store/game";
import { ActionPanel } from "./ActionPanel";
import { GameOverPanel } from "./GameOverPanel";
import { MissionTrack } from "./MissionTrack";
import { RoleCard } from "./RoleCard";
import { SeatTable } from "./SeatTable";
import { SpeechFeed } from "./SpeechFeed";
import { SetupScreen } from "./SetupScreen";
import { SpectatorIntro } from "./SpectatorIntro";
import { SpectatorTable } from "./SpectatorTable";
import { ThinkingIndicator } from "./ThinkingIndicator";

/**
 * 【语言这两样挂在这里，而不是 layout.tsx】layout.tsx 与 page.tsx 都是
 * server component（page.tsx 的文件头明写了"保持 server component"），
 * 而这两个组件都要读 localeAtom。挂在这一层还顺带保证它们活过每一个 runStatus 分支——
 * 挂进 SetupScreen 的话，开局之后按钮就没了。
 */
export function GameShell() {
  return (
    <>
      <LocaleGate />
      <LocaleSwitcher />
      <Screen />
    </>
  );
}

function Screen() {
  const status = useAtomValue(runStatusAtom);
  const spectating = useAtomValue(isSpectatingAtom);

  switch (status) {
    // 配置报错也留在设置页：玩家要能看着报错把配置改对
    case "idle":
    case "error":
      return <SetupScreen />;

    case "ready":
      return spectating ? <SpectatorIntro /> : <RoleCard />;

    case "running":
      return spectating ? <SpectatorTable /> : <Table />;

    // 【终局两种形态共用一块】reveal 是引擎批准的公开面，观战也该看到全部。
    // 差别只有"你是谁、你赢没赢"那一行，由 describeGameOver 给 null 后面板自己换
    case "finished":
      return <GameOverPanel />;
  }
}

/** 对局中。轮到你时 ActionPanel 自己会出现，没轮到就什么都不画 */
function Table() {
  const error = useAtomValue(errorAtom);
  const reset = useSetAtom(resetGameAtom);
  const msg = useMessages();

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

      <SecondaryButton onClick={() => reset()}>{msg.shell.restart}</SecondaryButton>
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
