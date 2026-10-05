"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { LocaleSwitcher } from "@/i18n/LocaleSwitcher";
import { useMessages } from "@/i18n/useMessages";
import { TutorialModal } from "./TutorialModal";
import { CrownIcon } from "./HeraldicIcon";

/** Shared navigation stays in document flow; dialogs sit above it. */
export function AppHeader({ leading, actions }: { leading?: ReactNode; actions?: ReactNode }) {
  const msg = useMessages();
  return (
    <header className="ui-header sticky top-0 z-30 flex min-h-[var(--app-header-height)] shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-ink-line bg-ink px-4 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {leading}
        <Link href="/" className="flex items-center gap-2.5 text-vellum">
          <CrownIcon className="size-8" />
          <span className="font-display text-xl font-semibold tracking-[var(--track-2)]">{msg.app.title}</span>
        </Link>
      </div>
      <nav aria-label={msg.ui.navigation} className="flex flex-wrap items-center justify-end gap-2">
        {actions}
        <TutorialModal />
        <LocaleSwitcher />
      </nav>
    </header>
  );
}
