"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { LocaleGate } from "@/i18n/LocaleGate";
import { useMessages } from "@/i18n/useMessages";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AppHeader } from "@/components/AppHeader";

export default function UpdatePasswordPage() {
  const msg = useMessages();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setError(null);

    if (password !== confirm) {
      setError(msg.auth.passwordMismatch);
      return;
    }

    setBusy(true);
    const { error: updateError } = await createSupabaseBrowserClient().auth.updateUser({
      password,
    });
    setBusy(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setPassword("");
    setConfirm("");
    setNotice(msg.auth.passwordUpdated);
  }

  return (
    <>
      <LocaleGate />
      <AppHeader />
      <main className="mx-auto flex w-full max-w-md flex-1 items-center px-5 py-12">
        <section className="ui-panel w-full p-6 sm:p-8">
          <header>
            <h1 className="font-display text-2xl tracking-[var(--track-3)]">
              {msg.auth.updatePasswordTitle}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {msg.auth.updatePasswordDescription}
            </p>
          </header>

          <form className="mt-5 space-y-4" onSubmit={submit}>
            <label className="block text-sm">
              <span className="text-muted">{msg.auth.newPassword}</span>
              <input
                className="ui-input mt-2 w-full rounded-lg border border-ink-line px-3 py-2 text-base transition-colors focus:border-brass"
                type="password"
                autoComplete="new-password"
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted">{msg.auth.confirmPassword}</span>
              <input
                className="ui-input mt-2 w-full rounded-lg border border-ink-line px-3 py-2 text-base transition-colors focus:border-brass"
                type="password"
                autoComplete="new-password"
                minLength={6}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                required
              />
            </label>

            {notice && <p className="text-sm leading-relaxed text-success">{notice}</p>}
            {error && (
              <p role="alert" className="text-sm leading-relaxed text-mordred">
                {msg.auth.errorPrefix(error)}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg ui-button-primary px-5 py-3 font-display text-base tracking-[var(--track-3)] transition-colors disabled:cursor-not-allowed disabled:bg-ink-line disabled:text-muted"
            >
              <span className="-mr-[var(--track-3)]">
                {busy ? msg.auth.updatingPassword : msg.auth.updatePasswordSubmit}
              </span>
            </button>
          </form>

          <Link
            href="/"
            className="mt-4 flex min-h-11 items-center justify-center rounded-lg border border-ink-line text-sm text-muted transition-colors hover:border-muted hover:text-vellum"
          >
            {msg.history.backHome}
          </Link>
        </section>
      </main>
    </>
  );
}
