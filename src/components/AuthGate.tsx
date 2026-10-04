"use client";

import { useCallback, useEffect, useState } from "react";
import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";
import { isClientAuthRequired } from "@/lib/supabase/config";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CreditsSnapshot } from "@/lib/supabase/quota";
import { GAME_CREDITS_CHANGED_EVENT } from "@/lib/credits/events";
import { useMessages } from "@/i18n/useMessages";
import { cn } from "@/lib/utils";

type AuthMode = "signIn" | "signUp";
type PendingAuthAction = "password" | "google";

interface AuthContextValue {
  user: User;
  email: string;
  credits: CreditsSnapshot | null;
  creditsLoading: boolean;
  creditsError: string | null;
  refreshCredits: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
export function useOptionalAuthSession() { return useContext(AuthContext); }

export function useAuthSession(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuthSession must be used under AuthGate");
  return value;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const msg = useMessages();
  const [user, setUser] = useState<User | null>(null);
  const [credits, setCredits] = useState<CreditsSnapshot | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [creditsError, setCreditsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isClientAuthRequired);

  const refreshCredits = useCallback(async () => {
    setCreditsLoading(true);
    setCreditsError(null);
    try {
      const response = await fetch("/api/credits", { cache: "no-store" });
      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const detail =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : msg.auth.creditsUnavailable;
        throw new Error(detail);
      }

      if (
        typeof body === "object" &&
        body !== null &&
        "freeGamesRemaining" in body &&
        "purchasedGamesRemaining" in body &&
        "totalGamesRemaining" in body &&
        typeof body.freeGamesRemaining === "number" &&
        typeof body.purchasedGamesRemaining === "number" &&
        typeof body.totalGamesRemaining === "number"
      ) {
        setCredits({
          freeGamesRemaining: body.freeGamesRemaining,
          purchasedGamesRemaining: body.purchasedGamesRemaining,
          totalGamesRemaining: body.totalGamesRemaining,
        });
        return;
      }

      throw new Error(msg.auth.creditsUnavailable);
    } catch (error) {
      setCredits(null);
      setCreditsError(error instanceof Error ? error.message : msg.auth.creditsUnavailable);
    } finally {
      setCreditsLoading(false);
    }
  }, [msg.auth.creditsUnavailable]);

  useEffect(() => {
    if (!isClientAuthRequired) return;

    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    const scheduleCreditsRefresh = () => {
      window.setTimeout(() => {
        void refreshCredits();
      }, 0);
    };

    async function initializeSession() {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setUser(data.user);
      if (data.user) scheduleCreditsRefresh();
      setLoading(false);

      const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
        const nextUser = session?.user ?? null;
        setUser(nextUser);
        if (nextUser) {
          scheduleCreditsRefresh();
        } else {
          setCredits(null);
          setCreditsError(null);
          setCreditsLoading(false);
        }
        setLoading(false);
      });
      unsubscribe = () => subscription.subscription.unsubscribe();
    }

    void initializeSession();

    const handleCreditsChanged = () => {
      void refreshCredits();
    };
    window.addEventListener(GAME_CREDITS_CHANGED_EVENT, handleCreditsChanged);

    return () => {
      cancelled = true;
      unsubscribe?.();
      window.removeEventListener(GAME_CREDITS_CHANGED_EVENT, handleCreditsChanged);
    };
  }, [refreshCredits]);

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
    <AuthContext.Provider
      value={{
        user,
        email: user.email ?? msg.auth.unknownEmail,
        credits,
        creditsLoading,
        creditsError,
        refreshCredits,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function AuthPanel() {
  const msg = useMessages();
  const [mode, setMode] = useState<AuthMode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAuthAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = pendingAction !== null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingAction("password");
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

    setPendingAction(null);

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

  async function signInWithGoogle() {
    setPendingAction("google");
    setError(null);
    setNotice(null);

    const { error: signInError } = await createSupabaseBrowserClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });

    if (signInError) {
      setPendingAction(null);
      setError(signInError.message);
    }
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

        <button
          type="button"
          disabled={busy}
          onClick={signInWithGoogle}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-ink-line bg-ink px-5 py-3 text-sm text-vellum transition-colors hover:border-brass disabled:cursor-not-allowed disabled:text-muted"
        >
          <span className="flex size-5 items-center justify-center rounded-full bg-vellum font-semibold text-ink">
            G
          </span>
          {pendingAction === "google" ? msg.auth.googleSubmitting : msg.auth.googleSignIn}
        </button>

        <div className="mt-5 flex items-center gap-3 text-[10px] uppercase tracking-[var(--track-3)] text-muted">
          <span className="h-px flex-1 bg-ink-line" />
          {msg.auth.passwordDivider}
          <span className="h-px flex-1 bg-ink-line" />
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
