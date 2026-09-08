"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { LocaleGate } from "@/i18n/LocaleGate";
import { LocaleSwitcher } from "@/i18n/LocaleSwitcher";
import { useMessages } from "@/i18n/useMessages";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ThemeSwitcher } from "@/theme/ThemeSwitcher";

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
      <div className="fixed right-3 top-3 z-30 flex gap-2">
        <ThemeSwitcher />
        <LocaleSwitcher />
      </div>
      <main className="mx-auto flex w-full max-w-md flex-1 items-center px-5 py-12">
        <section className="w-full rounded-lg border border-ink-line bg-ink-raised p-5 shadow-xl">
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
                className="mt-2 w-full rounded-lg border border-ink-line bg-ink px-3 py-2 text-base outline-none transition-colors focus:border-brass"
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
                className="mt-2 w-full rounded-lg border border-ink-line bg-ink px-3 py-2 text-base outline-none transition-colors focus:border-brass"
                type="password"
                autoComplete="new-password"
                minLength={6}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                required
              />
            </label>

            {notice && <p className="text-sm leading-relaxed text-loyal">{notice}</p>}
            {error && (
              <p role="alert" className="text-sm leading-relaxed text-mordred">
                {msg.auth.errorPrefix(error)}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-brass px-5 py-3 font-display text-base tracking-[var(--track-3)] text-on-brass transition-colors hover:bg-brass/85 disabled:cursor-not-allowed disabled:bg-ink-line disabled:text-muted"
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
