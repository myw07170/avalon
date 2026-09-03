"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useLocale, useMessages } from "@/i18n/useMessages";
import type { PlayerId } from "@/lib/game";
import {
  PERSONA_CATALOG,
  filterPersonaCatalog,
  localizedPersona,
  personaCatalogEntry,
  type PersonaSelectionMap,
} from "@/lib/persona-catalog";
import { PREVIEW_AVATAR_SEED } from "@/lib/seat-avatar";
import { cn } from "@/lib/utils";
import { SeatAvatar } from "./SeatAvatar";

interface PersonaLibraryProps {
  aiSeats: readonly PlayerId[];
  selections: PersonaSelectionMap;
  onSelect: (seat: PlayerId, personaId: string | null) => void;
  onClearAll: () => void;
}

export function PersonaLibrary({
  aiSeats,
  selections,
  onSelect,
  onClearAll,
}: PersonaLibraryProps) {
  const locale = useLocale();
  const msg = useMessages();
  const copy = msg.setup;
  const [activeSeat, setActiveSeat] = useState<PlayerId | null>(null);
  const [query, setQuery] = useState("");
  const filtered = filterPersonaCatalog(PERSONA_CATALOG, locale, query);
  const selectedCount = aiSeats.filter((seat) => selections[seat] !== undefined).length;

  const openSeat = (seat: PlayerId) => {
    setQuery("");
    setActiveSeat(seat);
  };

  const choose = (personaId: string | null) => {
    if (activeSeat === null) return;
    onSelect(activeSeat, personaId);
    setActiveSeat(null);
  };

  const usedBy = (personaId: string): PlayerId | undefined => {
    const hit = Object.entries(selections).find(([, selected]) => selected === personaId);
    return hit ? Number(hit[0]) : undefined;
  };

  return (
    <>
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm leading-relaxed text-muted">{copy.personaNote}</p>
          <p className="tabular mt-1 text-xs text-brass">
            {copy.personaCount(selectedCount, aiSeats.length)}
          </p>
        </div>
        {selectedCount > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="min-h-11 shrink-0 rounded-lg border border-ink-line px-3 text-xs text-muted transition-colors hover:border-muted hover:text-vellum"
          >
            {copy.personaClearAll}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {aiSeats.map((seat) => {
          const selectedId = selections[seat];
          const entry = selectedId ? personaCatalogEntry(selectedId) : undefined;
          const persona = entry ? localizedPersona(entry, locale) : null;
          return (
            <button
              key={seat}
              type="button"
              onClick={() => openSeat(seat)}
              aria-label={copy.personaChooseAria(seat, persona?.name ?? copy.personaRandom)}
              className={cn(
                "group flex min-h-16 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                persona
                  ? "border-brass/70 bg-brass/10 text-vellum"
                  : "border-ink-line bg-ink-raised text-muted hover:border-muted hover:text-vellum",
              )}
            >
              <span
                className={cn(
                  "grid size-10 shrink-0 place-content-center rounded-full border",
                  persona ? "border-brass text-brass" : "border-ink-line text-muted",
                )}
              >
                <SeatAvatar
                  seed={PREVIEW_AVATAR_SEED}
                  id={seat}
                  className="size-5 fill-current opacity-80"
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="tabular block text-[10px] tracking-widest text-muted">
                  {copy.personaSeat(seat)}
                </span>
                <span className="mt-0.5 block truncate text-sm">
                  {persona?.name ?? copy.personaRandom}
                </span>
                {persona && (
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {persona.traits.join(" · ")}
                  </span>
                )}
              </span>
              <span aria-hidden className="text-brass opacity-60 group-hover:opacity-100">
                ›
              </span>
            </button>
          );
        })}
      </div>

      <Dialog.Root
        open={activeSeat !== null}
        onOpenChange={(open) => {
          if (!open) setActiveSeat(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-veil fixed inset-0 z-40 bg-scrim backdrop-blur-sm" />
          <Dialog.Content
            className={cn(
              "dialog-rise fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
              "flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-5xl flex-col overflow-hidden",
              "rounded-2xl border border-ink-line bg-ink-raised shadow-2xl",
            )}
          >
            <header className="shrink-0 border-b border-ink-line px-5 pb-4 pt-5 sm:px-7 sm:pt-6">
              <div className="pr-12">
                <Dialog.Title className="-mr-[var(--track-1)] font-display text-2xl tracking-[var(--track-1)] text-vellum sm:text-3xl">
                  {copy.personaDialogTitle(activeSeat ?? 0)}
                </Dialog.Title>
                <Dialog.Description className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                  {copy.personaDialogDescription}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label={copy.personaCloseAria}
                  className="absolute right-4 top-4 grid size-11 place-content-center rounded-lg border border-ink-line text-xl text-muted transition-colors hover:border-muted hover:text-vellum"
                >
                  <span aria-hidden>×</span>
                </button>
              </Dialog.Close>
              <label className="mt-5 block">
                <span className="sr-only">{copy.personaSearchAria}</span>
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={copy.personaSearchPlaceholder}
                  className="min-h-11 w-full rounded-lg border border-ink-line bg-ink px-4 text-sm text-vellum placeholder:text-muted focus:border-brass focus:outline-none"
                />
              </label>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
              <button
                type="button"
                onClick={() => choose(null)}
                className="mb-4 flex min-h-14 w-full items-center justify-between rounded-xl border border-dashed border-brass/60 bg-brass/5 px-4 text-left text-sm text-vellum transition-colors hover:bg-brass/10"
              >
                <span>
                  <span className="block font-medium">{copy.personaRandom}</span>
                  <span className="mt-0.5 block text-xs text-muted">{copy.personaRandomNote}</span>
                </span>
                <span aria-hidden className="text-lg text-brass">↻</span>
              </button>

              {filtered.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted">{copy.personaEmpty}</p>
              ) : (
                <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {filtered.map((entry) => {
                    const persona = localizedPersona(entry, locale);
                    const owner = usedBy(entry.id);
                    const selectedHere = owner === activeSeat;
                    const unavailable = owner !== undefined && !selectedHere;
                    return (
                      <li key={entry.id}>
                        <button
                          type="button"
                          disabled={unavailable}
                          aria-pressed={selectedHere}
                          onClick={() => choose(entry.id)}
                          className={cn(
                            "h-full min-h-40 w-full rounded-xl border p-4 text-left transition-colors",
                            selectedHere
                              ? "border-brass bg-brass/15"
                              : "border-ink-line bg-ink hover:border-muted",
                            unavailable && "cursor-not-allowed opacity-40",
                          )}
                        >
                          <span className="flex items-start justify-between gap-3">
                            <span className="font-display text-xl tracking-[var(--track-1)] text-vellum">
                              {persona.name}
                            </span>
                            {owner !== undefined && (
                              <span className="tabular rounded-full border border-brass/40 px-2 py-0.5 text-[10px] text-brass">
                                {copy.personaUsedBy(owner)}
                              </span>
                            )}
                          </span>
                          <span className="mt-2 flex flex-wrap gap-1.5">
                            {persona.traits.map((trait) => (
                              <span
                                key={trait}
                                className="rounded-full border border-ink-line px-2 py-0.5 text-[11px] text-muted"
                              >
                                {trait}
                              </span>
                            ))}
                          </span>
                          <span className="mt-3 block text-sm leading-relaxed text-vellum">
                            {persona.speechStyle}
                          </span>
                          <span className="mt-3 block border-t border-ink-line pt-3 text-xs leading-relaxed text-muted">
                            <span className="text-brass">{copy.personaReasoning}</span>
                            {persona.mind?.reasoningStyle}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
