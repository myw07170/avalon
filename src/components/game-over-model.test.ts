import { describe, expect, it } from "vitest";
import { zh } from "@/i18n/messages.zh";
import { ROLE_TEXT } from "@/i18n/roles";
import { createMockAiClient } from "@/lib/ai/mock";
import { runGame, type DecisionRecord } from "@/lib/ai/orchestrator";
import {
  ROLE_TEAM,
  createConfig,
  createGame,
  createRng,
  makePlaceholderPersonas,
  toPlayerView,
  toSpectatorView,
  type AnyView,
  type GameState,
  type PlayerView,
  type WinReason,
} from "@/lib/game";
import { describeGameOver as describeGameOverRaw } from "./game-over-model";

/*
 * 【这一行 shim 是刻意的】`describeX` 的第二个参数没有默认值——默认值是静默回退，
 * 会让某个漏改的调用点在英文模式下安静地渲染中文，而没有任何东西会报错。
 * 代价就是这里补一行。下面的断言仍然逐字断言中文，那才是真正在验文案。
 */
const describeGameOver = (view: AnyView | null, decisions: readonly DecisionRecord[]) =>
  describeGameOverRaw(view, decisions, zh);


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
 * 0 号是人类的一局。
 *
 * 【专为配对算法准备】人类的动作**不进** DecisionRecord（orchestrator 的 takeTurn
 * 走 onHumanAction 那一支时 record 为 null），所以只有这种局能验出"发言与心证
 * 会不会错位"。全 AI 局里两者一一对应，错位测不出来。
 */
