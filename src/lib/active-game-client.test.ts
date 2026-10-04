import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActiveGamePersistence } from "./active-game-client";
import { MemoryStorage, savedGame } from "./active-game.test-helpers";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
beforeEach(() => vi.stubGlobal("navigator", {}));
describe("local saves and writer ownership", () => {
  it("refreshes, takes over and rejects the stale tab's writes", async () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const first = new ActiveGamePersistence(null, storage);
    const snapshot = savedGame();
    await first.start(snapshot);
    const second = new ActiveGamePersistence(null, storage);
    expect((await second.summary())?.occupied).toBe(true);
    await expect(second.resume(snapshot.gameId, false)).rejects.toMatchObject({ code: "GAME_OCCUPIED" });
    await second.resume(snapshot.gameId, true);
    await expect(first.save({ ...snapshot, paused: true })).rejects.toMatchObject({ code: "GAME_CONFLICT" });
    expect(second.envelope!.snapshot.paused).toBe(false);
    await second.release();
    const third = new ActiveGamePersistence(null, storage);
    await third.resume(snapshot.gameId, false);
    expect(third.envelope!.snapshot).toEqual(snapshot);
    third.stop(); first.stop();
  });
  it("blocks a second start and cannot resurrect an abandoned game", async () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const first = new ActiveGamePersistence(null, storage);
    const snapshot = savedGame();
    await first.start(snapshot);
    const second = new ActiveGamePersistence(null, storage);
    await expect(second.start(savedGame())).rejects.toMatchObject({ code: "GAME_EXISTS" });
    await second.abandon(snapshot.gameId);
    await expect(first.save(snapshot)).rejects.toMatchObject({ code: "GAME_CONFLICT" });
    expect(await second.summary()).toBeNull();
    first.stop();
  });
  it("preserves a terminal snapshot until completion succeeds", async () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const client = new ActiveGamePersistence("user-1", storage);
    const snapshot = savedGame();
    const handle = { gameId: snapshot.gameId, writerId: client.writerId, epoch: 1, revision: 0 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ snapshot, handle })).mockRejectedValueOnce(new Error("offline")));
    await client.start(snapshot);
    await expect(client.save({ ...snapshot, paused: true })).rejects.toMatchObject({ code: "SAVE_UNAVAILABLE" });
    const backup = JSON.parse(storage.getItem(client.key)!);
    expect(backup.snapshot.paused).toBe(true);
    expect(backup.handle.revision).toBe(1);
    await expect(client.flush()).rejects.toMatchObject({ code: "SAVE_UNAVAILABLE" });
    client.stop();
  });
  it("storage denial fails local play instead of claiming it was saved", async () => {
    const storage = new MemoryStorage();
    vi.spyOn(storage, "setItem").mockImplementation(() => { throw new Error("denied"); });
    const client = new ActiveGamePersistence(null, storage);
    await expect(client.start(savedGame())).rejects.toMatchObject({ code: "LOCAL_UNAVAILABLE" });
    client.stop();
  });
  it("reacquires an expired lease when retrying completion without forcing takeover", async () => {
    vi.useFakeTimers();
    const storage = new MemoryStorage();
    const client = new ActiveGamePersistence("user-1", storage);
    const snapshot = savedGame();
    snapshot.checkpoint.state.phase = "GAME_OVER";
    snapshot.checkpoint.state.winner = "EVIL";
    snapshot.checkpoint.state.winReason = "REJECT_LIMIT";
    const handle = { gameId: snapshot.gameId, writerId: client.writerId, epoch: 1, revision: 0 };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ snapshot, handle }))
      .mockResolvedValueOnce(Response.json({ code: "GAME_CONFLICT" }, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ snapshot, handle: { ...handle, epoch: 2 } }))
      .mockResolvedValueOnce(Response.json({}));
    vi.stubGlobal("fetch", fetchMock);
    await client.start(snapshot);
    await client.finish();
    expect(JSON.parse(fetchMock.mock.calls[2]![1].body).takeover).toBe(false);
    expect(storage.getItem(client.key)).toBeNull();
    expect(client.envelope).toBeNull();
  });
});
