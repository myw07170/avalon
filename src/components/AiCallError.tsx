"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { useMessages } from "@/i18n/useMessages";
import { errorAtom, retryAiTurnAtom, runStatusAtom } from "@/store/game";

export function AiCallError() {
  const error = useAtomValue(errorAtom);
  const status = useAtomValue(runStatusAtom);
  const retry = useSetAtom(retryAiTurnAtom);
  const msg = useMessages();
  if (!error) return null;

  return <div className="grid max-w-md justify-items-center gap-3">
    <p role="alert" className="text-center text-sm text-mordred">{error}</p>
    {status === "interrupted" && <button type="button" className="ui-button ui-button-primary" onClick={() => void retry()}>
      {msg.recovery.retry}
    </button>}
  </div>;
}
