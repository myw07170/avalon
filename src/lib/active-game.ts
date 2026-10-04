import { z } from "zod";
import { validateConfig, getAwaitingPlayerIds, assertLegal, reduce, createRng, toPlayerView, toSpectatorView } from "./game";
import type { GameState, GameAction } from "./game";
import type { DecisionRecord, RunCheckpoint } from "./ai/orchestrator";
import { AI_SCHEMAS, aiDecisionKindSchema } from "./ai/schema";
import { userLlmConfigSchema } from "./ai/user-config";

const seat = z.number().int().min(0).max(9);
const uint = z.number().int().min(0).max(0xffffffff);
const phase = z.enum(["SETUP", "ROLE_REVEAL", "TEAM_BUILDING", "PROPOSAL_DISCUSSION", "TEAM_VOTE", "MISSION_EXECUTION", "MISSION_RESULT", "ASSASSINATION", "GAME_OVER"]);
const role = z.enum(["MERLIN", "PERCIVAL", "LOYAL_SERVANT", "MORGANA", "ASSASSIN", "MORDRED", "OBERON", "MINION"]);
const team = z.enum(["GOOD", "EVIL"]);
const reason = z.enum(["ASSASSINATION_MISS", "THREE_MISSIONS", "ASSASSINATION_HIT", "REJECT_LIMIT"]);
const votes = z.record(z.string().regex(/^\d$/), z.boolean());
const cards = z.array(z.object({ playerId: seat, success: z.boolean() })).max(10);
const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("START_GAME") }), z.object({ type: z.literal("NEXT") }),
  z.object({ type: z.literal("ACKNOWLEDGE"), playerId: seat }),
  z.object({ type: z.literal("PROPOSE_TEAM"), playerId: seat, team: z.array(seat).max(10), statement: z.string() }),
  z.object({ type: z.literal("SPEAK"), playerId: seat, content: z.string() }),
  z.object({ type: z.literal("CAST_VOTE"), playerId: seat, approve: z.boolean() }),
  z.object({ type: z.literal("CAST_MISSION_CARD"), playerId: seat, success: z.boolean() }),
  z.object({ type: z.literal("ASSASSINATE"), playerId: seat, targetId: seat }),
]) satisfies z.ZodType<GameAction>;
const eventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("GAME_STARTED"), playerCount: z.number().int() }),
  z.object({ kind: z.literal("LEADER_CHANGED"), leaderId: seat, missionIndex: z.number().int() }),
  z.object({ kind: z.literal("TEAM_PROPOSED"), leaderId: seat, team: z.array(seat), attempt: z.number().int() }),
  z.object({ kind: z.literal("SPEECH"), seq: z.number().int(), playerId: seat }),
  z.object({ kind: z.literal("VOTE_RESOLVED"), approved: z.boolean(), votes, rejectCount: z.number().int() }),
  z.object({ kind: z.literal("MISSION_RESOLVED"), missionIndex: z.number().int(), succeeded: z.boolean(), failCount: z.number().int() }),
  z.object({ kind: z.literal("ASSASSINATION"), assassinId: seat, targetId: seat, hit: z.boolean() }),
  z.object({ kind: z.literal("GAME_OVER"), winner: team, reason }),
]);
const stateSchema = z.object({
  config: z.object({ playerCount: z.number().int().min(5).max(10), roles: z.array(role), missions: z.array(z.object({ teamSize: z.number().int(), failsRequired: z.number().int() })).length(5), maxRejects: z.number().int().positive(), forcePassOnLastAttempt: z.boolean(), seed: z.number().int() }),
  players: z.array(z.object({ id: seat, name: z.string(), role, isHuman: z.boolean(), persona: z.object({ name: z.string(), traits: z.array(z.string()), speechStyle: z.string(), avatar: z.string().optional(), mind: z.object({ reasoningStyle: z.string(), speechLengthHabit: z.string(), pressureStyle: z.string(), mistakePattern: z.string() }).optional() }).nullable() })).min(5).max(10),
  phase, missionIndex: z.number().int().min(0).max(4), currentLeaderId: seat, rejectCount: z.number().int().nonnegative(), proposedTeam: z.array(seat).nullable(),
  pending: z.object({ acknowledged: z.array(seat), votes, cards, speakingOrder: z.array(seat), speakerIndex: z.number().int().nonnegative() }),
  proposalHistory: z.array(z.object({ missionIndex: z.number().int(), attempt: z.number().int(), leaderId: seat, team: z.array(seat), votes, approved: z.boolean(), forced: z.boolean() })),
  missionHistory: z.array(z.object({ missionIndex: z.number().int(), attempt: z.number().int(), leaderId: seat, team: z.array(seat), cards, failCount: z.number().int(), succeeded: z.boolean() })).max(5),
  speeches: z.array(z.object({ seq: z.number().int(), playerId: seat, phase: z.enum(["TEAM_BUILDING", "PROPOSAL_DISCUSSION"]), missionIndex: z.number().int(), attempt: z.number().int(), content: z.string() })),
  goodScore: z.number().int().min(0).max(3), evilScore: z.number().int().min(0).max(3),
  assassination: z.object({ assassinId: seat, targetId: seat, hit: z.boolean() }).nullable(), winner: team.nullable(), winReason: reason.nullable(), log: z.array(eventSchema),
}) satisfies z.ZodType<GameState>;

const decisionSchema = z.object({
  playerId: seat, kind: aiDecisionKindSchema, phase, missionIndex: z.number().int(), action: actionSchema,
  result: z.object({ payload: z.unknown(), fallback: z.boolean() }),
  rescued: z.boolean(), auto: z.boolean(), latencyMs: z.number().nonnegative(),
}).superRefine((value, ctx) => {
  if (!AI_SCHEMAS[value.kind].safeParse(value.result.payload).success) ctx.addIssue({ code: "custom", message: "Invalid decision payload" });
}).transform((value) => value as DecisionRecord);

