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
import { useCallback, useEffect, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { LocaleGate } from "@/i18n/LocaleGate";
import { useMessages } from "@/i18n/useMessages";
import { LocaleSwitcher } from "@/i18n/LocaleSwitcher";
import { ThemeSwitcher } from "@/theme/ThemeSwitcher";
import { isClientAuthRequired } from "@/lib/supabase/config";
import { errorAtom, isSpectatingAtom, resetGameAtom, runStatusAtom } from "@/store/game";
import { GameOverPanel } from "./GameOverPanel";
import { InGameLayout } from "./InGameLayout";
import { MissionTrack } from "./MissionTrack";
import { RoleCard } from "./RoleCard";
import { SeatTable } from "./SeatTable";
import { SpeechFeed } from "./SpeechFeed";
import { SetupScreen } from "./SetupScreen";
import { SpectatorIntro } from "./SpectatorIntro";
import { SpectatorTable } from "./SpectatorTable";
import { TutorialModal } from "./TutorialModal";
import { TeamDraftProvider } from "./TeamDraftContext";
import { AssassinationDraftProvider } from "./AssassinationDraftContext";
import { VoteMatrix } from "./VoteMatrix";
import { AuthGate } from "./AuthGate";
import { AccountSidebar, LocalAccountSidebar } from "./AccountSidebar";
import { defaultDraft, type SetupDraft } from "./setup-model";
import {
  readSavedAccountSidebarCollapsed,
  saveAccountSidebarCollapsed,
} from "./account-sidebar-state";

/**
 * 【语言与主题这三样挂在这里，而不是 layout.tsx】layout.tsx 与 page.tsx 都是
 * server component（page.tsx 的文件头明写了"保持 server component"），
 * 而这三个组件都要读客户端状态（前两个读 localeAtom，ThemeSwitcher 读 <html>
 * 上的 data-theme）。挂在这一层还顺带保证它们活过每一个 runStatus 分支——
 * 挂进 SetupScreen 的话，开局之后按钮就没了。
 *
 * 主题的**零闪烁**不靠这一层：那是 layout.tsx 的 <head> 里那段阻塞脚本干的，
 * 它早于首次绘制。这里这颗按钮只负责切换。
 */
export function GameShell() {
  return (
    <>
      <LocaleGate />
      {/* 低于 Dialog 的 z-40 / z-50：弹窗打开后这组控制必须退到幕布下面 */}
      <div className="fixed right-3 top-3 z-30 flex gap-2">
        <TutorialModal />
        <ThemeSwitcher />
        <LocaleSwitcher />
      </div>
      {/* 窄屏标题会横跨工具组所在的右半边；留出一小行，只在首屏把内容压到按钮下方 */}
      <div aria-hidden className="h-5 shrink-0 sm:hidden" />
      <AuthGate>
        <Screen />
      </AuthGate>
    </>
  );
}

function Screen() {
  const status = useAtomValue(runStatusAtom);
  const spectating = useAtomValue(isSpectatingAtom);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [setupDraft, setSetupDraft] = useState<SetupDraft>(() => defaultDraft());

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSidebarCollapsed(readSavedAccountSidebarCollapsed(window.localStorage));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((current) => {
      const next = !current;
      saveAccountSidebarCollapsed(window.localStorage, next);
      return next;
    });
  }, []);

  switch (status) {
    // 配置报错也留在设置页：玩家要能看着报错把配置改对
    case "idle":
    case "error":
      return (
        <div
          className={
            sidebarCollapsed
              ? "grid w-full flex-1 transition-[grid-template-columns] duration-200 lg:grid-cols-[4.25rem_minmax(0,1fr)]"
              : "grid w-full flex-1 transition-[grid-template-columns] duration-200 lg:grid-cols-[18rem_minmax(0,1fr)]"
          }
        >
          {isClientAuthRequired ? (
            <AccountSidebar
              collapsed={sidebarCollapsed}
              onToggleCollapsed={toggleSidebarCollapsed}
              setupDraft={setupDraft}
              onSetupDraftChange={setSetupDraft}
            />
          ) : (
            <LocalAccountSidebar
              collapsed={sidebarCollapsed}
              onToggleCollapsed={toggleSidebarCollapsed}
              setupDraft={setupDraft}
              onSetupDraftChange={setSetupDraft}
            />
          )}
          <SetupScreen draft={setupDraft} onDraftChange={setSetupDraft} />
        </div>
      );

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

/** 对局中。圆桌与右下操作台共享组队草稿，其余人类操作也统一从右栏进入。 */
function Table() {
  const error = useAtomValue(errorAtom);
  const reset = useSetAtom(resetGameAtom);
  const msg = useMessages();

  return (
    <TeamDraftProvider>
      <AssassinationDraftProvider>
        <div className="fixed left-3 top-3 z-30">
          <SecondaryButton onClick={() => reset()}>{msg.shell.restart}</SecondaryButton>
        </div>
        <InGameLayout
          overview={
            <>
              <SeatTable />
              <MissionTrack />
              <VoteMatrix />
            </>
          }
          conversation={<SpeechFeed enableActions />}
          controls={
            <>
              {error && (
                <p role="alert" className="max-w-md text-center text-sm text-mordred">
                  {error}
                </p>
              )}
            </>
          }
        />
      </AssassinationDraftProvider>
    </TeamDraftProvider>
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
