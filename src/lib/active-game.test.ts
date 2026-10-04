import { describe, expect, it } from "vitest";
import { createRng } from "./game";
import { runGame, type RunCheckpoint, type DecisionRecord } from "./ai/orchestrator";
import { createMockAiClient } from "./ai/mock";
import { parseActiveGameSnapshot, summarizeActiveGame } from "./active-game";
import { savedGame } from "./active-game.test-helpers";

describe("durable game checkpoints", () => {
  it("restores the RNG accumulator without changing its sequence", () => {
    const rng = createRng(129);
    Array.from({ length: 27 }, rng);
    const restored = createRng(rng.getState());
    expect(Array.from({ length: 100 }, restored)).toEqual(Array.from({ length: 100 }, rng));
  });
  it("rejects unsupported versions, keys, invalid seats and inconsistent roles", () => {
    const snapshot = savedGame();
    expect(parseActiveGameSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
    expect(() => parseActiveGameSnapshot({ ...snapshot, schemaVersion: 2 })).toThrow();
    expect(() => parseActiveGameSnapshot({ ...snapshot, model: { provider: "openai", model: "test", apiKey: "secret" } })).toThrow();
    expect(() => parseActiveGameSnapshot({ ...snapshot, humanSeat: 9 })).toThrow();
    snapshot.checkpoint.state.players[0]!.role = "OBERON";
    expect(() => parseActiveGameSnapshot(snapshot)).toThrow();
  });
  it("lobby summaries contain no identity, private votes or reasoning", () => {
    const summary = summarizeActiveGame(savedGame());
    expect(Object.keys(summary).sort()).toEqual(["gameId", "savedAt", "playerCount", "humanSeat", "phase", "missionIndex", "aiMode", "needsApiKey", "occupied", "compatible"].sort());
  });
  it.each([1, 7, 23])("every checkpoint, including partially returned/committed batches, resumes to the identical game (seed %i)", async (seed) => {
    const snapshot = savedGame(seed, 0);
    const rng = createRng(snapshot.rngState);
    const checkpoints: { checkpoint: RunCheckpoint; rngState: number; decisions: DecisionRecord[] }[] = [];
    const records: DecisionRecord[] = [];
    const final = await runGame({ state: snapshot.checkpoint.state, rng, client: createMockAiClient(rng), isolatedRng: true, clientForTurn: createMockAiClient,
      onHumanAction: async turn => turn.legalActions[0]!,
      hooks: { onCheckpoint: (checkpoint, committed) => {
        if (committed) records.push(committed);
        checkpoints.push({ checkpoint, rngState: rng.getState(), decisions: [...records] });
      } },
    });
    expect(checkpoints.some(c => c.checkpoint.batch?.turns.some(t => t === null) && c.checkpoint.batch.turns.some(t => t !== null))).toBe(true);
    expect(checkpoints.some(c => (c.checkpoint.batch?.cursor ?? 0) > 0)).toBe(true);
    // Cover every boundary, not just phases where the UI waits for the player.
    for (const point of checkpoints) {
      const durable = parseActiveGameSnapshot(JSON.parse(JSON.stringify({ ...snapshot, ...point })));
      const restoredRng = createRng(durable.rngState);
      const decisions = [...durable.decisions];
      const resumed = await runGame({ state: durable.checkpoint.state, checkpoint: durable.checkpoint, rng: restoredRng,
        client: createMockAiClient(restoredRng), isolatedRng: true, clientForTurn: createMockAiClient,
        onHumanAction: async turn => turn.legalActions[0]!,
        hooks: { onCheckpoint: (_next, committed) => { if (committed) decisions.push(committed); } },
      });
      expect(resumed).toEqual(final);
      expect(decisions.map(d => d.action)).toEqual(records.map(d => d.action));
    }
  }, 20000);
  it("aborting during the decision animation never commits the action", async () => {
    const snapshot = savedGame();
    const rng = createRng(snapshot.rngState);
    const controller = new AbortController();
    let last: RunCheckpoint = snapshot.checkpoint;
    await expect(runGame({ state: last.state, rng, client: createMockAiClient(rng), signal: controller.signal,
      hooks: { onCheckpoint: cp => { last = cp; }, onDecision: () => controller.abort() },
    })).rejects.toThrow();
    expect(last.state.phase).toBe("TEAM_BUILDING");
    expect(last.batch?.cursor).toBe(0);
    expect(last.batch?.turns[0]).not.toBeNull();
  });
});
