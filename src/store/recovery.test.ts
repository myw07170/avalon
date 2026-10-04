import { createStore } from "jotai";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "@/lib/active-game.test-helpers";
import { createConfig } from "@/lib/game";
import { localeAtom } from "@/i18n/locale-atom";
import {
  initializeRecoveryAtom, disposeRecoveryAtom, beginGameAtom, recoverySummaryAtom, recoveryCheckedAtom,
  recoveryErrorAtom, aiModeAtom, runStatusAtom, gameStateAtom, runGameAtom, humanTurnAtom,
  saveAndExitAtom, resumeSavedGameAtom, submitActionAtom, userLlmConfigAtom, revealAtom,
  reviewDecisionsAtom, liveDecisionsAtom, paceMsAtom, togglePauseAtom, pausedAtom,
} from "./game";

let storage: MemoryStorage;
let store: ReturnType<typeof createStore>;
const key = "avalon:active-game:v1:local";
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
beforeEach(() => {
  storage = new MemoryStorage(); store = createStore();
  vi.stubGlobal("window", { localStorage: storage, dispatchEvent: vi.fn(), confirm: () => true });
  vi.stubGlobal("navigator", {});
});
afterEach(() => { store.set(disposeRecoveryAtom); vi.unstubAllGlobals(); });
async function start(humanSeat: number | null = 0) {
  await store.set(initializeRecoveryAtom, null);
  store.set(aiModeAtom, "mock"); store.set(paceMsAtom, 0);
  await store.set(beginGameAtom, { config: createConfig(5, { seed: 23 }), humanSeat, avatarSeed: 44 });
  expect(store.get(recoveryErrorAtom)).toBeNull();
  expect(store.get(runStatusAtom)).toBe("ready");
}

describe("store recovery lifecycle", () => {
  it("restores the same deal and waiting human action without exposing private information", async () => {
    await start();
    const gameId = JSON.parse(storage.getItem(key)!).snapshot.gameId;
    const run = store.set(runGameAtom);
    for (let n = 0; n < 300 && !store.get(humanTurnAtom); n++) await tick();
    const turn = store.get(humanTurnAtom)!;
    expect(turn).not.toBeNull();
    await store.set(saveAndExitAtom);
    await run;
    expect(store.get(runStatusAtom)).toBe("idle");
    expect(store.get(recoverySummaryAtom)?.gameId).toBe(gameId);
    const savedState = JSON.parse(storage.getItem(key)!).snapshot.checkpoint.state;
    await store.set(resumeSavedGameAtom, { gameId });
    for (let n = 0; n < 300 && !store.get(humanTurnAtom); n++) await tick();
    expect(store.get(gameStateAtom)).toEqual(savedState);
    expect(store.get(humanTurnAtom)?.kind).toBe(turn.kind);
    expect(store.get(reviewDecisionsAtom)).toEqual([]);
    expect(store.get(liveDecisionsAtom)).toEqual([]);
    expect(store.get(revealAtom)).toBeNull();
    store.set(submitActionAtom, store.get(humanTurnAtom)!.legalActions[0]!);
    await tick();
    expect(store.get(recoveryErrorAtom)).toBeNull();
  });
  it("preserves ready state across a fresh store and clears secrets on owner changes", async () => {
    await start();
    const before = store.get(gameStateAtom);
    store.set(userLlmConfigAtom, { provider: "openai", model: "test", apiKey: "secret" });
    store.set(disposeRecoveryAtom);
    expect(store.get(userLlmConfigAtom)).toBeNull();
    store = createStore();
    await store.set(initializeRecoveryAtom, null);
    expect(store.get(recoveryCheckedAtom)).toBe(true);
    expect(store.get(runStatusAtom)).toBe("idle");
    await store.set(resumeSavedGameAtom, { gameId: store.get(recoverySummaryAtom)!.gameId });
    expect(store.get(runStatusAtom)).toBe("ready");
    expect(store.get(gameStateAtom)).toEqual(before);
    expect(storage.getItem(key)).not.toContain("secret");
  });
  it("keeps paused spectator games stopped after restore and preserves the original language", async () => {
    store.set(localeAtom, "en");
    await start(null);
    store.set(togglePauseAtom);
    await store.set(saveAndExitAtom);
    const gameId = store.get(recoverySummaryAtom)!.gameId;
    store.set(localeAtom, "zh");
    await store.set(resumeSavedGameAtom, { gameId });
    expect(store.get(pausedAtom)).toBe(true);
    const run = store.set(runGameAtom);
    await tick(); await tick();
    expect(store.get(gameStateAtom)?.phase).toBe("SETUP");
    expect(JSON.parse(storage.getItem(key)!).snapshot.locale).toBe("en");
    store.set(togglePauseAtom);
    await run;
    expect(store.get(runStatusAtom)).toBe("finished");
    expect(storage.getItem(key)).toBeNull();
  });
});
