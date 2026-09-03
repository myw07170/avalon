import { describe, expect, it } from "vitest";
import { ROLE_ORDER } from "../game/config";
import { toPlayerView } from "../game/view";
import { getKnownIdentities } from "../game/visibility";
import type { GameState, Team, WinReason } from "../game/types";
import { simulateGame, type SimResult } from "./random";

/** 6 种人数轮着来，1000 局里每种约 167 局 */
const playerCountFor = (seed: number): number => 5 + (seed % 6);

const GAMES = 1000;

/** 跑一遍全部 1000 局，后面几条断言共用这份结果 */
const results: SimResult[] = Array.from({ length: GAMES }, (_, seed) =>
  simulateGame(playerCountFor(seed), seed),
);

describe("1000 局全随机对局", () => {
  it("每局都跑到 GAME_OVER，且有明确胜负", () => {
    for (const [seed, result] of results.entries()) {
      expect(result.finalState.phase, `seed ${seed}`).toBe("GAME_OVER");
      expect(result.winner, `seed ${seed}`).not.toBeNull();
      expect(result.winReason, `seed ${seed}`).not.toBeNull();
    }
  });

  it("任务轮数不超过 5，比分与任务记录对得上", () => {
    for (const [seed, result] of results.entries()) {
      const { goodScore, evilScore, missionHistory } = result.finalState;
      expect(result.missionsPlayed, `seed ${seed}`).toBeLessThanOrEqual(5);
      expect(goodScore + evilScore, `seed ${seed}`).toBe(missionHistory.length);
      expect(missionHistory.filter((m) => m.succeeded)).toHaveLength(goodScore);
      // 没有一方拿到 4 分——到 3 分就该终局了
      expect(Math.max(goodScore, evilScore), `seed ${seed}`).toBeLessThanOrEqual(3);
    }
  });

  it("胜负双方都出现过", () => {
    const winners = new Set<Team>(results.map((r) => r.winner));
    expect(winners).toEqual(new Set<Team>(["GOOD", "EVIL"]));
  });

  it("四种胜利原因都出现过", () => {
    const reasons = new Set<WinReason>(results.map((r) => r.winReason));
    expect(reasons).toEqual(
      new Set<WinReason>([
        "THREE_MISSIONS",
        "ASSASSINATION_HIT",
        "ASSASSINATION_MISS",
        "REJECT_LIMIT",
      ]),
    );
  });

  it("胜负原因与终局状态自洽", () => {
    for (const [seed, result] of results.entries()) {
      const state = result.finalState;
      switch (result.winReason) {
        case "THREE_MISSIONS":
          expect(state.evilScore, `seed ${seed}`).toBe(3);
          expect(result.winner).toBe("EVIL");
          break;
        case "ASSASSINATION_HIT":
        case "ASSASSINATION_MISS": {
          // rules.md §1：好人集齐 3 分不是终局，必须过刺杀这一关
          expect(state.goodScore, `seed ${seed}`).toBe(3);
          const target = state.players.find((p) => p.id === state.assassination?.targetId);
          expect(state.assassination?.hit).toBe(target?.role === "MERLIN");
          expect(result.winner).toBe(
            result.winReason === "ASSASSINATION_HIT" ? "EVIL" : "GOOD",
          );
          break;
        }
        case "REJECT_LIMIT":
          expect(state.rejectCount, `seed ${seed}`).toBe(state.config.maxRejects);
          expect(result.winner).toBe("EVIL");
          break;
      }
    }
  });

  it("好人从没投出过失败票——引擎级硬约束在整局里都成立", () => {
    for (const [seed, result] of results.entries()) {
      const evil = new Set(
        result.finalState.players
          .filter((p) => ["MORGANA", "ASSASSIN", "MORDRED", "OBERON", "MINION"].includes(p.role))
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
});

/**
 * 把规则在测试里独立算一遍，再和引擎写进记录里的结论对。
 *
 * 上面那些断言只能证明对局"结构上跑得通"——门槛类的 bug（平票判通过、
 * 失败票门槛用 >）照样能跑出结构完好的一千局。要抓它们，必须按 rules.md
 * 自己算一遍，而不是复用引擎的判断。
 */
describe("记录自洽", () => {
  it("提议的通过与否，用票数重算一遍都对得上", () => {
    for (const [seed, result] of results.entries()) {
      const playerCount = result.finalState.players.length;
      for (const proposal of result.finalState.proposalHistory) {
        const where = `seed ${seed} 第 ${proposal.missionIndex + 1} 轮第 ${proposal.attempt + 1} 次提议`;
        if (proposal.forced) {
          // 变体没开，这一千局里不该出现强制通过
          expect(proposal.forced, where).toBe(false);
          continue;
        }
        const votes = Object.values(proposal.votes);
        expect(votes, where).toHaveLength(playerCount);
        // rules.md §4.2 第 3 条：同意票严格大于半数才通过，平票视为否决
        expect(proposal.approved, where).toBe(
          votes.filter(Boolean).length * 2 > playerCount,
        );
      }
    }
  });

  it("任务的成败，用失败票数与门槛重算一遍都对得上", () => {
    for (const [seed, result] of results.entries()) {
      const { missions } = result.finalState.config;
      for (const mission of result.finalState.missionHistory) {
        const config = missions[mission.missionIndex];
        const where = `seed ${seed} 第 ${mission.missionIndex + 1} 轮`;
        expect(config, where).toBeDefined();
        expect(mission.team, where).toHaveLength(config!.teamSize);
        expect(mission.cards, where).toHaveLength(config!.teamSize);
        expect(mission.failCount, where).toBe(
          mission.cards.filter((c) => !c.success).length,
        );
        // rules.md §4.3：失败票数达到门槛即失败（7 人以上第 4 轮门槛为 2）
        expect(mission.succeeded, where).toBe(mission.failCount < config!.failsRequired);
      }
    }
  });

  it("任务票按座位升序存，提交先后不留痕", () => {
    for (const [seed, result] of results.entries()) {
      for (const mission of result.finalState.missionHistory) {
        const ids = mission.cards.map((c) => c.playerId);
        expect(ids, `seed ${seed}`).toEqual([...ids].sort((a, b) => a - b));
        expect(ids, `seed ${seed}`).toEqual(mission.team);
      }
    }
  });
});

describe("确定性", () => {
  it("同一 seed 跑两次，结果完全一致", () => {
    for (const seed of [0, 17, 123, 999]) {
      const a = simulateGame(playerCountFor(seed), seed);
      const b = simulateGame(playerCountFor(seed), seed);
      expect(JSON.stringify(a.finalState)).toBe(JSON.stringify(b.finalState));
    }
  });

  it("不同 seed 会产出不同对局", () => {
    const fingerprints = new Set(
      results.slice(0, 100).map((r) => JSON.stringify(r.finalState.log)),
    );
    // 不要求全不相同（短局有可能撞车），但绝不能是同一局跑了 100 遍
    expect(fingerprints.size).toBeGreaterThan(90);
  });
});

describe("整局的信息隔离", () => {
  const OTHER_ROLES = (self: string): string[] => ROLE_ORDER.filter((r) => r !== self);

  /**
   * 在真实对局产出的每一个中间状态上验一遍视角，而不是只验手工摆出来的局面。
   *
   * 内层不用 expect：几十万次断言的开销全在框架上，改成先收集违规、最后统一断言，
   * 同样的覆盖面快了两个数量级，报错信息还更具体。
   */
  it("对局中的每一步，每个玩家的视角都不泄漏他人身份与任务票来源", () => {
    const leaks: string[] = [];
    const seen = new Set<GameState["phase"]>();

    for (let seed = 0; seed < 30; seed += 1) {
      simulateGame(playerCountFor(seed), seed, {
        onStep: (state) => {
          seen.add(state.phase);
          for (const player of state.players) {
            const view = toPlayerView(state, player.id);
            // roleComposition 的键就是角色名，会命中下面那条按角色名做的钝断言。
            // 它是开局公开的角色构成（rules.md §3.2），排除的正当性在
            // view.leak.test.ts 的「角色构成是公开信息」那一组里单独证明
            const { roleComposition: _composition, ...rest } = view;
            const json = JSON.stringify(rest);
            const where = `seed ${seed} ${state.phase} 座位 ${player.id}`;

            if (json.includes('"cards"')) leaks.push(`${where}：出现了 cards`);
            for (const role of OTHER_ROLES(player.role)) {
              if (json.includes(`"${role}"`)) leaks.push(`${where}：泄漏了 ${role}`);
            }
            const expected = getKnownIdentities(player.id, state.players);
            if (JSON.stringify(view.knowledge) !== JSON.stringify(expected)) {
              leaks.push(`${where}：knowledge 与可见性矩阵不一致`);
            }
          }
        },
      });
    }

    expect(leaks).toEqual([]);
    // 顺带确认这一趟确实覆盖到了所有会停留的中间阶段（GAME_OVER 不经过 onStep）
    expect(seen).toEqual(
      new Set([
        "SETUP",
        "ROLE_REVEAL",
        "TEAM_BUILDING",
        "PROPOSAL_DISCUSSION",
        "TEAM_VOTE",
        "MISSION_EXECUTION",
        "MISSION_RESULT",
        "ASSASSINATION",
      ]),
    );
  });
});