export const activeGameSnapshotSchema = z.strictObject({
  schemaVersion: z.literal(1), gameId: z.string().uuid(), gameSessionId: z.string().uuid().nullable(),
  savedAt: z.string().datetime(), checkpoint: z.object({ state: stateSchema, batch: z.object({ base: stateSchema, seats: z.array(seat).min(1).max(10), turns: z.array(z.object({ action: actionSchema, record: decisionSchema.nullable() }).nullable()).max(10), cursor: z.number().int().nonnegative(), seeds: z.array(uint).max(10).optional() }).nullable() }),
  decisions: z.array(decisionSchema), rngState: uint, humanSeat: seat.nullable(), avatarSeed: uint,
  locale: z.enum(["zh", "en"]), aiMode: z.enum(["mock", "remote"]),
  model: z.strictObject({ ...userLlmConfigSchema.shape, apiKey: z.never().optional() }).omit({ apiKey: true }).superRefine((value, ctx) => {
    if (!userLlmConfigSchema.safeParse({ ...value, apiKey: "validation-only" }).success) ctx.addIssue({ code: "custom", message: "Invalid model settings" });
  }).nullable(),
  paused: z.boolean(), revealedSeats: z.array(seat).max(10), paceMs: z.number().nonnegative().max(10000),
});
export type ActiveGameSnapshot = z.infer<typeof activeGameSnapshotSchema>;

/** Use one parser at both the HTTP and browser-storage boundaries. */
export class InvalidActiveGameSnapshot extends Error {
  constructor() { super("INVALID_SAVE"); }
}

export function parseActiveGameSnapshot(value: unknown): ActiveGameSnapshot {
  try { return validateSnapshot(value); }
  catch { throw new InvalidActiveGameSnapshot(); }
}

function validateSnapshot(value: unknown): ActiveGameSnapshot {
  const snapshot = activeGameSnapshotSchema.parse(value);
  const { state, batch } = snapshot.checkpoint;
  const checkState = (s: GameState) => {
    validateConfig(s.config);
    if (s.players.length !== s.config.playerCount || s.players.some((p, i) => p.id !== i || (!p.isHuman && !p.persona))) throw new Error("Invalid players");
    if (s.players.filter(p => p.isHuman).length !== (snapshot.humanSeat === null ? 0 : 1) || (snapshot.humanSeat !== null && !s.players[snapshot.humanSeat]?.isHuman)) throw new Error("Invalid human seat");
    const validSeats = (ids: number[]) => ids.every(id => id < s.players.length) && new Set(ids).size === ids.length;
    if (s.currentLeaderId >= s.players.length || !validSeats(s.proposedTeam ?? []) || !validSeats(s.pending.acknowledged) || !validSeats(s.pending.cards.map(c => c.playerId)) || !validSeats(Object.keys(s.pending.votes).map(Number)) || !validSeats(s.pending.speakingOrder) || s.pending.speakerIndex > s.pending.speakingOrder.length) throw new Error("Invalid pending state");
    if ([...s.config.roles].sort().join() !== s.players.map(p => p.role).sort().join()) throw new Error("Invalid roles");
    if ((s.phase === "GAME_OVER") !== (s.winner !== null && s.winReason !== null)) throw new Error("Invalid outcome");
    if (snapshot.humanSeat === null) toSpectatorView(s);
    else toPlayerView(s, snapshot.humanSeat);
  };
  checkState(state);
  if (batch) {
    checkState(batch.base);
    if (batch.cursor >= batch.seats.length || (batch.seeds && batch.seeds.length !== batch.seats.length) || batch.turns.length !== batch.seats.length || JSON.stringify(getAwaitingPlayerIds(batch.base)) !== JSON.stringify(batch.seats)) throw new Error("Invalid batch");
    let committed = batch.base;
    batch.turns.forEach((turn, index) => {
      if (!turn) { if (index < batch.cursor) throw new Error("Missing committed turn"); return; }
      if (!("playerId" in turn.action) || turn.action.playerId !== batch.seats[index]) throw new Error("Invalid turn seat");
      assertLegal(batch.base, turn.action);
      if (turn.record && (turn.record.playerId !== batch.seats[index] || JSON.stringify(turn.record.action) !== JSON.stringify(turn.action))) throw new Error("Invalid decision action");
      if (index < batch.cursor) committed = reduce(committed, turn.action, createRng(snapshot.rngState));
    });
    if (JSON.stringify(committed) !== JSON.stringify(state)) throw new Error("Inconsistent checkpoint");
  }
  return snapshot;
}

export interface ActiveGameSummary {
  gameId: string; savedAt: string; playerCount: number; humanSeat: number | null;
  phase: GameState["phase"]; missionIndex: number; aiMode: "mock" | "remote";
  needsApiKey: boolean; occupied: boolean; compatible: boolean;
}
export function summarizeActiveGame(snapshot: ActiveGameSnapshot, occupied = false): ActiveGameSummary {
  return { gameId: snapshot.gameId, savedAt: snapshot.savedAt, playerCount: snapshot.checkpoint.state.players.length, humanSeat: snapshot.humanSeat, phase: snapshot.checkpoint.state.phase, missionIndex: snapshot.checkpoint.state.missionIndex, aiMode: snapshot.aiMode, needsApiKey: snapshot.model !== null, occupied, compatible: true };
}
export interface ActiveGameHandle { gameId: string; writerId: string; epoch: number; revision: number; }
export interface ActiveGameEnvelope { snapshot: ActiveGameSnapshot; handle: ActiveGameHandle; }
export type { RunCheckpoint };
