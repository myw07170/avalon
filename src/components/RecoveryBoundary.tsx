"use client";

import { useEffect, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useOptionalAuthSession } from "./AuthGate";
import { useMessages } from "@/i18n/useMessages";
import { toDisplaySeatNumber } from "@/lib/seat-number";
import {
  initializeRecoveryAtom, disposeRecoveryAtom, refreshRecoveryAtom, recoveryCheckedAtom,
  recoveryBusyAtom, recoverySummaryAtom, recoveryErrorAtom, resumeSavedGameAtom,
  abandonSavedGameAtom, runStatusAtom, saveAndExitAtom, retryFinishAtom,
} from "@/store/game";

const buttonClass = "min-h-11 rounded-lg border border-ink-line bg-ink-raised px-4 py-2 text-sm text-vellum hover:border-brass disabled:opacity-50";

export function RecoveryBoundary({ children }: { children: React.ReactNode }) {
  const owner = useOptionalAuthSession()?.user.id ?? null;
  const initialize = useSetAtom(initializeRecoveryAtom);
  const dispose = useSetAtom(disposeRecoveryAtom);
  const refresh = useSetAtom(refreshRecoveryAtom);
  const checked = useAtomValue(recoveryCheckedAtom);
  const busy = useAtomValue(recoveryBusyAtom);
  const error = useAtomValue(recoveryErrorAtom);
  const status = useAtomValue(runStatusAtom);
  const saveExit = useSetAtom(saveAndExitAtom);
  const finish = useSetAtom(retryFinishAtom);
  const msg = useMessages();
  useEffect(() => {
    void initialize(owner);
    const pagehide = () => dispose();
    const pageshow = (event: PageTransitionEvent) => { if (event.persisted) void initialize(owner); };
    window.addEventListener("pagehide", pagehide);
    window.addEventListener("pageshow", pageshow);
    return () => {
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener("pageshow", pageshow);
      dispose();
    };
  }, [owner, initialize, dispose]);
  if (!checked || busy) return <main className="mx-auto flex max-w-xl flex-1 flex-col justify-center gap-4 p-8" aria-live="polite">
    <p>{busy ? msg.recovery.working : msg.recovery.checking}</p>
    {error && <><p role="alert">{error}</p><button className={buttonClass} onClick={() => void refresh()}>{msg.recovery.retry}</button></>}
  </main>;
  return <>
    {error && <div role="alert" className="mx-auto mt-4 flex max-w-3xl flex-wrap items-center gap-3 rounded-lg border border-mordred/50 bg-ink-raised p-4 text-sm">
      <p>{error}</p>
      <button className={buttonClass} onClick={() => void (status === "finished" ? finish() : refresh())}>{status === "finished" ? msg.recovery.retryFinish : msg.recovery.retry}</button>
    </div>}
    {(status === "idle" || status === "error") && <RecoveryCard />}
    {(status === "ready" || status === "running") && <div className="mx-auto mt-4"><button className={buttonClass} onClick={() => void saveExit()}>{msg.recovery.saveExit}</button></div>}
    {children}
  </>;
}

function RecoveryCard() {
  const summary = useAtomValue(recoverySummaryAtom);
  const resume = useSetAtom(resumeSavedGameAtom);
  const abandon = useSetAtom(abandonSavedGameAtom);
  const [apiKey, setApiKey] = useState("");
  const msg = useMessages();
  if (!summary) return null;
  const continueGame = () => {
    if (summary.occupied && !window.confirm(msg.recovery.confirmTakeover)) return;
    void resume({ gameId: summary.gameId, takeover: summary.occupied, apiKey });
    setApiKey("");
  };
  return <section className="mx-auto mt-6 w-full max-w-3xl rounded-lg border border-brass/50 bg-ink-raised p-5" aria-label={msg.recovery.title}>
    <h2 className="font-display text-xl text-brass">{msg.recovery.title}</h2>
    {summary.compatible ? <>
      <p className="mt-2 text-sm text-muted">{msg.recovery.players(summary.playerCount)} · {summary.humanSeat === null ? msg.recovery.spectator : msg.recovery.player(toDisplaySeatNumber(summary.humanSeat))} · {msg.table.phase[summary.phase]}</p>
      <p className="mt-1 text-xs text-muted">{msg.recovery.saved} {new Date(summary.savedAt).toLocaleString()}</p>
      {summary.needsApiKey && <label className="mt-4 block text-sm">
        <span>{msg.recovery.apiKeyRequired}</span>
        <input type="password" autoComplete="off" aria-label={msg.recovery.apiKey} value={apiKey} onChange={event => setApiKey(event.target.value)} className="mt-2 block w-full rounded border border-ink-line bg-ink p-3" />
      </label>}
    </> : <p className="mt-2 text-sm">{msg.recovery.invalid}</p>}
    <div className="mt-4 flex flex-wrap gap-3">
      {summary.compatible && <button className={buttonClass} disabled={summary.needsApiKey && !apiKey.trim()} onClick={continueGame}>{summary.occupied ? msg.recovery.takeover : msg.recovery.resume}</button>}
      <button className={buttonClass} onClick={() => void abandon(summary.gameId)}>{msg.recovery.abandon}</button>
    </div>
  </section>;
}
