import { describe, expect, it } from "vitest";
import { createMockAiClient } from "@/lib/ai/mock";
import { runGame, type DecisionRecord } from "@/lib/ai/orchestrator";
import {
  ROLE_META,
  ROLE_TEAM,
  createConfig,
  createGame,
  createRng,
  makePlaceholderPersonas,
  toPlayerView,
  type GameState,
  type PlayerView,
  type WinReason,
} from "@/lib/game";
import { describeGameOver } from "./game-over-model";

// ---------------------------------------------------------------------------
// 夹具：跑真实的整局，收终局视角与全部 AI 决策
// ---------------------------------------------------------------------------

interface Finished {
  seed: number;
  final: GameState;
  /** 0 号座位的终局视角。reveal 对每个座位都一样，取谁都行 */
  view: PlayerView;
  decisions: DecisionRecord[];
}

async function playOut(seed: number, playerCount = 5): Promise<Finished> {
  const rng = createRng(seed);
  const state = createGame({
    config: createConfig(playerCount, { seed }),
    humanSeat: null,
    personas: makePlaceholderPersonas(playerCount),
    rng,
  });

  const decisions: DecisionRecord[] = [];
  const final = await runGame({
    state,
    client: createMockAiClient(rng),
    rng,
    hooks: { onDecision: (record) => void decisions.push(record) },
  });

  return { seed, final, view: toPlayerView(final, 0), decisions };
}

/**
 * 四种 winReason 各找一局。
 *
 * ASSASSINATION_HIT 很稀少（随机刺客只有 1/n 的命中率，见 sim/random.test.ts
 * 的一千局分布），所以只能扫种子——写死一个 seed 会在任何一次引擎改动后失效。
 */
const GAMES = await Promise.all(
  Array.from({ length: 40 }, (_, seed) => playOut(seed)),
);

function firstWith(reason: WinReason): Finished {
  const hit = GAMES.find((g) => g.final.winReason === reason);
  if (!hit) throw new Error(`40 局里没有一局是 ${reason}，夹具要加局数`);
  return hit;
}

// ---------------------------------------------------------------------------

describe("胜负", () => {
  it("四种终局都给得出一句话，且与引擎的判定一致", () => {
    const reasons: WinReason[] = [
      "THREE_MISSIONS",
      "REJECT_LIMIT",
      "ASSASSINATION_HIT",
      "ASSASSINATION_MISS",
    ];
    for (const reason of reasons) {
      const game = firstWith(reason);
      const brief = describeGameOver(game.view, game.decisions);
      expect(brief, reason).not.toBeNull();
      expect(brief?.winner, reason).toBe(game.final.winner);
      expect(brief?.reasonLabel, reason).not.toBe("");
      expect(brief?.winnerLabel, reason).toContain(
        game.final.winner === "GOOD" ? "好人" : "坏人",
      );
    }
  });

  it("「你赢没赢」看的是自己的阵营，不是好人赢没赢", () => {
    for (const game of GAMES) {
      const brief = describeGameOver(game.view, game.decisions);
      const myTeam = ROLE_TEAM[game.final.players[0]!.role];
      expect(brief?.youWon, `seed ${game.seed}`).toBe(myTeam === game.final.winner);
    }
  });
});

describe("刺杀结果", () => {
  it("命中时说清刺了谁、那一座是谁、梅林是谁", () => {
    const game = firstWith("ASSASSINATION_HIT");
    const strike = describeGameOver(game.view, game.decisions)?.strike;
    const record = game.final.assassination!;

    expect(strike?.hit).toBe(true);
    expect(strike?.headline).toContain("刺中");
    expect(strike?.targetLabel).toContain(`${record.targetId} 号`);
    expect(strike?.assassinLabel).toContain(`${record.assassinId} 号`);
    // 命中即目标就是梅林，两行必须指向同一个座位
    expect(strike?.targetRoleLabel).toBe("梅林");
    expect(strike?.merlinLabel).toContain(`${record.targetId} 号`);
  });

  it("落空时把被刺那一座的真实身份说出来——玩家最想看的就是这一行", () => {
    const game = firstWith("ASSASSINATION_MISS");
    const strike = describeGameOver(game.view, game.decisions)?.strike;
    const record = game.final.assassination!;
    const merlinId = game.final.players.find((p) => p.role === "MERLIN")!.id;
    const trueRole = game.final.players.find((p) => p.id === record.targetId)!.role;

    expect(strike?.hit).toBe(false);
    expect(strike?.targetRoleLabel).not.toBe("梅林");
    expect(strike?.targetRoleLabel).toBe(ROLE_META[trueRole].label);
    expect(strike?.merlinLabel).toContain(`${merlinId} 号`);
  });

  it("坏人靠三次任务赢时根本没有刺杀这一块", () => {
    const game = firstWith("THREE_MISSIONS");
    expect(game.final.assassination).toBeNull();
    expect(describeGameOver(game.view, game.decisions)?.strike).toBeNull();
  });

  it("动手前的推测按发言顺序列出，空发言如实显示", () => {
    const game = firstWith("ASSASSINATION_MISS");
    const strike = describeGameOver(game.view, game.decisions)?.strike;
    const opinions = game.final.assassination!.opinions;

    expect(strike?.opinions).toHaveLength(opinions.length);
    strike?.opinions.forEach((shown, i) => {
      expect(shown.label).toContain(`${opinions[i]!.playerId} 号`);
      expect(shown.content).not.toBe("");
    });
  });
});

