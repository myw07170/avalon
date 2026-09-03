import { describe, expect, it } from "vitest";
import { createConfig } from "../game/config";
import { createRng } from "../game/rng";
import { createGame, makePlaceholderPersonas } from "../game/setup";
import {
  EngineError,
  ROLE_TEAM,
  type AiDecisionKind,
  type AiDecisionRequest,
  type GameAction,
  type GameState,
  type Persona,
  type Phase,
  type PlayerId,
  type RngFn,
} from "../game/types";
import { getLegalActions } from "../game/legal";
import { reduce } from "../game/reduce";
import { toPlayerView } from "../game/view";
import { createMockAiClient } from "./mock";
import { runGame, type DecisionRecord } from "./orchestrator";
import { safeParseAiPayload } from "./schema";
import { toDisplaySeatNumber } from "../seat-number";

// ---------------------------------------------------------------------------
// 驱动
//
// 用真正的 orchestrator 跑，不再自己写一份循环——阶段 4 早期那份临时驱动已经删掉。
// 这里只负责建局、收集决策记录，断言全部落在 mock 的行为上。
// ---------------------------------------------------------------------------

interface DecisionLog {
  kind: AiDecisionKind;
  phase: Phase;
  playerId: PlayerId;
  teamSize: number;
  playerCount: number;
  payload: unknown;
  fallback: boolean;
  attempts: number | undefined;
  hasDebug: boolean;
  rescued: boolean;
  auto: boolean;
}

interface MockGameResult {
  finalState: GameState;
  decisions: DecisionLog[];
}

function requirePersona(state: GameState, playerId: PlayerId): Persona {
  const persona = state.players.find((p) => p.id === playerId)?.persona;
  if (!persona) throw new Error(`座位 ${playerId} 没有人设`);
  return persona;
}

async function playWithMock(playerCount: number, seed: number): Promise<MockGameResult> {
  const rng: RngFn = createRng(seed);
  const client = createMockAiClient(rng);
  const config = createConfig(playerCount, { seed });

  const state = createGame({
    config,
    humanSeat: null,
    personas: makePlaceholderPersonas(playerCount),
    rng,
  });

  const decisions: DecisionLog[] = [];
  const toLog = (record: DecisionRecord): DecisionLog => {
    // teamSize 从局配置里查，不必让 DecisionRecord 背一份 view
    const mission = config.missions[record.missionIndex];
    if (!mission) throw new Error(`第 ${record.missionIndex} 轮不在配置里`);
    return {
      kind: record.kind,
      phase: record.phase,
      playerId: record.playerId,
      teamSize: mission.teamSize,
      playerCount,
      payload: record.result.payload,
      fallback: record.result.fallback,
      attempts: record.result.debug?.attempts,
      hasDebug: record.result.debug !== undefined,
      rescued: record.rescued,
      auto: record.auto,
    };
  };

  const finalState = await runGame({
    state,
    client,
    rng,
    hooks: { onDecision: (record) => void decisions.push(toLog(record)) },
  });

  return { finalState, decisions };
}

/** 建一局并推进到 TEAM_BUILDING，用来手工构造单次决策请求 */
function atTeamBuilding(playerCount: number, seed: number, rng: RngFn): GameState {
  let state = createGame({
    config: createConfig(playerCount, { seed }),
    humanSeat: null,
    personas: makePlaceholderPersonas(playerCount),
    rng,
  });
  state = reduce(state, { type: "START_GAME" }, rng);
  for (const player of state.players) {
    state = reduce(state, { type: "ACKNOWLEDGE", playerId: player.id }, rng);
  }
  if (state.phase !== "TEAM_BUILDING") {
    throw new Error(`预期停在 TEAM_BUILDING，实际停在 ${state.phase}`);
  }
  return state;
}

// ---------------------------------------------------------------------------
// 100 局
// ---------------------------------------------------------------------------

/** 6 种人数轮着来 */
const playerCountFor = (seed: number): number => 5 + (seed % 6);

const GAMES = 100;

const results: MockGameResult[] = [];
for (let seed = 0; seed < GAMES; seed += 1) {
  results.push(await playWithMock(playerCountFor(seed), seed));
}

const allDecisions = results.flatMap((r) => r.decisions);

