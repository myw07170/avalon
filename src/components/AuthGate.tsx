"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { isClientAuthRequired } from "@/lib/supabase/config";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useMessages } from "@/i18n/useMessages";
import { cn } from "@/lib/utils";

type AuthMode = "signIn" | "signUp";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const msg = useMessages();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isClientAuthRequired);

  useEffect(() => {
    if (!isClientAuthRequired) return;

    const supabase = createSupabaseBrowserClient();
    let cancelled = false;

    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setUser(data.user);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  if (!isClientAuthRequired) return <>{children}</>;

  if (loading) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 items-center justify-center px-5 py-12">
        <p className="text-sm text-muted">{msg.auth.loading}</p>
      </main>
    );
  }

  if (!user) return <AuthPanel />;

  return (
    <>
      {children}
      <AccountPanel email={user.email ?? msg.auth.unknownEmail} />
    </>
  );
}

function AuthPanel() {
  const msg = useMessages();
  const [mode, setMode] = useState<AuthMode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    const supabase = createSupabaseBrowserClient();
    const result =
      mode === "signUp"
        ? await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
          })
        : await supabase.auth.signInWithPassword({ email, password });

    setBusy(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    if (mode === "signUp" && !result.data.session) {
      setNotice(msg.auth.confirmEmail);
      return;
    }

    setNotice(msg.auth.signedIn);
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 items-center px-5 py-12">
      <section className="w-full rounded-lg border border-ink-line bg-ink-raised p-5 shadow-xl">
        <header>
          <h1 className="font-display text-2xl tracking-[var(--track-3)]">
            {msg.auth.title}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">{msg.auth.description}</p>
        </header>

        <div role="radiogroup" aria-label={msg.auth.modeLabel} className="mt-5 grid grid-cols-2 gap-2">
          <ModeButton checked={mode === "signIn"} onClick={() => setMode("signIn")}>
            {msg.auth.signInTab}
          </ModeButton>
          <ModeButton checked={mode === "signUp"} onClick={() => setMode("signUp")}>
            {msg.auth.signUpTab}
          </ModeButton>
        </div>

        <form className="mt-5 space-y-4" onSubmit={submit}>
          <label className="block text-sm">
            <span className="text-muted">{msg.auth.email}</span>
            <input
              className="mt-2 w-full rounded-lg border border-ink-line bg-ink px-3 py-2 text-base outline-none transition-colors focus:border-brass"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className="block text-sm">
            <span className="text-muted">{msg.auth.password}</span>
            <input
              className="mt-2 w-full rounded-lg border border-ink-line bg-ink px-3 py-2 text-base outline-none transition-colors focus:border-brass"
              type="password"
              autoComplete={mode === "signUp" ? "new-password" : "current-password"}
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
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
              {busy
                ? msg.auth.submitting
                : mode === "signUp"
                  ? msg.auth.signUpSubmit
                  : msg.auth.signInSubmit}
            </span>
          </button>
        </form>
      </section>
    </main>
  );
}

function AccountPanel({ email }: { email: string }) {
  const msg = useMessages();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await createSupabaseBrowserClient().auth.signOut();
    setBusy(false);
  }

  return (
    <div className="fixed bottom-3 left-3 z-30 max-w-[calc(100vw-1.5rem)] rounded-lg border border-ink-line bg-ink-raised px-3 py-2 text-xs text-muted shadow-lg">
      <p className="max-w-56 truncate">{email}</p>
      <button
        type="button"
        disabled={busy}
        onClick={signOut}
        className="mt-1 text-brass transition-colors hover:text-vellum disabled:text-muted"
      >
        {busy ? msg.auth.signingOut : msg.auth.signOut}
      </button>
    </div>
  );
}

function ModeButton({
  checked,
  onClick,
  children,
}: {
  checked: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-2 text-sm transition-colors",
        checked
          ? "border-brass bg-brass/15 text-vellum"
          : "border-ink-line bg-ink text-muted hover:border-muted hover:text-vellum",
      )}
    >
      {children}
    </button>
  );
}
