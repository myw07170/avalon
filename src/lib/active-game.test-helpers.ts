import { createConfig, createGame, createRng, makePlaceholderPersonas } from "./game";
import type { ActiveGameSnapshot } from "./active-game";

export function savedGame(seed = 42, humanSeat: number | null = null): ActiveGameSnapshot {
  const rng = createRng(seed);
  const state = createGame({ config: createConfig(5, { seed }), humanSeat, personas: makePlaceholderPersonas(humanSeat === null ? 5 : 4), rng });
  return {
    schemaVersion: 1, gameId: crypto.randomUUID(), gameSessionId: null, savedAt: new Date().toISOString(),
    checkpoint: { state, batch: null }, decisions: [], rngState: rng.getState(), humanSeat, avatarSeed: 55,
    locale: "en", aiMode: "mock", model: null, paused: false, revealedSeats: [], paceMs: 0,
  };
}

export class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, value); }
}