describe("100 局全 AI mock 对局", () => {
  it("每局都跑到 GAME_OVER，且有明确胜负", () => {
    for (const [seed, result] of results.entries()) {
      expect(result.finalState.phase, `seed ${seed}`).toBe("GAME_OVER");
      expect(result.finalState.winner, `seed ${seed}`).not.toBeNull();
      expect(result.finalState.winReason, `seed ${seed}`).not.toBeNull();
    }
  });

  it("好人从没投出过失败票——mock 只从 legalActions 里选，硬约束照样成立", () => {
    for (const [seed, result] of results.entries()) {
      const evil = new Set(
        result.finalState.players
          .filter((p) => ROLE_TEAM[p.role] === "EVIL")
          .map((p) => p.id),
      );
      for (const mission of result.finalState.missionHistory) {
        for (const card of mission.cards) {
          if (!card.success) {
            expect(evil.has(card.playerId), `seed ${seed} 座位 ${card.playerId}`).toBe(true);
          }
        }
      }
    }
  });

  it("六种决策种类在这 100 局里都被用到过", () => {
    expect(allDecisions.length).toBeGreaterThan(GAMES * 20);
    expect(new Set(allDecisions.map((d) => d.kind))).toEqual(
      new Set<AiDecisionKind>([
        "TEAM_PROPOSAL",
        "SPEECH",
        "VOTE",
        "MISSION_CARD",
        "ASSASSINATION",
      ]),
    );
  });
});

describe("mock 的输出", () => {
  it("每一次决策的 payload 都独立过一遍 schema", () => {
    const bad = allDecisions
      .map((d, i) => ({ i, d, result: safeParseAiPayload(d.kind, d.payload) }))
      .filter((x) => !x.result.success);
    expect(bad.map((x) => `第 ${x.i} 次 ${x.d.kind}`)).toEqual([]);
  });

  it("fallback 恒为 false，debug 恒有值且 attempts 为 1", () => {
    // 自动决策没问过模型，自然没有 prompt 也没有原文（orchestrator 的 autoRecord）。
    // 它们由下面那条单独钉，不能混进来——混进来的话把 hasDebug 断言写松了才能过，
    // 而那条断言存在的意义就是"mock 也必须交出 debug"
    for (const d of allDecisions.filter((d) => !d.auto)) {
      expect(d.fallback).toBe(false);
      expect(d.hasDebug).toBe(true);
      expect(d.attempts).toBe(1);
    }
  });

  it("自动决策只出现在好人的任务票上，且没有调用过模型", () => {
    const auto = allDecisions.filter((d) => d.auto);
    // 100 局里好人上车的次数远不止 100 次，一次都没有说明这条捷径根本没生效
    expect(auto.length).toBeGreaterThan(GAMES);
    for (const d of auto) {
      expect(d.kind, `座位 ${d.playerId}`).toBe("MISSION_CARD");
      expect(d.payload).toMatchObject({ success: true });
      expect(d.hasDebug).toBe(false);
      expect(d.fallback).toBe(false);
      expect(d.rescued).toBe(false);
    }
  });

  it("决策种类与当时的阶段自洽", () => {
    const allowed: Partial<Record<Phase, AiDecisionKind[]>> = {
      TEAM_BUILDING: ["TEAM_PROPOSAL"],
      PROPOSAL_DISCUSSION: ["SPEECH"],
      TEAM_VOTE: ["VOTE"],
      MISSION_EXECUTION: ["MISSION_CARD"],
      ASSASSINATION: ["ASSASSINATION"],
    };
    for (const d of allDecisions) {
      expect(allowed[d.phase], `${d.phase} 不该产生决策`).toBeDefined();
      expect(allowed[d.phase], `${d.phase} / ${d.kind}`).toContain(d.kind);
    }
  });

  it("提议的队伍：人数正确、无重复、座位合法、升序", () => {
    const proposals = allDecisions.filter((d) => d.kind === "TEAM_PROPOSAL");
    expect(proposals.length).toBeGreaterThan(0);
    for (const d of proposals) {
      const { team } = d.payload as { team: PlayerId[] };
      expect(team).toHaveLength(d.teamSize);
      expect(new Set(team).size).toBe(team.length);
      expect(team).toEqual([...team].sort((a, b) => a - b));
      for (const id of team) {
        expect(id).toBeGreaterThanOrEqual(0);
        expect(id).toBeLessThan(d.playerCount);
      }
    }
  });

  it("刺杀目标恒为合法座位号", () => {
    const strikes = allDecisions.filter((d) => d.kind === "ASSASSINATION");
    expect(strikes.length).toBeGreaterThan(0);
    for (const d of strikes) {
      const { targetId } = d.payload as { targetId: PlayerId };
      expect(targetId).toBeGreaterThanOrEqual(0);
      expect(targetId).toBeLessThan(d.playerCount);
    }
  });

  it("发言带上座位号与人设，suspicions 覆盖除自己外的每个人", () => {
    const speeches = allDecisions.filter((d) => d.kind === "SPEECH");
    expect(speeches.length).toBeGreaterThan(0);
    for (const d of speeches) {
      const payload = d.payload as {
        content: string;
        suspicions?: Array<{ playerId: PlayerId }>;
      };
      expect(payload.content).toContain(`座位 ${toDisplaySeatNumber(d.playerId)}`);
      expect(payload.suspicions).toHaveLength(d.playerCount - 1);
      expect(payload.suspicions?.map((s) => s.playerId)).not.toContain(d.playerId);
    }
  });
});

