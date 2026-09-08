"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import { History, KeyRound, LoaderCircle, LogOut, UserCircle } from "lucide-react";
import { useLocale, useMessages } from "@/i18n/useMessages";
import { GAME_REVIEWS_CHANGED_EVENT } from "@/lib/credits/events";
import type { ReviewSummary } from "@/lib/reviews";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useAuthSession } from "./AuthGate";
import { describeHistoryItem } from "./account-sidebar-model";

export function AccountSidebar() {
  const msg = useMessages();
  const locale = useLocale();
  const { email, credits, creditsLoading, creditsError } = useAuthSession();
  const [reviews, setReviews] = useState<ReviewSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshReviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/game-sessions", { cache: "no-store" });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const detail =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : msg.history.unavailable;
        throw new Error(detail);
      }
      if (
        typeof body === "object" &&
        body !== null &&
        "reviews" in body &&
        Array.isArray(body.reviews)
      ) {
        setReviews(body.reviews as ReviewSummary[]);
        return;
      }
      throw new Error(msg.history.unavailable);
    } catch (reviewError) {
      setReviews([]);
      setError(reviewError instanceof Error ? reviewError.message : msg.history.unavailable);
    } finally {
      setLoading(false);
    }
  }, [msg.history.unavailable]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshReviews(), 0);
    const onChanged = () => void refreshReviews();
    window.addEventListener(GAME_REVIEWS_CHANGED_EVENT, onChanged);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(GAME_REVIEWS_CHANGED_EVENT, onChanged);
    };
  }, [refreshReviews]);

  return (
    <aside className="flex min-h-0 flex-col border-b border-ink-line bg-ink-raised/70 px-4 py-4 lg:sticky lg:top-0 lg:h-dvh lg:border-b-0 lg:border-r">
      <header className="mb-3 flex items-center gap-2 text-muted">
        <History className="size-4" aria-hidden />
        <h2 className="font-display text-xs tracking-[var(--track-3)]">
          {msg.history.title}
        </h2>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {loading ? (
          <p className="flex items-center gap-2 text-xs text-muted">
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            {msg.history.loading}
          </p>
        ) : error ? (
          <p role="alert" className="text-xs leading-relaxed text-mordred">
            {error}
          </p>
        ) : reviews.length === 0 ? (
          <p className="text-xs leading-relaxed text-muted">{msg.history.empty}</p>
        ) : (
          <ol className="space-y-2">
            {reviews.map((review) => {
              const brief = describeHistoryItem(review, msg, locale);
              return (
                <li key={review.id}>
                  <Link
                    href={`/reviews/${review.id}`}
                    aria-label={brief.ariaLabel}
                    className="block rounded-lg border border-ink-line bg-ink px-3 py-2 transition-colors hover:border-brass"
                  >
                    <p className="truncate text-sm text-vellum">{brief.title}</p>
                    <p className="mt-1 truncate text-xs text-muted">{brief.detail}</p>
                    <p className="tabular mt-1 text-[11px] text-brass">{brief.meta}</p>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <AccountPopover
        email={email}
        credits={credits}
        creditsLoading={creditsLoading}
        creditsError={creditsError}
      />
    </aside>
  );
}

function AccountPopover({
  email,
  credits,
  creditsLoading,
  creditsError,
}: {
  email: string;
  credits: ReturnType<typeof useAuthSession>["credits"];
  creditsLoading: boolean;
  creditsError: string | null;
}) {
  const msg = useMessages();
  const [busy, setBusy] = useState<"password" | "signOut" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const creditLine = credits
    ? msg.auth.creditsTotal(credits.totalGamesRemaining)
    : creditsLoading
      ? msg.auth.creditsLoading
      : creditsError ?? msg.auth.creditsUnavailable;

  async function requestPasswordReset() {
    setBusy("password");
    setNotice(null);
    setError(null);
    const { error: resetError } = await createSupabaseBrowserClient().auth.resetPasswordForEmail(
      email,
      { redirectTo: `${window.location.origin}/auth/callback?next=/account/update-password` },
    );
    setBusy(null);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setNotice(msg.auth.passwordResetSent);
  }

  async function signOut() {
    setBusy("signOut");
    setNotice(null);
    setError(null);
    await createSupabaseBrowserClient().auth.signOut();
    setBusy(null);
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="mt-4 flex w-full items-center gap-3 rounded-lg border border-ink-line bg-ink px-3 py-2 text-left transition-colors hover:border-muted"
        >
          <UserCircle className="size-5 shrink-0 text-brass" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs text-vellum">{email}</span>
            <span className="tabular block truncate text-[11px] text-muted">{creditLine}</span>
          </span>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          side="right"
          sideOffset={10}
          className={cn(
            "z-50 w-[min(20rem,calc(100vw-1rem))] rounded-lg border border-ink-line",
            "bg-ink-raised p-4 text-sm shadow-2xl outline-none",
          )}
        >
          <p className="text-xs text-muted">{msg.auth.email}</p>
          <p className="mt-1 break-all text-vellum">{email}</p>

          <div className="mt-4 rounded-lg border border-ink-line bg-ink px-3 py-2">
            {creditsLoading ? (
              <p className="text-xs text-muted">{msg.auth.creditsLoading}</p>
            ) : credits ? (
              <>
                <p className="tabular text-vellum">
                  {msg.auth.creditsTotal(credits.totalGamesRemaining)}
                </p>
                <p className="tabular mt-1 text-xs text-muted">
                  {msg.auth.creditsBreakdown(
                    credits.freeGamesRemaining,
                    credits.purchasedGamesRemaining,
                  )}
                </p>
              </>
            ) : (
              <p className="text-xs text-muted">{creditsError ?? msg.auth.creditsUnavailable}</p>
            )}
          </div>

          {notice && <p className="mt-3 text-xs leading-relaxed text-loyal">{notice}</p>}
          {error && (
            <p role="alert" className="mt-3 text-xs leading-relaxed text-mordred">
              {msg.auth.errorPrefix(error)}
            </p>
          )}

          <div className="mt-4 grid gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={requestPasswordReset}
              className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ink-line px-3 text-sm text-muted transition-colors hover:border-brass hover:text-vellum disabled:cursor-not-allowed disabled:opacity-50"
            >
              <KeyRound className="size-4" aria-hidden />
              {busy === "password" ? msg.auth.sendingPasswordReset : msg.auth.changePassword}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={signOut}
              className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ink-line px-3 text-sm text-muted transition-colors hover:border-mordred hover:text-vellum disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LogOut className="size-4" aria-hidden />
              {busy === "signOut" ? msg.auth.signingOut : msg.auth.signOut}
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
