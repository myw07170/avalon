"use client";

import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import Link from "next/link";
import { useAtom } from "jotai";
import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import {
  LoaderCircle,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
  UserCircle,
} from "lucide-react";
import { useLocale, useMessages } from "@/i18n/useMessages";
import { GAME_REVIEWS_CHANGED_EVENT } from "@/lib/credits/events";
import { ROLE_ORDER, type Role } from "@/lib/game";
import type { ReviewSummary } from "@/lib/reviews";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { aiModeAtom, type AiMode } from "@/store/game";
import { useAuthSession } from "./AuthGate";
import { PersonaLibrary } from "./PersonaLibrary";
import { UserLlmSettingsDialog } from "./UserLlmSettingsDialog";
import { MetalIcon } from "./HeraldicIcon";
import { describeHistoryItem } from "./account-sidebar-model";
import {
  aiSeatsOf,
  clearPersonaSelections,
  previewSetup,
  withPersonaSelection,
  withRolePreference,
  type SetupDraft,
} from "./setup-model";

interface AccountSidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  setupDraft: SetupDraft;
  onSetupDraftChange: Dispatch<SetStateAction<SetupDraft>>;
}

export function AccountSidebar({
  collapsed,
  onToggleCollapsed,
  setupDraft,
  onSetupDraftChange,
}: AccountSidebarProps) {
  const msg = useMessages();
  const locale = useLocale();
  const { email, credits, creditsLoading, creditsError } = useAuthSession();
  const [reviews, setReviews] = useState<ReviewSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReviewSummary | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
      console.warn("[AccountSidebar] 历史复盘读取失败：", reviewError);
      setError(msg.history.unavailable);
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

  const deleteReview = useCallback(async () => {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/game-sessions/${deleteTarget.id}/review`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        console.warn("[AccountSidebar] 删除复盘失败：", body);
        throw new Error(msg.history.deleteFailed);
      }
      setReviews((current) => current.filter((review) => review.id !== deleteTarget.id));
      window.dispatchEvent(new Event(GAME_REVIEWS_CHANGED_EVENT));
      setDeleteTarget(null);
    } catch (reviewError) {
      console.warn("[AccountSidebar] 删除复盘失败：", reviewError);
      setDeleteError(msg.history.deleteFailed);
    } finally {
      setDeletingId(null);
    }
  }, [deleteTarget, msg.history.deleteFailed]);

  const accountDialog = (
    <AccountDialog
      collapsed={collapsed}
      email={email}
      credits={credits}
      creditsLoading={creditsLoading}
      creditsError={creditsError}
    />
  );

  if (collapsed) {
    return (
      <>
        <aside
          className={cn(
            "flex min-h-0 items-center gap-2 border-b border-ink-line ui-surface px-3 py-2",
            "transition-all duration-200 lg:sticky lg:top-[var(--app-header-height)] lg:h-[calc(100dvh-var(--app-header-height))] lg:flex-col lg:border-b-0 lg:border-r lg:py-4",
          )}
        >
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-expanded={false}
            aria-label={msg.history.expandSidebar}
            title={msg.history.expandSidebar}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-ink-line bg-ink text-muted transition-colors hover:border-brass hover:text-vellum"
          >
            <PanelLeftOpen className="size-4" aria-hidden />
          </button>
          <SetupSidebarControls
            collapsed
            draft={setupDraft}
            onDraftChange={onSetupDraftChange}
          />
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={msg.history.expandHistory}
            title={msg.history.expandHistory}
            className="relative flex size-10 shrink-0 items-center justify-center rounded-lg border border-ink-line bg-ink text-muted transition-colors hover:border-brass hover:text-vellum"
          >
            {loading ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <MetalIcon kind="history" className="size-6" />
            )}
            {!loading && reviews.length > 0 && (
              <span className="absolute right-1 top-1 size-1.5 rounded-full bg-brass" />
            )}
          </button>
          <div className="min-w-0 flex-1 lg:min-h-0" />
          {accountDialog}
        </aside>

        <DeleteReviewDialog
          review={deleteTarget}
          deleting={deletingId !== null}
          error={deleteError}
          onClose={() => {
            if (deletingId === null) {
              setDeleteTarget(null);
              setDeleteError(null);
            }
          }}
          onConfirm={deleteReview}
        />
      </>
    );
  }

  return (
    <>
      <aside className="flex min-h-0 flex-col border-b border-ink-line ui-sidebar px-4 py-4 lg:sticky lg:top-[var(--app-header-height)] lg:h-[calc(100dvh-var(--app-header-height))] lg:border-b-0 lg:border-r">
        <header className="mb-3 flex justify-end text-muted">
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-expanded={true}
            aria-label={msg.history.collapseSidebar}
            title={msg.history.collapseSidebar}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-ink-line bg-ink text-muted transition-colors hover:border-brass hover:text-vellum"
          >
            <PanelLeftClose className="size-4" aria-hidden />
          </button>
        </header>

        <SetupSidebarControls
          draft={setupDraft}
          onDraftChange={onSetupDraftChange}
        />

        <header className="mb-3 mt-4 flex items-center gap-2 text-muted">
          <div className="flex min-w-0 items-center gap-2">
            <MetalIcon kind="history" className="size-6" />
            <h2 className="truncate text-xs font-medium">
              {msg.history.title}
            </h2>
          </div>
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
                    <div className="flex rounded-lg border border-ink-line bg-ink transition-colors hover:border-brass">
                      <Link
                        href={`/reviews/${review.id}`}
                        aria-label={brief.ariaLabel}
                        className="min-w-0 flex-1 px-3 py-3"
                      >
                        <p className="truncate text-sm text-vellum">{brief.title}</p>
                        <p className="mt-1 truncate text-xs text-muted">{brief.detail}</p>
                        <p className="tabular mt-1 text-[11px] text-brass">{brief.meta}</p>
                      </Link>
                      <button
                        type="button"
                        disabled={deletingId !== null}
                        onClick={() => {
                          setDeleteTarget(review);
                          setDeleteError(null);
                        }}
                        aria-label={msg.history.deleteAria(brief.title)}
                        title={msg.history.delete}
                        className="m-1 flex size-9 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-ink-raised hover:text-mordred disabled:cursor-not-allowed"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {accountDialog}
      </aside>

      <DeleteReviewDialog
        review={deleteTarget}
        deleting={deletingId !== null}
        error={deleteError}
        onClose={() => {
          if (deletingId === null) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
        onConfirm={deleteReview}
      />
    </>
  );
}

export function LocalAccountSidebar({
  collapsed,
  onToggleCollapsed,
  setupDraft,
  onSetupDraftChange,
}: AccountSidebarProps) {
  const msg = useMessages();

  if (collapsed) {
    return (
      <aside
        className={cn(
          "flex min-h-0 items-center gap-2 border-b border-ink-line ui-surface px-3 py-2",
          "transition-all duration-200 lg:sticky lg:top-[var(--app-header-height)] lg:h-[calc(100dvh-var(--app-header-height))] lg:flex-col lg:border-b-0 lg:border-r lg:py-4",
        )}
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={false}
          aria-label={msg.history.expandSidebar}
          title={msg.history.expandSidebar}
          className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-ink-line bg-ink text-muted transition-colors hover:border-brass hover:text-vellum"
        >
          <PanelLeftOpen className="size-4" aria-hidden />
        </button>
        <SetupSidebarControls
          collapsed
          draft={setupDraft}
          onDraftChange={onSetupDraftChange}
        />
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={msg.history.expandHistory}
          title={msg.history.expandHistory}
          className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-ink-line bg-ink text-muted transition-colors hover:border-brass hover:text-vellum"
        >
          <MetalIcon kind="history" className="size-6" />
        </button>
        <div className="min-w-0 flex-1 lg:min-h-0" />
        <button
          type="button"
          disabled
          aria-label={msg.auth.localMode}
          title={msg.auth.localMode}
          className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-ink-line bg-ink text-muted "
        >
          <UserCircle className="size-5 text-brass" aria-hidden />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex min-h-0 flex-col border-b border-ink-line ui-sidebar px-4 py-4 lg:sticky lg:top-[var(--app-header-height)] lg:h-[calc(100dvh-var(--app-header-height))] lg:border-b-0 lg:border-r">
      <header className="mb-3 flex justify-end text-muted">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={true}
          aria-label={msg.history.collapseSidebar}
          title={msg.history.collapseSidebar}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-ink-line bg-ink text-muted transition-colors hover:border-brass hover:text-vellum"
        >
          <PanelLeftClose className="size-4" aria-hidden />
        </button>
      </header>

      <SetupSidebarControls
        draft={setupDraft}
        onDraftChange={onSetupDraftChange}
      />

      <header className="mb-3 mt-4 flex items-center gap-2 text-muted">
        <div className="flex min-w-0 items-center gap-2">
          <MetalIcon kind="history" className="size-6" />
          <h2 className="truncate text-xs font-medium">
            {msg.history.title}
          </h2>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <p className="text-xs leading-relaxed text-muted">{msg.history.localModeEmpty}</p>
      </div>

      <button
        type="button"
        disabled
        className="mt-4 flex w-full items-center gap-3 rounded-lg border border-ink-line bg-ink px-3 py-2 text-left "
      >
        <UserCircle className="size-5 shrink-0 text-brass" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs text-vellum">{msg.auth.localMode}</span>
          <span className="block truncate text-[11px] text-muted">{msg.auth.localModeNote}</span>
        </span>
      </button>
    </aside>
  );
}

function SetupSidebarControls({
  collapsed = false,
  draft,
  onDraftChange,
}: {
  collapsed?: boolean;
  draft: SetupDraft;
  onDraftChange: Dispatch<SetStateAction<SetupDraft>>;
}) {
  const [aiMode, setAiMode] = useAtom(aiModeAtom);

  if (collapsed) {
    return (
      <>
        <PersonaSettingsDialog collapsed draft={draft} onDraftChange={onDraftChange} />
        <RolePreferencePicker collapsed draft={draft} onDraftChange={onDraftChange} />
        <ModelCallSwitch collapsed aiMode={aiMode} onAiMode={setAiMode} />
        <UserLlmSettingsDialog collapsed />
      </>
    );
  }

  return (
    <section className="shrink-0 border-b border-ink-line pb-4">
      <div className="grid gap-2">
        <PersonaSettingsDialog draft={draft} onDraftChange={onDraftChange} />
        <RolePreferencePicker draft={draft} onDraftChange={onDraftChange} />
        <ModelCallSwitch aiMode={aiMode} onAiMode={setAiMode} />
        <UserLlmSettingsDialog />
      </div>
    </section>
  );
}

function PersonaSettingsDialog({
  collapsed = false,
  draft,
  onDraftChange,
}: {
  collapsed?: boolean;
  draft: SetupDraft;
  onDraftChange: Dispatch<SetStateAction<SetupDraft>>;
}) {
  const msg = useMessages();
  const aiSeats = aiSeatsOf(draft);
  const selectedCount = aiSeats.filter(
    (seat) => draft.personaSelections[seat] !== undefined,
  ).length;

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={msg.setup.personaField}
          title={collapsed ? msg.setup.personaField : undefined}
          className={cn(
            "border border-ink-line bg-ink text-left transition-colors hover:border-brass hover:text-vellum",
            collapsed
              ? "flex size-10 shrink-0 items-center justify-center rounded-lg text-muted"
              : "flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2",
          )}
        >
          <MetalIcon kind="ai" />
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs text-vellum">
                {msg.setup.personaField}
              </span>
              <span className="tabular block truncate text-[11px] text-muted">
                {msg.setup.personaCount(selectedCount, aiSeats.length)}
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
            "flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-5xl flex-col overflow-hidden",
            "rounded-2xl border border-ink-line ui-surface ui-elevation",
          )}
        >
          <header className="shrink-0 border-b border-ink-line px-5 pb-4 pt-5 sm:px-7 sm:pt-6">
            <div className="pr-12">
              <Dialog.Title className="-mr-[var(--track-1)] font-display text-2xl tracking-[var(--track-1)] text-vellum sm:text-3xl">
                {msg.setup.personaField}
              </Dialog.Title>
              <Dialog.Description className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                {msg.setup.personaDialogDescription}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={msg.setup.personaCloseAria}
                className="absolute right-4 top-4 grid size-11 place-content-center rounded-lg border border-ink-line text-xl text-muted transition-colors hover:border-muted hover:text-vellum"
              >
                <span aria-hidden>×</span>
              </button>
            </Dialog.Close>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
            <PersonaLibrary
              aiSeats={aiSeats}
              selections={draft.personaSelections}
              onSelect={(seat, personaId) =>
                onDraftChange((current) => withPersonaSelection(current, seat, personaId))
              }
              onClearAll={() => onDraftChange(clearPersonaSelections)}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RolePreferencePicker({
  collapsed = false,
  draft,
  onDraftChange,
}: {
  collapsed?: boolean;
  draft: SetupDraft;
  onDraftChange: Dispatch<SetStateAction<SetupDraft>>;
}) {
  const msg = useMessages();
  const preview = previewSetup(draft);
  const selected = draft.rolePreference;
  const missing = selected !== null && !preview.roles.includes(selected);
  const label = selected === null ? msg.setup.rolePreferenceRandom : msg.roles[selected].label;

  const choose = (role: Role | null) => {
    onDraftChange((current) => withRolePreference(current, role));
  };

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={msg.setup.rolePreferenceChooseAria(label)}
          title={collapsed ? msg.setup.rolePreferenceField : undefined}
          className={cn(
            "border border-ink-line bg-ink text-left transition-colors hover:border-brass hover:text-vellum",
            collapsed
              ? "flex size-10 shrink-0 items-center justify-center rounded-lg text-muted"
              : "flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2",
            missing && "border-brass-line",
          )}
        >
          <MetalIcon kind="dice" />
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs text-vellum">
                {msg.setup.rolePreferenceField}
              </span>
              <span className="block truncate text-[11px] text-muted">
                {missing ? msg.setup.rolePreferenceMissing(label) : label}
              </span>
            </span>
          )}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          side={collapsed ? "right" : "bottom"}
          sideOffset={8}
          className="z-50 w-[min(18rem,calc(100vw-1rem))] rounded-lg border border-ink-line ui-surface p-2 text-sm ui-elevation outline-none"
        >
          <div
            role="radiogroup"
            aria-label={msg.setup.rolePreferenceField}
            className="grid gap-1"
          >
            <RolePreferenceOption
              checked={selected === null}
              onSelect={() => choose(null)}
              label={msg.setup.rolePreferenceRandom}
            />
            {ROLE_ORDER.map((role) => (
              <RolePreferenceOption
                key={role}
                checked={selected === role}
                onSelect={() => choose(role)}
                label={msg.roles[role].label}
                muted={!preview.roles.includes(role)}
              />
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function RolePreferenceOption({
  checked,
  onSelect,
  label,
  muted = false,
}: {
  checked: boolean;
  onSelect: () => void;
  label: string;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        "flex min-h-10 w-full items-center justify-between rounded-md px-3 text-left transition-colors",
        checked ? "ui-selected bg-brass-soft text-vellum" : "text-muted hover:bg-ink hover:text-vellum",
        muted && !checked && "text-muted",
      )}
    >
      <span className="truncate">{label}</span>
      {checked && <span className="ml-3 text-brass" aria-hidden>✓</span>}
    </button>
  );
}

function ModelCallSwitch({
  collapsed = false,
  aiMode,
  onAiMode,
}: {
  collapsed?: boolean;
  aiMode: AiMode;
  onAiMode: (mode: AiMode) => void;
}) {
  const msg = useMessages();
  const enabled = aiMode === "remote";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={msg.setup.modelCallsAria}
      title={collapsed ? msg.setup.modelCallsField : undefined}
      onClick={() => onAiMode(enabled ? "mock" : "remote")}
      className={cn(
        "border border-ink-line bg-ink text-left transition-colors hover:border-brass hover:text-vellum",
        collapsed
          ? "flex size-10 shrink-0 items-center justify-center rounded-lg text-muted"
          : "flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2",
        enabled && "border-brass-line",
      )}
    >
      {collapsed ? (
        <MetalIcon kind="watch" />
      ) : (
        <>
          <MetalIcon kind="watch" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs text-vellum">
              {msg.setup.modelCallsField}
            </span>
            <span className="block truncate text-[11px] text-muted">
              {enabled ? msg.setup.modelCallsOn : msg.setup.modelCallsOff}
            </span>
          </span>
          <span
            aria-hidden
            className={cn(
              "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
              enabled ? "border-brass bg-brass-soft" : "border-ink-line bg-ink-raised",
            )}
          >
            <span
              className={cn(
                "absolute top-1/2 size-4 -translate-y-1/2 rounded-full bg-vellum transition-transform",
                enabled ? "translate-x-5" : "translate-x-1",
              )}
            />
          </span>
        </>
      )}
    </button>
  );
}

function DeleteReviewDialog({
  review,
  deleting,
  error,
  onClose,
  onConfirm,
}: {
  review: ReviewSummary | null;
  deleting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const msg = useMessages();
  const locale = useLocale();
  const brief = review ? describeHistoryItem(review, msg, locale) : null;

  return (
    <Dialog.Root open={review !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-veil fixed inset-0 z-40 bg-scrim " />
        <Dialog.Content
          className={cn(
            "dialog-rise fixed left-1/2 top-1/2 z-50 w-[min(24rem,calc(100vw-1rem))]",
            "-translate-x-1/2 -translate-y-1/2",
            "rounded-lg border border-ink-line ui-surface p-5 ui-elevation outline-none",
          )}
        >
          <Dialog.Title className="font-display text-xl tracking-[var(--track-1)] text-vellum">
            {msg.history.deleteTitle}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted">
            {brief ? msg.history.deleteDescription(brief.title) : msg.history.deleteDescription("")}
          </Dialog.Description>

          {error && (
            <p role="alert" className="mt-3 text-xs leading-relaxed text-mordred">
              {error}
            </p>
          )}

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={deleting}
                className="min-h-11 rounded-lg border border-ink-line px-4 text-sm text-muted transition-colors hover:border-muted hover:text-vellum disabled:cursor-not-allowed"
              >
                {msg.history.deleteCancel}
              </button>
            </Dialog.Close>
            <button
              type="button"
              disabled={deleting}
              onClick={onConfirm}
              className="min-h-11 rounded-lg border border-mordred px-4 text-sm text-mordred transition-colors hover:bg-mordred-fill hover:text-vellum disabled:cursor-not-allowed"
            >
              {deleting ? msg.history.deleting : msg.history.deleteConfirm}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AccountDialog({
  collapsed = false,
  email,
  credits,
  creditsLoading,
  creditsError,
}: {
  collapsed?: boolean;
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
    ? msg.auth.creditsTotal(credits.gamesRemaining)
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
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={msg.auth.accountInfo}
          title={collapsed ? msg.auth.accountInfo : undefined}
          className={cn(
            "flex border border-ink-line bg-ink text-left transition-colors hover:border-muted",
            collapsed
              ? "size-10 shrink-0 items-center justify-center rounded-lg"
              : "mt-4 w-full items-center gap-3 rounded-lg px-3 py-2",
          )}
        >
          <UserCircle className="size-5 shrink-0 text-brass" aria-hidden />
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs text-vellum">{email}</span>
              <span className="tabular block truncate text-[11px] text-muted">{creditLine}</span>
            </span>
          )}
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="dialog-veil fixed inset-0 z-40 bg-scrim " />
        <Dialog.Content
          className={cn(
            "dialog-rise fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-1rem)] w-[min(32rem,calc(100vw-1rem))]",
            "-translate-x-1/2 -translate-y-1/2",
            "overflow-y-auto rounded-lg border border-ink-line ui-surface p-5 text-sm ui-elevation outline-none",
          )}
        >
          <div className="pr-12">
            <Dialog.Title className="font-display text-xl tracking-[var(--track-1)] text-vellum">
              {msg.auth.accountInfo}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted">
              {msg.auth.accountDialogDescription}
            </Dialog.Description>
          </div>

          <Dialog.Close asChild>
            <button
              type="button"
              aria-label={msg.auth.accountCloseAria}
              className="absolute right-4 top-4 grid size-11 place-content-center rounded-lg border border-ink-line text-xl text-muted transition-colors hover:border-muted hover:text-vellum"
            >
              <span aria-hidden>×</span>
            </button>
          </Dialog.Close>

          <p className="mt-5 text-xs text-muted">{msg.auth.email}</p>
          <p className="mt-1 break-all text-vellum">{email}</p>

          <div className="mt-4 rounded-lg border border-ink-line bg-ink px-3 py-2">
            {creditsLoading ? (
              <p className="text-xs text-muted">{msg.auth.creditsLoading}</p>
            ) : credits ? (
              <p className="tabular text-vellum">
                {msg.auth.creditsTotal(credits.gamesRemaining)}
              </p>
            ) : (
              <p className="text-xs text-muted">{creditsError ?? msg.auth.creditsUnavailable}</p>
            )}
          </div>


          {notice && <p className="mt-3 text-xs leading-relaxed text-success">{notice}</p>}
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
              className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ink-line px-3 text-sm text-muted transition-colors hover:border-brass hover:text-vellum disabled:cursor-not-allowed"
            >
              <MetalIcon kind="key" className="size-6" />
              {busy === "password" ? msg.auth.sendingPasswordReset : msg.auth.changePassword}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={signOut}
              className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ink-line px-3 text-sm text-muted transition-colors hover:border-mordred hover:text-vellum disabled:cursor-not-allowed"
            >
              <LogOut className="size-4" aria-hidden />
              {busy === "signOut" ? msg.auth.signingOut : msg.auth.signOut}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