/**
 * 分布断言。
 *
 * 结构性断言抓不住"永远返回第一个候选项"这类退化——它照样能跑完 100 局。
 * 与阶段 1「梅林不会每局都在 0 号位」是同一类防线。
 */
describe("确实在随机", () => {
  it("组队票的同意与否决都出现过", () => {
    const approvals = new Set(
      allDecisions
        .filter((d) => d.kind === "VOTE")
        .map((d) => (d.payload as { approve: boolean }).approve),
    );
    expect(approvals).toEqual(new Set([true, false]));
  });

  it("任务票的成功与失败都出现过（失败只可能来自坏人）", () => {
    const cards = new Set(
      allDecisions
        .filter((d) => d.kind === "MISSION_CARD")
        .map((d) => (d.payload as { success: boolean }).success),
    );
    expect(cards).toEqual(new Set([true, false]));
  });

  it("刺杀目标不是永远指向同一个座位", () => {
    const targets = new Set(
      allDecisions
        .filter((d) => d.kind === "ASSASSINATION")
        .map((d) => (d.payload as { targetId: PlayerId }).targetId),
    );
    expect(targets.size).toBeGreaterThan(1);
  });

  it("同一个 view 连续组队会挑出不同的队伍，不是永远取座位号最小的几个", async () => {
    const rng = createRng(7);
    const state = atTeamBuilding(7, 7, createRng(7));
    const client = createMockAiClient(rng);
    const leaderId = state.currentLeaderId;
    const req: AiDecisionRequest<"TEAM_PROPOSAL"> = {
      kind: "TEAM_PROPOSAL",
      view: toPlayerView(state, leaderId),
      persona: requirePersona(state, leaderId),
      legalActions: getLegalActions(state, leaderId),
      locale: "zh",
      maxRetries: 2,
    };

    const teams = new Set<string>();
    for (let i = 0; i < 30; i += 1) {
      const result = await client.decide(req);
      teams.add(JSON.stringify(result.payload.team));
    }
    expect(teams.size).toBeGreaterThan(1);
  });
});

describe("确定性", () => {
  it("同一 seed 跑两次，结果完全一致", async () => {
    for (const seed of [0, 13, 42, 99]) {
      const a = await playWithMock(playerCountFor(seed), seed);
      const b = await playWithMock(playerCountFor(seed), seed);
      expect(JSON.stringify(a.finalState)).toBe(JSON.stringify(b.finalState));
      expect(JSON.stringify(a.decisions)).toBe(JSON.stringify(b.decisions));
    }
  });

  it("不同 seed 会产出不同对局", () => {
    const fingerprints = new Set(results.map((r) => JSON.stringify(r.finalState.log)));
    expect(fingerprints.size).toBeGreaterThan(GAMES * 0.9);
  });
});

describe("kind 与 legalActions 对不上就抛错，不兜底", () => {
  const state = atTeamBuilding(5, 3, createRng(3));
  const leaderId = state.currentLeaderId;
  const view = toPlayerView(state, leaderId);
  const persona = requirePersona(state, leaderId);

  const cases: Array<[AiDecisionKind, GameAction[]]> = [
    ["VOTE", [{ type: "SPEAK", playerId: leaderId, content: "" }]],
    ["MISSION_CARD", [{ type: "CAST_VOTE", playerId: leaderId, approve: true }]],
    ["TEAM_PROPOSAL", []],
    ["SPEECH", [{ type: "CAST_VOTE", playerId: leaderId, approve: true }]],
    ["ASSASSINATION", [{ type: "CAST_VOTE", playerId: leaderId, approve: false }]],
  ];

  for (const [kind, legalActions] of cases) {
    it(`${kind} 拿不到对应候选动作时抛 INTERNAL`, async () => {
      const client = createMockAiClient(createRng(3));
      const call = client.decide({
        kind,
        view,
        persona,
        legalActions,
        maxRetries: 2,
        locale: "zh",
      });
      await expect(call).rejects.toThrow(EngineError);
      await expect(call).rejects.toMatchObject({ code: "INTERNAL" });
    });
  }
});
