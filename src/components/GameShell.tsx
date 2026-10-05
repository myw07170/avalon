"use client";

import { useCallback, useEffect, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X, LogOut, RotateCcw } from "lucide-react";
import { LocaleGate } from "@/i18n/LocaleGate";
import { useMessages } from "@/i18n/useMessages";
import { isClientAuthRequired } from "@/lib/supabase/config";
import { errorAtom, isSpectatingAtom, restartGameAtom, runStatusAtom, saveAndExitAtom } from "@/store/game";
import { AppHeader } from "./AppHeader";
import { GameOverPanel } from "./GameOverPanel";
import { InGameLayout } from "./InGameLayout";
import { MissionTrack } from "./MissionTrack";
import { RoleCard } from "./RoleCard";
import { SeatTable } from "./SeatTable";
import { SpeechFeed } from "./SpeechFeed";
import { SetupScreen } from "./SetupScreen";
import { SpectatorIntro } from "./SpectatorIntro";
import { SpectatorTable } from "./SpectatorTable";
import { TeamDraftProvider } from "./TeamDraftContext";
import { AssassinationDraftProvider } from "./AssassinationDraftContext";
import { VoteMatrix } from "./VoteMatrix";
import { AuthGate } from "./AuthGate";
import { RecoveryBoundary } from "./RecoveryBoundary";
import { AccountSidebar, LocalAccountSidebar } from "./AccountSidebar";
import { defaultDraft, type SetupDraft } from "./setup-model";
import { readSavedAccountSidebarCollapsed, saveAccountSidebarCollapsed } from "./account-sidebar-state";

export function GameShell() {
  return <><LocaleGate /><AuthGate><RecoveryBoundary><Screen /></RecoveryBoundary></AuthGate></>;
}

function Screen() {
  const status = useAtomValue(runStatusAtom);
  const spectating = useAtomValue(isSpectatingAtom);
  const reset = useSetAtom(restartGameAtom);
  const saveExit = useSetAtom(saveAndExitAtom);
  const msg = useMessages();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [setupDraft, setSetupDraft] = useState<SetupDraft>(() => defaultDraft());
  const lobby = status === "idle" || status === "error";
  const playing = status === "ready" || status === "running";

  useEffect(() => {
    const timer = window.setTimeout(() => setSidebarCollapsed(readSavedAccountSidebarCollapsed(window.localStorage)), 0);
    // This query only closes an open drawer; CSS determines responsive layout.
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (desktop.matches) setMenuOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => { window.clearTimeout(timer); desktop.removeEventListener("change", closeOnDesktop); };
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((current) => {
      const next = !current;
      saveAccountSidebarCollapsed(window.localStorage, next);
      return next;
    });
  }, []);

  const Sidebar = isClientAuthRequired ? AccountSidebar : LocalAccountSidebar;
  const sidebarProps = { setupDraft, onSetupDraftChange: setSetupDraft };
  let content;
  switch (status) {
    case "idle":
    case "error":
      content = <div className={sidebarCollapsed
        ? "grid min-w-0 w-full flex-1 lg:grid-cols-[4.5rem_minmax(0,1fr)]"
        : "grid min-w-0 w-full flex-1 lg:grid-cols-[17rem_minmax(0,1fr)]"}>
        <div className="hidden min-w-0 lg:block"><Sidebar {...sidebarProps} collapsed={sidebarCollapsed} onToggleCollapsed={toggleSidebarCollapsed} /></div>
        <SetupScreen draft={setupDraft} onDraftChange={setSetupDraft} />
      </div>;
      break;
    case "ready": content = spectating ? <SpectatorIntro /> : <RoleCard />; break;
    case "running": content = spectating ? <SpectatorTable /> : <Table />; break;
    case "finished": content = <GameOverPanel />; break;
  }

  return <Dialog.Root open={menuOpen && lobby} onOpenChange={setMenuOpen}>
    <AppHeader leading={lobby && <Dialog.Trigger asChild><button type="button" className="ui-button px-2.5 lg:hidden" aria-label={msg.ui.menu}><Menu className="size-5" aria-hidden /></button></Dialog.Trigger>}
      actions={playing && <>
        {status === "running" && !spectating && <button type="button" onClick={() => reset()} className="ui-button" aria-label={msg.shell.restart}><RotateCcw className="size-4" aria-hidden /><span className="hidden sm:inline">{msg.shell.restart}</span></button>}
        <button type="button" onClick={() => void saveExit()} className="ui-button" aria-label={msg.recovery.saveExit}><LogOut className="size-4" aria-hidden /><span className="hidden sm:inline">{msg.recovery.saveExit}</span></button>
      </>} />
    {content}
    {lobby && <Dialog.Portal>
      <Dialog.Overlay className="dialog-veil fixed inset-0 z-40 bg-scrim " />
      <Dialog.Content className="lobby-drawer fixed inset-y-0 left-0 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col border-r border-ink-line ui-surface pb-[env(safe-area-inset-bottom)] ui-elevation">
        <div className="flex shrink-0 items-center justify-between border-b border-ink-line p-4">
          <Dialog.Title className="font-display text-lg">{msg.app.title}</Dialog.Title>
          <Dialog.Close asChild><button type="button" className="ui-button px-2.5" aria-label={msg.ui.closeMenu}><X className="size-5" aria-hidden /></button></Dialog.Close>
          <Dialog.Description className="sr-only">{msg.ui.menuDescription}</Dialog.Description>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto"><Sidebar {...sidebarProps} collapsed={false} onToggleCollapsed={() => setMenuOpen(false)} /></div>
      </Dialog.Content>
    </Dialog.Portal>}
  </Dialog.Root>;
}

/** 对局中。圆桌与右下操作台共享组队草稿，其余人类操作也统一从右栏进入。 */
function Table() {
  const error = useAtomValue(errorAtom);

  return (
    <TeamDraftProvider>
      <AssassinationDraftProvider>
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