describe("全身份公开", () => {
  it("每个座位都给出真实身份，且与引擎逐条相等", () => {
    for (const game of GAMES.slice(0, 5)) {
      const seats = describeGameOver(game.view, game.decisions)?.seats ?? [];
      expect(seats).toHaveLength(game.final.players.length);
      for (const seat of seats) {
        const player = game.final.players.find((p) => p.id === seat.id)!;
        expect(seat.team, `seed ${game.seed} 座位 ${seat.id}`).toBe(ROLE_TEAM[player.role]);
        expect(seat.tone).toBe(ROLE_TEAM[player.role] === "EVIL" ? "evil" : "good");
      }
    }
  });

  it("自己那一座标出来，但配色仍按阵营——复盘要看的是谁跟谁一伙", () => {
    const game = GAMES[0]!;
    const seats = describeGameOver(game.view, game.decisions)?.seats ?? [];
    const mine = seats.find((s) => s.isSelf)!;

    expect(mine.id).toBe(game.view.selfId);
    expect(mine.label).toContain("你");
    expect(mine.tone).not.toBe("self");
    expect(seats.filter((s) => s.isSelf)).toHaveLength(1);
  });
});

describe("每轮任务的失败票来源", () => {
  it("投失败票的人与 reveal.missions[].cards 逐条相等，且按座位升序", () => {
    for (const game of GAMES.slice(0, 10)) {
      const missions = describeGameOver(game.view, game.decisions)?.missions ?? [];
      expect(missions).toHaveLength(game.final.missionHistory.length);

      missions.forEach((shown, i) => {
        const record = game.final.missionHistory[i]!;
        const expected = record.cards
          .filter((c) => !c.success)
          .map((c) => c.playerId)
          .sort((a, b) => a - b);

        expect(shown.failedByLabels, `seed ${game.seed} 第 ${i + 1} 轮`).toHaveLength(
          expected.length,
        );
        shown.failedByLabels.forEach((label, k) => {
          expect(label).toContain(`${expected[k]} 号`);
        });
        expect(shown.failCount).toBe(record.failCount);
        expect(shown.succeeded).toBe(record.succeeded);
      });
    }
  });

  it("失败票只可能来自坏人——这是全项目第一处把它显示出来的地方", () => {
    for (const game of GAMES.slice(0, 10)) {
      const evil = new Set(
        game.final.players.filter((p) => ROLE_TEAM[p.role] === "EVIL").map((p) => p.id),
      );
      for (const mission of game.final.missionHistory) {
        for (const card of mission.cards) {
          if (!card.success) expect(evil.has(card.playerId)).toBe(true);
        }
      }
    }
  });
});

describe("AI 心证回放", () => {
  it("按轮次分组，条数与决策记录相等", () => {
    const game = GAMES[0]!;
    const replay = describeGameOver(game.view, game.decisions)?.replay ?? [];
    const total = replay.reduce((sum, round) => sum + round.entries.length, 0);

    expect(total).toBe(game.decisions.length);
    // 轮次升序
    expect(replay.map((r) => r.missionIndex)).toEqual(
      [...replay.map((r) => r.missionIndex)].sort((a, b) => a - b),
    );
  });

  it("未调用模型的那几手标得出来，且不报耗时", () => {
    const game = GAMES[0]!;
    const entries = (describeGameOver(game.view, game.decisions)?.replay ?? []).flatMap(
      (r) => r.entries,
    );
    const auto = entries.filter((e) => e.flags.includes("未调用模型"));

    expect(auto.length).toBeGreaterThan(0);
    for (const entry of auto) {
      expect(entry.latencyLabel).toBeNull();
      expect(entry.kindLabel).toBe("任务票");
    }
  });

  it("耗时统计排除未调用模型的那些——混进去会把数字算得虚低", () => {
    const game = GAMES[0]!;
    const timing = describeGameOver(game.view, game.decisions)?.timing;
    const asked = game.decisions.filter((d) => !d.auto);

    expect(timing?.askedCount).toBe(asked.length);
    expect(timing?.autoCount).toBe(game.decisions.length - asked.length);
    expect(timing?.rows.reduce((sum, r) => sum + r.count, 0)).toBe(asked.length);
  });
});

describe("边界", () => {
  it("还没到终局时返回 null，不抛——渲染期抛就是白屏", async () => {
    const rng = createRng(1);
    const state = createGame({
      config: createConfig(5, { seed: 1 }),
      humanSeat: null,
      personas: makePlaceholderPersonas(5),
      rng,
    });
    expect(describeGameOver(toPlayerView(state, 0), [])).toBeNull();
  });

  it("观战局（没有视角）也返回 null", () => {
    expect(describeGameOver(null, [])).toBeNull();
  });

  it("没有任何 AI 决策时耗时表整块消失，而不是画一张空表", () => {
    const game = GAMES[0]!;
    expect(describeGameOver(game.view, [])?.timing).toBeNull();
    expect(describeGameOver(game.view, [])?.replay).toEqual([]);
  });
});
