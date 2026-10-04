import { z } from "zod";
import { parseActiveGameSnapshot, summarizeActiveGame, type ActiveGameEnvelope } from "@/lib/active-game";
import { createSavedReviewSnapshot } from "@/lib/reviews";
import { toPlayerView, toSpectatorView } from "@/lib/game";
import { createSupabaseAdminClient } from "./route";
import { readMaxAiCallsPerGame } from "./quota";

export class ActiveGameError extends Error {
  constructor(readonly code: string, readonly status = 409) { super(code); }
}
export const handleSchema = z.object({ gameId: z.string().uuid(), writerId: z.string().uuid(), epoch: z.number().int().positive(), revision: z.number().int().nonnegative() });

export async function activeGameCommand(userId: string, operation: string, payload: unknown = {}): Promise<(ActiveGameEnvelope & { occupied: boolean }) | null> {
  const { data, error } = await createSupabaseAdminClient().rpc("active_game_command", { p_user_id: userId, p_operation: operation, p_payload: payload });
  if (error) {
    const known = ["GAME_EXISTS", "GAME_GONE", "GAME_OCCUPIED", "GAME_CONFLICT", "NO_GAME_CREDITS", "AI_CALL_LIMIT_REACHED", "GAME_SESSION_CLOSED", "GAME_SESSION_NOT_FOUND"];
    const code = known.find(c => error.message.includes(c));
    if (code) throw new ActiveGameError(code, code === "GAME_GONE" ? 404 : code === "NO_GAME_CREDITS" ? 402 : code === "AI_CALL_LIMIT_REACHED" ? 429 : 409);
    console.error("[active-game] database operation failed", operation, error.code);
    throw new ActiveGameError("SAVE_UNAVAILABLE", 503);
  }
  return data;
}

export async function startActiveGame(userId: string, raw: unknown) {
  const input = z.object({ snapshot: z.unknown(), writerId: z.string().uuid() }).parse(raw);
  const snapshot = parseActiveGameSnapshot(input.snapshot);
  if (snapshot.checkpoint.state.phase !== "SETUP" || snapshot.checkpoint.batch || snapshot.decisions.length || snapshot.gameSessionId) throw new ActiveGameError("INVALID_SAVE", 400);
  return activeGameCommand(userId, "start", { ...input, snapshot, aiCallLimit: readMaxAiCallsPerGame() });
}

export async function activeSummary(userId: string) {
  const envelope = await activeGameCommand(userId, "read");
  if (!envelope) return null;
  try { return summarizeActiveGame(parseActiveGameSnapshot(envelope.snapshot), envelope.occupied); }
  catch {
    return { gameId: envelope.handle.gameId, compatible: false, occupied: envelope.occupied };
  }
}

export async function resumeActiveGame(userId: string, raw: unknown) {
  const input = z.object({ gameId: z.string().uuid(), writerId: z.string().uuid(), takeover: z.boolean().default(false), backup: z.object({ snapshot: z.unknown(), handle: handleSchema }).optional() }).parse(raw);
  if (input.backup) input.backup.snapshot = parseActiveGameSnapshot(input.backup.snapshot);
  const envelope = await activeGameCommand(userId, "resume", input);
  if (!envelope) throw new ActiveGameError("GAME_GONE", 404);
  envelope.snapshot = parseActiveGameSnapshot(envelope.snapshot);
  return envelope;
}

export async function saveActiveGame(userId: string, raw: unknown) {
  const input = z.object({ handle: handleSchema, snapshot: z.unknown() }).parse(raw);
  const snapshot = parseActiveGameSnapshot(input.snapshot);
  return activeGameCommand(userId, "save", { ...input.handle, snapshot });
}

export async function finishActiveGame(userId: string, raw: unknown) {
  const handle = handleSchema.parse(raw);
  const current = await activeGameCommand(userId, "read");
  if (!current || current.handle.gameId !== handle.gameId) {
    // Only a previously completed request is accepted by this idempotent RPC path.
    return activeGameCommand(userId, "finish", handle);
  }
  const envelope = await activeGameCommand(userId, "verify", handle);
  if (!envelope) throw new ActiveGameError("GAME_GONE", 404);
  const snapshot = parseActiveGameSnapshot(envelope.snapshot);
  const state = snapshot.checkpoint.state;
  const review = createSavedReviewSnapshot({ view: snapshot.humanSeat === null ? toSpectatorView(state) : toPlayerView(state, snapshot.humanSeat), decisions: snapshot.decisions, avatarSeed: snapshot.avatarSeed });
  if (!review) throw new ActiveGameError("INVALID_SAVE", 400);
  return activeGameCommand(userId, "finish", { ...handle, review });
}

/** Active sessions require the current writer even if an old client omits the header. */
export async function verifyActiveGameRequest(userId: string, sessionId: string, header: string | null) {
  const envelope = await activeGameCommand(userId, "read");
  if (!envelope || envelope.snapshot.gameSessionId !== sessionId) return;
  let handle;
  try { handle = handleSchema.parse(JSON.parse(header ?? "null")); }
  catch { throw new ActiveGameError("GAME_CONFLICT"); }
  if (handle.gameId !== envelope.handle.gameId) throw new ActiveGameError("GAME_CONFLICT");
  await activeGameCommand(userId, "verify", handle);
}

/** Old review URLs cannot bypass the lease or leave an active save behind. */
export async function finishActiveGameFromReviewRequest(userId: string, sessionId: string, header: string | null): Promise<boolean> {
  const envelope = await activeGameCommand(userId, "read");
  if (!envelope || envelope.snapshot.gameSessionId !== sessionId) return false;
  await verifyActiveGameRequest(userId, sessionId, header);
  await finishActiveGame(userId, JSON.parse(header!));
  return true;
}

/** Lease verification and quota consumption share the same account transaction. */
export async function authorizeActiveGameAiCall(userId: string, sessionId: string, header: string | null, source: "user" | "platform"): Promise<boolean> {
  const envelope = await activeGameCommand(userId, "read");
  if (!envelope || envelope.snapshot.gameSessionId !== sessionId) return false;
  let handle;
  try { handle = handleSchema.parse(JSON.parse(header ?? "null")); }
  catch { throw new ActiveGameError("GAME_CONFLICT"); }
  if (handle.gameId !== envelope.handle.gameId) throw new ActiveGameError("GAME_CONFLICT");
  await activeGameCommand(userId, "authorize_ai", { ...handle, sessionId, source });
  return true;
}