async function playOutSeated(seed: number, playerCount = 5): Promise<Finished> {
  const rng = createRng(seed);
  const state = createGame({
    config: createConfig(playerCount, { seed }),
    humanSeat: 0,
    personas: makePlaceholderPersonas(playerCount),
    rng,
  });

  const decisions: DecisionRecord[] = [];
  const final = await runGame({
    state,
    client: createMockAiClient(rng),
    rng,
    // 只会点面板的玩家：永远选第一个合法动作。发言就是模板里的空串
    onHumanAction: async (turn) => turn.legalActions[0]!,
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
    expect(strike?.targetRoleLabel).toBe(ROLE_TEXT.zh[trueRole].label);
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

describe("每次组队提议的逐人票", () => {
  it("行数与 proposalHistory 一致，列数与座位一致", () => {
    for (const game of GAMES) {
      const brief = describeGameOver(game.view, game.decisions)!;
      expect(brief.voteMatrix.rows, `seed ${game.seed}`).toHaveLength(
        game.view.proposalHistory.length,
      );
      expect(brief.voteMatrix.seats).toHaveLength(game.view.players.length);
    }
  });

  it("被否决的提议也在表里——它们没有对应的任务，只有这张表记得住", () => {
    // 【这是它与 missions 的分工】missions 只有打成了的那几轮；
    // 「第 1 轮连否三次」这种事只在票型表里看得见
    const rejected = GAMES.find((g) =>
      g.view.proposalHistory.some((p) => !p.approved),
    );
    expect(rejected).toBeDefined();

    const brief = describeGameOver(rejected!.view, rejected!.decisions)!;
    expect(brief.voteMatrix.rows.length).toBeGreaterThan(brief.missions.length);
    expect(brief.voteMatrix.rows.some((r) => !r.approved)).toBe(true);
  });

  it("格子里的票与引擎记录逐条对得上", () => {
    for (const game of GAMES) {
      const brief = describeGameOver(game.view, game.decisions)!;
      brief.voteMatrix.rows.forEach((row, rowIndex) => {
        const record = game.view.proposalHistory[rowIndex]!;
        row.cells.forEach((cell, index) => {
          const seat = brief.voteMatrix.seats[index]!;
          const vote = record.votes[seat.id];
          expect(cell.vote).toBe(
            vote === undefined ? null : vote ? "approve" : "reject",
          );
        });
      });
    }
  });

  it("观战局照样有票型表——组队票是全程公开的，不需要「你」", () => {
    const game = GAMES[0]!;
    const brief = describeGameOver(toSpectatorView(game.final), game.decisions)!;
    expect(brief.voteMatrix.rows).toHaveLength(game.view.proposalHistory.length);
    expect(brief.voteMatrix.seats.every((s) => !s.isSelf)).toBe(true);
  });
});

describe("对局回放：完整对话 + 每句话背后的心证", () => {
  /** 一局的 review，摊平成「挂在发言下的心证」与「收在轮次末尾的心证」两摞 */
  function minds(game: Finished) {
    const rounds = describeGameOver(game.view, game.decisions)?.review ?? [];
    const items = rounds.flatMap((r) => r.items);
    return {
      rounds,
      items,
      attached: items.flatMap((item) =>
        item.type === "speech" && item.mind ? [item.mind] : [],
      ),
      tail: rounds.flatMap((r) => r.tail),
    };
  }

  it("完整对话都在：发言条数与 view.speeches 一致", () => {
    for (const game of GAMES) {
      const speeches = minds(game).items.filter((i) => i.type === "speech");
      expect(speeches, `seed ${game.seed}`).toHaveLength(game.view.speeches.length);
    }
  });

  it("一条心证都不丢：挂上的 + 末尾的 = 全部决策记录", () => {
    // 【这是配对算法的主闸】指针一旦走错，多半表现为某条心证被吃掉
    for (const game of GAMES) {
      const { attached, tail } = minds(game);
      expect(attached.length + tail.length, `seed ${game.seed}`).toBe(
        game.decisions.length,
      );
    }
  });

  it("一条心证都不重：不会既挂在发言下又收在末尾", () => {
    for (const game of GAMES) {
      const { attached, tail } = minds(game);
      const kinds = [...attached, ...tail].map((e) => `${e.playerId}|${e.kindLabel}`);
      // 同一手不可能同时属于两摞——两摞按"这个动作产不产生发言"互斥地分过
      expect(tail.every((e) => !attached.includes(e)), `seed ${game.seed}`).toBe(true);
      expect(kinds.length).toBe(game.decisions.length);
    }
  });

  it("配到的是同一个座位的心证，不是隔壁那位的", () => {
    for (const game of GAMES) {
      for (const item of minds(game).items) {
        if (item.type !== "speech" || !item.mind) continue;
        expect(item.mind.playerId, `seed ${game.seed}`).toBe(item.entry.playerId);
      }
    }
  });

  it("全 AI 局里每句发言都配得上心证", () => {
    for (const game of GAMES) {
      for (const item of minds(game).items) {
        if (item.type !== "speech") continue;
        expect(item.mind, `seed ${game.seed} seq ${item.entry.seq}`).not.toBeNull();
      }
    }
  });

  it("有人落座时，他那几句没有心证，而别人的一条都没错位", async () => {
    // 【这条是"只判顺序"会炸的地方】人类的动作不进 DecisionRecord，
    // 只按顺序往下配，从他开口那一刻起整条会错位一格——
    // 症状是把 A 的心证安到 B 的发言底下，比缺一格严重得多
    const seated = await playOutSeated(3);
    const rounds = describeGameOver(seated.view, seated.decisions)?.review ?? [];
    const speeches = rounds.flatMap((r) => r.items).filter((i) => i.type === "speech");

    const mine = speeches.filter((i) => i.entry.playerId === 0);
    expect(mine.length).toBeGreaterThan(0);
    for (const item of mine) expect(item.mind).toBeNull();

    for (const item of speeches) {
      if (item.entry.playerId === 0) continue;
      expect(item.mind, `seq ${item.entry.seq}`).not.toBeNull();
      expect(item.mind?.playerId).toBe(item.entry.playerId);
    }
  });

  it("发言内容撞车时靠座位号兜住，不会把下一位的心证安到你头上", async () => {
    /*
     * 【为什么要手工造这个撞车】随手跑一局是撞不上的：只会点面板的玩家交的是
     * 空串，而 mock 的 AI 每句都有字，光比内容也不会认错。但"两个人说了
     * 一模一样的话"本来就是合法状态（引擎不校验发言内容），真撞上的后果是
     * **从这一句起整条错位**——把 A 的心证挂到 B 的发言底下，比缺一格严重得多。
     *
     * 所以这里把人类那句改成与下一位（AI）说的一字不差，直接逼出那个分支。
     */
    const seated = await playOutSeated(3);
    const speeches = seated.view.speeches;
    const index = speeches.findIndex(
      (s, i) =>
        s.playerId === 0 && speeches[i + 1] !== undefined && speeches[i + 1]!.playerId !== 0,
    );
    expect(index).toBeGreaterThanOrEqual(0);
    const next = speeches[index + 1]!;

    const view: PlayerView = {
      ...seated.view,
      speeches: speeches.map((s, i) =>
        i === index ? { ...s, content: next.content } : { ...s },
      ),
    };

    const rounds = describeGameOver(view, seated.decisions)?.review ?? [];
    const items = rounds.flatMap((r) => r.items).filter((i) => i.type === "speech");

    // 撞车的那句仍然是人类说的，没有心证
    expect(items[index]?.mind).toBeNull();
    // 下一位的心证还在他自己名下，没有被前一句抢走
    expect(items[index + 1]?.mind?.playerId).toBe(next.playerId);
    // 后面全都没错位
    for (const item of items) {
      if (item.type !== "speech" || !item.mind) continue;
      expect(item.mind.playerId).toBe(item.entry.playerId);
    }
  });

  it("末尾那摞只装不产生发言的三种决策", () => {
    const speaking = new Set([zh.gameOver.kind.SPEECH, zh.gameOver.kind.TEAM_PROPOSAL]);
    for (const game of GAMES) {
      for (const entry of minds(game).tail) {
        expect(speaking.has(entry.kindLabel), `seed ${game.seed}`).toBe(false);
      }
    }
  });

  it("轮次按 missionIndex 升序", () => {
    for (const game of GAMES) {
      const indexes = minds(game).rounds.map((r) => r.missionIndex);
      expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
    }
  });

  it("未调用模型的那几手标得出来，且不报耗时", () => {
    const game = GAMES[0]!;
    const { attached, tail } = minds(game);
    const auto = [...attached, ...tail].filter((e) => e.flags.includes("未调用模型"));

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

  it("根本没有视角时返回 null", () => {
    expect(describeGameOver(null, [])).toBeNull();
  });

  it("没有任何 AI 决策时耗时表整块消失，而不是画一张空表", () => {
    const game = GAMES[0]!;
    expect(describeGameOver(game.view, [])?.timing).toBeNull();
  });

  it("没有心证时对话照给——那一块是发言 + 心证，不是只有心证", () => {
    // 【不能整块返回空】把 decisions 抽掉只该让每条发言的 mind 变成 null，
    // 完整对话本身来自 view.speeches，跟有没有调用过模型没关系
    const game = GAMES[0]!;
    const rounds = describeGameOver(game.view, [])?.review ?? [];
    const speeches = rounds.flatMap((r) => r.items).filter((i) => i.type === "speech");

    expect(speeches).toHaveLength(game.view.speeches.length);
    expect(speeches.every((i) => i.mind === null)).toBe(true);
    expect(rounds.every((r) => r.tail.length === 0)).toBe(true);
  });
});

describe("观战局的终局", () => {
  /**
   * 【这一组推翻了一句旧注释】GameOverBrief.youWon 上原来写着
   * "观战局走不到这里（reveal 为 null），所以恒有值"。观战模式做出来之后，
   * 观战局照样会走到 GAME_OVER、照样有 reveal——差的只是"你"。
   */
  const spectated = (game: Finished) => ({
    view: toSpectatorView(game.final),
    decisions: game.decisions,
  });

  it("画得出来，不再退化成 null", () => {
    const { view, decisions } = spectated(GAMES[0]!);
    expect(describeGameOver(view, decisions)).not.toBeNull();
  });

  it("胜负与身份两项为 null，其余照旧", () => {
    const game = GAMES[0]!;
    const { view, decisions } = spectated(game);
    const brief = describeGameOver(view, decisions)!;
    const seated = describeGameOver(game.view, decisions)!;

    expect(brief.youWon).toBeNull();
    expect(brief.yourRoleLabel).toBeNull();

    // 公开的那几块与落座视角完全一致——reveal 是同一份。
    // 【座位标签不能拿来比】落座视角会给自己那一座加个「你」，
    // 而观战没有"你"，两边的 teamLabels 本来就该不一样
    expect(brief.winner).toBe(seated.winner);
    expect(brief.winnerLabel).toBe(seated.winnerLabel);
    expect(brief.reasonLabel).toBe(seated.reasonLabel);
    const outcomes = (b: typeof brief) =>
      b.missions.map((m) => ({
        index: m.index,
        succeeded: m.succeeded,
        failCount: m.failCount,
        detail: m.detail,
      }));
    expect(outcomes(brief)).toEqual(outcomes(seated));
  });

  it("没有任何一座带「你」的标记", () => {
    const { view, decisions } = spectated(GAMES[0]!);
    const brief = describeGameOver(view, decisions)!;

    expect(brief.seats).toHaveLength(view.players.length);
    expect(brief.seats.every((seat) => !seat.isSelf)).toBe(true);
    expect(brief.seats.every((seat) => !seat.label.includes("你"))).toBe(true);
  });

  it("终局的全部身份仍然公开——那是引擎批准的，不受翻牌控制", () => {
    const { view, decisions } = spectated(GAMES[0]!);
    const brief = describeGameOver(view, decisions)!;

    for (const seat of brief.seats) {
      expect(seat.roleLabel).not.toBe(zh.gameOver.unknownRole);
      expect(["good", "evil"]).toContain(seat.tone);
    }
  });
});
