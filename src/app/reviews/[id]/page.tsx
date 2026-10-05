"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { LocaleGate } from "@/i18n/LocaleGate";
import { useMessages } from "@/i18n/useMessages";
import { isSavedReviewSnapshot, type SavedReviewSnapshot } from "@/lib/reviews";
import { AppHeader } from "@/components/AppHeader";
import { GameOverReview } from "@/components/GameOverPanel";

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const msg = useMessages();
  const [review, setReview] = useState<SavedReviewSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadReview() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/game-sessions/${id}/review`, {
          cache: "no-store",
        });
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
        const snapshot =
          typeof body === "object" && body !== null && "review" in body
            ? (body as { review: unknown }).review
            : null;
        if (!isSavedReviewSnapshot(snapshot)) throw new Error(msg.history.unavailable);
        if (!cancelled) setReview(snapshot);
      } catch (loadError) {
        if (!cancelled) {
          setReview(null);
          setError(loadError instanceof Error ? loadError.message : msg.history.unavailable);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadReview();
    return () => {
      cancelled = true;
    };
  }, [id, msg.history.unavailable]);

  return (
    <>
      <LocaleGate />
      <AppHeader />
      {loading ? (
        <main className="mx-auto flex w-full max-w-md flex-1 items-center justify-center px-5 py-12">
          <p className="text-sm text-muted">{msg.history.loadingReview}</p>
        </main>
      ) : error || !review ? (
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-5 py-12 text-center">
          <p role="alert" className="text-sm leading-relaxed text-mordred">
            {error ?? msg.history.unavailable}
          </p>
          <HomeLink />
        </main>
      ) : (
        <GameOverReview
          key={id}
          view={review.view}
          decisions={review.decisions}
          avatarSeed={review.avatarSeed}
          footer={<HomeLink />}
        />
      )}
    </>
  );
}

function HomeLink() {
  const msg = useMessages();
  return (
    <Link
      href="/"
      className="rounded-lg border border-ink-line bg-ink-raised min-h-11 px-6 py-2.5 text-sm text-muted transition-colors hover:border-muted hover:text-vellum"
    >
      {msg.history.backHome}
    </Link>
  );
}
