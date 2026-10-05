"use client";

import { useState } from "react";
import { useAtom } from "jotai";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, XCircle } from "lucide-react";
import { useMessages } from "@/i18n/useMessages";
import { USER_LLM_PROVIDERS, type UserLlmProvider } from "@/lib/ai/user-config";
import { cn } from "@/lib/utils";
import { userLlmConfigAtom } from "@/store/game";
import { MetalIcon } from "./HeraldicIcon";
import {
  draftFromUserLlmConfig,
  parseUserLlmConfigDraft,
  type UserLlmConfigDraft,
} from "./account-sidebar-model";

export function UserLlmSettingsDialog({ collapsed = false }: { collapsed?: boolean }) {
  const msg = useMessages();
  const [notice, setNotice] = useState<string | null>(null);
  const [userLlmConfig, setUserLlmConfig] = useAtom(userLlmConfigAtom);
  const [llmDraft, setLlmDraft] = useState<UserLlmConfigDraft>(() =>
    draftFromUserLlmConfig(userLlmConfig),
  );
  const [llmError, setLlmError] = useState<string | null>(null);

  function updateLlmDraft(patch: Partial<UserLlmConfigDraft>) {
    setLlmDraft((current) => ({ ...current, ...patch }));
    setLlmError(null);
    setNotice(null);
  }

  function saveUserLlmConfig() {
    const parsed = parseUserLlmConfigDraft(llmDraft);
    if (!parsed.success) {
      setLlmError(msg.auth.userLlm.error[parsed.error]);
      return;
    }
    setUserLlmConfig(parsed.data);
    setLlmError(null);
    setNotice(msg.auth.userLlm.saved);
  }

  function disableUserLlmConfig() {
    setUserLlmConfig(null);
    setLlmError(null);
    setNotice(msg.auth.userLlm.disabled);
  }

  function clearUserLlmDraft() {
    setLlmDraft(draftFromUserLlmConfig(null));
    setUserLlmConfig(null);
    setLlmError(null);
    setNotice(msg.auth.userLlm.cleared);
  }

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={msg.auth.userLlm.title}
          title={collapsed ? msg.auth.userLlm.title : undefined}
          className={cn(
            "border border-ink-line bg-ink text-left transition-colors hover:border-brass hover:text-vellum",
            collapsed
              ? "flex size-10 shrink-0 items-center justify-center rounded-lg text-muted"
              : "flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2",
            userLlmConfig && "border-brass-line",
          )}
        >
          <MetalIcon kind="key" />
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs text-vellum">{msg.auth.userLlm.title}</span>
              <span className="block truncate text-[11px] text-muted">
                {userLlmConfig ? msg.auth.userLlm.enabled : msg.auth.userLlm.off}
              </span>
            </span>
          )}
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="dialog-veil fixed inset-0 z-40 bg-scrim " />
        <Dialog.Content
          className={cn(
            "dialog-rise fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-2xl flex-col overflow-hidden",
            "rounded-2xl border border-ink-line ui-surface ui-elevation",
          )}
        >
          <header className="shrink-0 border-b border-ink-line px-5 pb-4 pt-5 sm:px-7 sm:pt-6">
            <div className="pr-12">
              <Dialog.Title className="font-display text-2xl tracking-[var(--track-1)] text-vellum sm:text-3xl">
                {msg.auth.userLlm.title}
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted">
                {msg.auth.userLlm.description}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={msg.auth.userLlm.closeAria}
                className="absolute right-4 top-4 grid size-11 place-content-center rounded-lg border border-ink-line text-xl text-muted transition-colors hover:border-muted hover:text-vellum"
              >
                <span aria-hidden>×</span>
              </button>
            </Dialog.Close>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
            <span
              className={cn(
                "inline-block rounded-full border px-2 py-1 text-[11px]",
                userLlmConfig
                  ? "border-success-line bg-success-soft text-success"
                  : "border-ink-line text-muted",
              )}
            >
              {userLlmConfig ? msg.auth.userLlm.enabled : msg.auth.userLlm.off}
            </span>
            <div className="mt-4 grid gap-3">
              <label className="block text-xs text-muted">
                {msg.auth.userLlm.provider}
                <select
                  className="ui-input mt-1.5 w-full rounded-lg border border-ink-line px-3 py-2 text-sm text-vellum transition-colors focus:border-brass"
                  value={llmDraft.provider}
                  onChange={(event) =>
                    updateLlmDraft({ provider: event.target.value as UserLlmProvider })
                  }
                >
                  {USER_LLM_PROVIDERS.map((provider) => (
                    <option key={provider} value={provider}>
                      {msg.auth.userLlm.providerLabel[provider]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs text-muted">
                {msg.auth.userLlm.apiKey}
                <input
                  className="ui-input mt-1.5 w-full rounded-lg border border-ink-line px-3 py-2 text-sm text-vellum transition-colors focus:border-brass"
                  type="password"
                  autoComplete="off"
                  value={llmDraft.apiKey}
                  onChange={(event) => updateLlmDraft({ apiKey: event.target.value })}
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs text-muted">
                  {msg.auth.userLlm.model}
                  <input
                    className="ui-input mt-1.5 w-full rounded-lg border border-ink-line px-3 py-2 text-sm text-vellum transition-colors focus:border-brass"
                    value={llmDraft.model}
                    onChange={(event) => updateLlmDraft({ model: event.target.value })}
                    placeholder={msg.auth.userLlm.modelPlaceholder}
                  />
                </label>
                <label className="block text-xs text-muted">
                  {msg.auth.userLlm.baseUrl}
                  <input
                    className="ui-input mt-1.5 w-full rounded-lg border border-ink-line px-3 py-2 text-sm text-vellum transition-colors focus:border-brass"
                    value={llmDraft.baseUrl}
                    onChange={(event) => updateLlmDraft({ baseUrl: event.target.value })}
                    placeholder={msg.auth.userLlm.baseUrlPlaceholder}
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs text-muted">
                  {msg.auth.userLlm.temperature}
                  <input
                    className="ui-input mt-1.5 w-full rounded-lg border border-ink-line px-3 py-2 text-sm text-vellum transition-colors focus:border-brass"
                    value={llmDraft.temperature}
                    onChange={(event) => updateLlmDraft({ temperature: event.target.value })}
                    placeholder={msg.auth.userLlm.temperaturePlaceholder}
                  />
                </label>
                <label className="block text-xs text-muted">
                  {msg.auth.userLlm.maxTokens}
                  <input
                    className="ui-input mt-1.5 w-full rounded-lg border border-ink-line px-3 py-2 text-sm text-vellum transition-colors focus:border-brass"
                    inputMode="numeric"
                    value={llmDraft.maxTokens}
                    onChange={(event) => updateLlmDraft({ maxTokens: event.target.value })}
                    placeholder={msg.auth.userLlm.maxTokensPlaceholder}
                  />
                </label>
              </div>

              <label className="block text-xs text-muted">
                {msg.auth.userLlm.extraBody}
                <textarea
                  className="ui-input mt-1.5 min-h-20 w-full resize-y rounded-lg border border-ink-line px-3 py-2 font-mono text-xs text-vellum transition-colors focus:border-brass"
                  value={llmDraft.extraBody}
                  onChange={(event) => updateLlmDraft({ extraBody: event.target.value })}
                  placeholder={msg.auth.userLlm.extraBodyPlaceholder}
                />
              </label>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-muted">
              {msg.auth.userLlm.sessionOnly}
            </p>
          </div>

          <footer className="shrink-0 border-t border-ink-line px-5 py-4 sm:px-7">
            {llmError && (
              <p role="alert" className="mb-3 text-xs leading-relaxed text-mordred">
                {llmError}
              </p>
            )}
            {notice && <p role="status" className="mb-3 text-xs leading-relaxed text-success">{notice}</p>}

            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <button
                type="button"
                onClick={saveUserLlmConfig}
                className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-brass px-3 text-sm text-vellum transition-colors hover:bg-brass hover:text-on-brass"
              >
                <Check className="size-4" aria-hidden />
                {msg.auth.userLlm.save}
              </button>
              <button
                type="button"
                onClick={disableUserLlmConfig}
                disabled={!userLlmConfig}
                className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-ink-line px-3 text-sm text-muted transition-colors hover:border-muted hover:text-vellum disabled:cursor-not-allowed"
              >
                <XCircle className="size-4" aria-hidden />
                {msg.auth.userLlm.disable}
              </button>
              <button
                type="button"
                onClick={clearUserLlmDraft}
                className="min-h-10 rounded-lg border border-ink-line px-3 text-sm text-muted transition-colors hover:border-mordred hover:text-mordred"
              >
                {msg.auth.userLlm.clear}
              </button>
            </div>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
