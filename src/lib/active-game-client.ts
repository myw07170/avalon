import { parseActiveGameSnapshot, summarizeActiveGame, type ActiveGameSnapshot, type ActiveGameEnvelope, type ActiveGameSummary } from "./active-game";

export class SaveError extends Error {
  constructor(readonly code: string) { super(code); }
}
type Backup = ActiveGameEnvelope & { leaseUntil?: number };

/** Browser-only transport. Full snapshots never leave the store/persistence boundary. */
export class ActiveGamePersistence {
  readonly writerId = crypto.randomUUID();
  readonly key: string;
  envelope: Backup | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private failure: unknown = null;
  private stopped = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  onLost: (code: string) => void = () => {};
  onLocalFailure: () => void = () => {};
  private storage: Storage;

  constructor(readonly owner: string | null, storage?: Storage) {
    this.key = `avalon:active-game:v1:${owner ?? "local"}`;
    try { this.storage = storage ?? window.localStorage; }
    catch {
      const unavailable = () => { throw new SaveError("LOCAL_UNAVAILABLE"); };
      this.storage = { length: 0, getItem: unavailable, setItem: unavailable, removeItem: unavailable, clear: unavailable, key: unavailable };
    }
  }
  private async request(path: string, method = "GET", body?: unknown) {
    let response: Response;
    try { response = await fetch(path, { method, cache: "no-store", ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) }); }
    catch { throw new SaveError("SAVE_UNAVAILABLE"); }
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new SaveError(result?.code ?? "SAVE_UNAVAILABLE");
    return result;
  }
  private backup(): Backup | null {
    const raw = this.storage.getItem(this.key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Backup;
    value.snapshot = parseActiveGameSnapshot(value.snapshot);
    if (!value.handle || value.handle.gameId !== value.snapshot.gameId || !Number.isSafeInteger(value.handle.epoch) || !Number.isSafeInteger(value.handle.revision)) throw new SaveError("INVALID_SAVE");
    return value;
  }
  private write(value: Backup) {
    try { this.storage.setItem(this.key, JSON.stringify(value)); }
    catch { if (!this.owner) throw new SaveError("LOCAL_UNAVAILABLE"); this.onLocalFailure(); }
  }
  private async localLock<T>(run: () => T | Promise<T>): Promise<T> {
    if (typeof navigator !== "undefined" && navigator.locks) return await navigator.locks.request(this.key, run);
    return Promise.resolve().then(run);
  }
  async summary(): Promise<ActiveGameSummary | null> {
    if (this.owner) {
      const { summary } = await this.request("/api/active-game");
      if (!summary) { try { this.storage.removeItem(this.key); } catch { this.onLocalFailure(); } }
      return summary;
    }
    try { const saved = this.backup(); return saved ? summarizeActiveGame(saved.snapshot, (saved.leaseUntil ?? 0) > Date.now()) : null; }
    catch { return { gameId: "invalid", compatible: false } as ActiveGameSummary; }
  }
  async start(snapshot: ActiveGameSnapshot): Promise<ActiveGameEnvelope> {
    this.stopped = false;
    this.failure = null;
    this.queue = Promise.resolve();
    if (this.owner) {
      this.envelope = await this.request("/api/game-sessions", "POST", { snapshot, writerId: this.writerId });
      this.write(this.envelope!);
    } else {
      await this.localLock(() => {
        if (this.storage.getItem(this.key)) throw new SaveError("GAME_EXISTS");
        this.envelope = { snapshot, handle: { gameId: snapshot.gameId, writerId: this.writerId, epoch: 1, revision: 0 }, leaseUntil: Date.now() + 45000 };
        this.write(this.envelope);
      });
    }
    if (!this.stopped) this.startHeartbeat();
    return this.envelope!;
  }
  async resume(gameId: string, takeover: boolean): Promise<ActiveGameEnvelope> {
    this.stopped = false;
    let backup: Backup | null = null;
    try { backup = this.backup(); } catch { /* Cloud remains authoritative. */ }
    if (this.owner) {
      this.envelope = await this.request("/api/active-game/resume", "POST", { gameId, writerId: this.writerId, takeover, ...(backup?.handle.gameId === gameId ? { backup } : {}) });
      this.envelope!.snapshot = parseActiveGameSnapshot(this.envelope!.snapshot);
      this.write(this.envelope!);
    } else {
      await this.localLock(() => {
        const saved = this.backup();
        if (!saved || saved.handle.gameId !== gameId) throw new SaveError("GAME_GONE");
        if ((saved.leaseUntil ?? 0) > Date.now() && saved.handle.writerId !== this.writerId && !takeover) throw new SaveError("GAME_OCCUPIED");
        this.envelope = { ...saved, handle: { ...saved.handle, writerId: this.writerId, epoch: saved.handle.epoch + 1 }, leaseUntil: Date.now() + 45000 };
        this.write(this.envelope);
      });
    }
    this.failure = null;
    this.queue = Promise.resolve();
    if (!this.stopped) this.startHeartbeat();
    return this.envelope!;
  }
  save(snapshot: ActiveGameSnapshot): Promise<void> {
    if (this.stopped || !this.envelope) return Promise.reject(new SaveError("GAME_CONFLICT"));
    const next: Backup = { snapshot, handle: { ...this.envelope.handle, revision: this.envelope.handle.revision + 1 }, leaseUntil: Date.now() + 45000 };
    this.envelope = next;
    // Cloud backups are synchronous. Local-only writes must check ownership under a lock.
    if (this.owner) {
      let previous: Backup | null = null;
      try { previous = this.backup(); } catch { this.onLocalFailure(); }
      if (previous && (previous.handle.gameId !== next.handle.gameId || previous.handle.epoch > next.handle.epoch)) return Promise.reject(new SaveError("GAME_CONFLICT"));
      this.write(next);
    }
    const job = this.queue.then(async () => {
      if (this.failure) throw this.failure;
      if (this.stopped) throw new SaveError("GAME_CONFLICT");
      if (this.owner) await this.request("/api/active-game", "PUT", { snapshot, handle: next.handle });
      else await this.localLock(() => { this.verifyLocal(next); this.write(next); });
    });
    this.queue = job.catch(error => { this.failure = error; });
    return job;
  }
  private verifyLocal(next: Backup) {
    const current = this.backup();
    if (!current || current.handle.gameId !== next.handle.gameId || current.handle.epoch !== next.handle.epoch || current.handle.writerId !== this.writerId || (current.leaseUntil ?? 0) <= Date.now()) throw new SaveError("GAME_CONFLICT");
  }
  async flush() { await this.queue; if (this.failure) throw this.failure; }
  private startHeartbeat() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => { void this.heartbeat().catch(error => {
      this.stop(); this.onLost(error instanceof SaveError ? error.code : "SAVE_UNAVAILABLE");
    }); }, 15000);
  }
  async heartbeat() {
    if (!this.envelope || this.stopped) return;
    if (this.owner) await this.request("/api/active-game/lease", "PUT", this.envelope.handle);
    else await this.localLock(() => {
      this.verifyLocal(this.envelope!);
      const current = this.backup()!;
      this.write({ ...current, leaseUntil: Date.now() + 45000 });
    });
  }
  async release() {
    if (!this.envelope) return;
    this.stop();
    if (this.owner) await this.request("/api/active-game/lease", "DELETE", this.envelope.handle);
    else await this.localLock(() => { this.verifyLocal(this.envelope!); const current = this.backup()!; this.write({ ...current, leaseUntil: 0 }); });
  }
  async abandon(gameId: string) {
    this.stop();
    await this.queue;
    if (this.owner) await this.request("/api/active-game", "DELETE", { gameId, takeover: true });
    await this.localLock(() => {
      let current: Backup | null;
      try { current = this.backup(); } catch { current = null; }
      if (!current || current.handle.gameId === gameId) this.storage.removeItem(this.key);
    });
    this.envelope = null;
  }
  async finish() {
    try { await this.flush(); }
    catch {
      if (!this.envelope) throw new SaveError("GAME_GONE");
      await this.resume(this.envelope.handle.gameId, false);
      if (this.envelope.snapshot.checkpoint.state.phase !== "GAME_OVER") throw new SaveError("GAME_CONFLICT");
    }
    if (!this.envelope) return;
    if (this.owner) {
      try { await this.request("/api/active-game/finish", "POST", this.envelope.handle); }
      catch (error) {
        if (!(error instanceof SaveError) || error.code !== "GAME_CONFLICT") throw error;
        // A retry after a network outage may outlive its lease. Never force a
        // takeover here: an occupied game still requires the user's confirmation.
        await this.resume(this.envelope.handle.gameId, false);
        if (this.envelope.snapshot.checkpoint.state.phase !== "GAME_OVER") throw new SaveError("GAME_CONFLICT");
        await this.request("/api/active-game/finish", "POST", this.envelope.handle);
      }
      try {
        const saved = this.backup();
        if (saved?.handle.gameId === this.envelope.handle.gameId) this.storage.removeItem(this.key);
      } catch { this.onLocalFailure(); }
    } else {
      const complete = () => this.localLock(() => { this.verifyLocal(this.envelope!); this.storage.removeItem(this.key); });
      try { await complete(); }
      catch (error) {
        if (!(error instanceof SaveError) || error.code !== "GAME_CONFLICT") throw error;
        await this.resume(this.envelope.handle.gameId, false);
        if (this.envelope.snapshot.checkpoint.state.phase !== "GAME_OVER") throw new SaveError("GAME_CONFLICT");
        await complete();
      }
    }
    this.stop();
    this.envelope = null;
  }
  pagehide() {
    this.stop();
    if (!this.envelope) return;
    if (this.owner) navigator.sendBeacon("/api/active-game/lease", new Blob([JSON.stringify(this.envelope.handle)], { type: "application/json" }));
    else {
      try { this.verifyLocal(this.envelope); this.write({ ...this.backup()!, leaseUntil: 0 }); } catch { /* Newer owner wins. */ }
    }
  }
  stop() { this.stopped = true; if (this.timer) clearInterval(this.timer); this.timer = null; }
}
