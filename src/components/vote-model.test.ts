import { describe, expect, it } from "vitest";
import { zh } from "@/i18n/messages.zh";
import { createMockAiClient } from "@/lib/ai/mock";
import { runGame } from "@/lib/ai/orchestrator";
import {
  composeRoles,
  createConfig,
  createGame,
  createRng,
  makePlaceholderPersonas,
  toPlayerView,
  toSpectatorView,
  type AnyView,
  type PlayerView,
  type Role,
  type SpectatorView,
} from "@/lib/game";
import {
  describeVoteMatrix as describeVoteMatrixRaw,
  describeVotes as describeVotesRaw,
} from "./vote-model";

/*
 * 【这一行 shim 是刻意的】`describeX` 的第二个参数没有默认值——默认值是静默回退，
 * 会让某个漏改的调用点在英文模式下安静地渲染中文，而没有任何东西会报错。
 * 代价就是这里补一行。下面的断言仍然逐字断言中文，那才是真正在验文案。
 */
const describeVotes = (view: AnyView) => describeVotesRaw(view, zh);
const describeVoteMatrix = (view: AnyView) => describeVoteMatrixRaw(view, zh);

// ---------------------------------------------------------------------------
// 夹具：跑真实的整局，收下沿途每一步的视角
// ---------------------------------------------------------------------------

async function playOut(seed: number, evil: Role[] = ["MORDRED", "OBERON"]) {
  const rng = createRng(seed);
  const state = createGame({
    config: createConfig(10, { seed, roles: composeRoles(10, evil) }),
    humanSeat: 0,
    personas: makePlaceholderPersonas(10),
    rng,
  });

  const views: PlayerView[] = [];
  const spectatorViews: SpectatorView[] = [];
  const final = await runGame({
    state,
    client: createMockAiClient(rng),
    rng,
    onHumanAction: async (turn) => turn.legalActions[0]!,
    hooks: {
      onState: (next) => {
        views.push(toPlayerView(next, 0));
        spectatorViews.push(toSpectatorView(next));
      },
    },
  });
  return { views, spectatorViews, final: toPlayerView(final, 0) };
}

const CACHE = new Map<number, Awaited<ReturnType<typeof playOut>>>();

async function game(seed = 7) {
  const hit = CACHE.get(seed);
  if (hit) return hit;
  const fresh = await playOut(seed);
  CACHE.set(seed, fresh);
  return fresh;
}

/** 一局凑不齐"通过""否决""否决撞线"，多跑几个种子 */
const SEEDS = [1, 3, 7, 11, 23, 42, 99];

async function allViews(): Promise<PlayerView[]> {
  const out: PlayerView[] = [];
  for (const seed of SEEDS) out.push(...(await game(seed)).views);
  return out;
}

/**
 * 变体局：`forcePassOnLastAttempt` 打开后，最后一次提议不投票直接通过。
 *
 * 【必须手工构造】`SetupScreen` 的 `createConfig` 缺省把它关着，mock 跑一万局
 * 也造不出一条 `forced: true` 的记录，而那恰好是本文件最容易写错的一支。
 */
async function forcedGame(): Promise<PlayerView> {
  for (const seed of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    const rng = createRng(seed);
    const state = createGame({
      // maxRejects 压到 2：第一次提议正常投票，一旦被否决，第二次就撞上
      // "最后一次机会"直接强制通过。缺省的 5 次要连否 4 把才走得到这一支
      config: createConfig(5, { seed, maxRejects: 2, forcePassOnLastAttempt: true }),
      humanSeat: null,
      personas: makePlaceholderPersonas(5),
      rng,
    });

    let withForced: PlayerView | null = null;
    await runGame({
      state,
      client: createMockAiClient(rng),
      rng,
      hooks: {
        onState: (next) => {
          const view = toPlayerView(next, 0);
          if (!withForced && view.proposalHistory.some((p) => p.forced)) withForced = view;
        },
      },
    });
    if (withForced) return withForced;
  }
  throw new Error("扫完种子也没造出 forced 记录，夹具需要调整");
}

// ---------------------------------------------------------------------------

describe("describeVotes", () => {
  it("条数与 proposalHistory 完全一致", async () => {
    for (const view of await allViews()) {
      expect(describeVotes(view)).toHaveLength(view.proposalHistory.length);
    }
  });

  it("投票阶段进行中一票都不公开——票要等全员投完", async () => {
    const { views } = await game();
    const voting = views.filter((v) => v.phase === "TEAM_VOTE");
    expect(voting.length).toBeGreaterThan(0);

    for (const view of voting) {
      // 这一阶段里已结算的提议只有【更早那几次】。当前这一次的票还在
      // state.pending.votes 里，压根进不了视角
      const tallies = describeVotes(view);
      for (const tally of tallies) {
        const isCurrent =
          tally.missionIndex === view.missionIndex && tally.attempt === view.rejectCount;
        expect(isCurrent).toBe(false);
      }
    }
  });

  it("每条已结算记录都是全员投票，两份名单不相交且并起来是全桌", async () => {
    let checked = 0;
    for (const view of await allViews()) {
      for (const tally of describeVotes(view)) {
        if (tally.forced) continue;
        const ids = [...tally.approvedBy, ...tally.rejectedBy].map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect([...ids].sort((a, b) => a - b)).toEqual(view.players.map((p) => p.id));
        expect(tally.approveCount + tally.rejectCount).toBe(view.players.length);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("通过与否按规则独立重算一遍：同意票严格大于半数，平票算否决", async () => {
    // 【不复用引擎的结论】把规则在测试里独立算一遍，才是对引擎的检验而不是复述。
    // 同 sim/random.ts 的方法论
    for (const view of await allViews()) {
      for (const tally of describeVotes(view)) {
        if (tally.forced) continue;
        expect(tally.approved).toBe(tally.approveCount * 2 > view.players.length);
      }
    }
  });

  it("两份名单都按座位号严格升序——「谁投了什么」公开，「谁先投的」不公开", async () => {
    // 【这条钉的是契约，不是那一行 .sort()】votes 是整数键的 Record，
    // 枚举顺序本来就升序，去掉排序这条也照样绿（变异测试实测过）。
    // 它守的是"输出顺序里不许有提交先后"这件事——形状哪天变了，它才会说话
    for (const view of await allViews()) {
      for (const tally of describeVotes(view)) {
        for (const seats of [tally.approvedBy, tally.rejectedBy]) {
          const ids = seats.map((s) => s.id);
          expect(ids).toEqual([...ids].sort((a, b) => a - b));
        }
      }
    }
  });

  it("名字与 isSelf 跟着座位走", async () => {
    const { final } = await game();
    for (const tally of describeVotes(final)) {
      for (const seat of [...tally.approvedBy, ...tally.rejectedBy]) {
        expect(seat.name).toBe(final.players.find((p) => p.id === seat.id)!.name);
        expect(seat.isSelf).toBe(seat.id === final.selfId);
      }
    }
  });

  it("观战没有「自己」，isSelf 恒 false", async () => {
    const { spectatorViews } = await game();
    const withHistory = spectatorViews.filter((v) => v.proposalHistory.length > 0);
    expect(withHistory.length).toBeGreaterThan(0);

    for (const view of withHistory) {
      for (const tally of describeVotes(view)) {
        for (const seat of [...tally.approvedBy, ...tally.rejectedBy]) {
          expect(seat.isSelf).toBe(false);
        }
      }
    }
  });

  it("文案：通过与否决各走各的标签，票数照实说", async () => {
    const tallies = (await allViews()).flatMap(describeVotes).filter((t) => !t.forced);
    const approved = tallies.find((t) => t.approved);
    const rejected = tallies.find((t) => !t.approved);

    expect(approved!.outcomeLabel).toBe("通过");
    expect(rejected!.outcomeLabel).toBe("否决");
    expect(rejected!.detailLabel).toBe(
      `${rejected!.approveCount} 赞成 / ${rejected!.rejectCount} 反对`,
    );
  });

  it("forced 的那次没有人投过票：两份名单皆空，文案换成「未投票」", async () => {
    const view = await forcedGame();
    const forced = describeVotes(view).filter((t) => t.forced);
    expect(forced.length).toBeGreaterThan(0);

    for (const tally of forced) {
      // 【这一支必须单独测】渲染成「0 赞成 / 0 反对却通过了」是 bug
      expect(tally.approvedBy).toEqual([]);
      expect(tally.rejectedBy).toEqual([]);
      expect(tally.approveCount).toBe(0);
      expect(tally.rejectCount).toBe(0);
      expect(tally.approved).toBe(true);
      expect(tally.detailLabel).toBe(zh.vote.forcedNote);
      expect(tally.detailLabel).not.toContain("赞成");
    }
  });

  it("没有已结算提议时返回空数组，不抛", async () => {
    const { views } = await game();
    const early = views.find((v) => v.proposalHistory.length === 0)!;
    expect(describeVotes(early)).toEqual([]);
  });

  it("key 与 speech-feed 的分组 key 同源", async () => {
    const { final } = await game();
    for (const tally of describeVotes(final)) {
      expect(tally.key).toBe(`propose-${tally.missionIndex}-${tally.attempt}`);
    }
  });
});

describe("describeVoteMatrix", () => {
  it("行数与 proposalHistory 一致，列数与座位一致", async () => {
    for (const view of await allViews()) {
      const matrix = describeVoteMatrix(view);
      expect(matrix.seats).toHaveLength(view.players.length);
      expect(matrix.rows).toHaveLength(view.proposalHistory.length);
      for (const row of matrix.rows) {
        expect(row.cells).toHaveLength(matrix.seats.length);
      }
    }
  });

  it("格子与表头同序对齐——组件靠这条画表，不做二次查找", async () => {
    const { final } = await game();
    const matrix = describeVoteMatrix(final);
    const byKey = new Map(describeVotes(final).map((t) => [t.key, t]));

    for (const row of matrix.rows) {
      const tally = byKey.get(row.key)!;
      const approved = new Set(tally.approvedBy.map((s) => s.id));
      const rejected = new Set(tally.rejectedBy.map((s) => s.id));

      row.cells.forEach((cell, index) => {
        const seat = matrix.seats[index]!;
        if (tally.forced) expect(cell.vote).toBeNull();
        else expect(cell.vote).toBe(approved.has(seat.id) ? "approve" : "reject");
        expect(rejected.has(seat.id)).toBe(cell.vote === "reject");
      });
    }
  });

  it("onTeam 与当时的队伍一致，isLeader 与队长一致", async () => {
    for (const view of await allViews()) {
      const matrix = describeVoteMatrix(view);
      matrix.rows.forEach((row, rowIndex) => {
        const record = view.proposalHistory[rowIndex]!;
        row.cells.forEach((cell, index) => {
          const seat = matrix.seats[index]!;
          expect(cell.onTeam).toBe(record.team.includes(seat.id));
          expect(cell.isLeader).toBe(seat.id === record.leaderId);
        });
        // 队伍人数是当轮任务表定死的，顺带把它钉住
        expect(row.cells.filter((c) => c.onTeam)).toHaveLength(record.team.length);
      });
    }
  });

  it("forced 那一行整行留空，结果标签说明原因", async () => {
    const view = await forcedGame();
    const matrix = describeVoteMatrix(view);
    const forced = matrix.rows.filter((r) => r.forced);
    expect(forced.length).toBeGreaterThan(0);

    for (const row of forced) {
      expect(row.cells.every((c) => c.vote === null)).toBe(true);
      expect(row.detailLabel).toBe(zh.vote.forcedNote);
    }
  });

  it("行标签是「轮-次」，两者都从 1 数起", async () => {
    const { final } = await game();
    const matrix = describeVoteMatrix(final);
    matrix.rows.forEach((row, index) => {
      const record = final.proposalHistory[index]!;
      expect(row.label).toBe(`${record.missionIndex + 1}-${record.attempt + 1}`);
    });
  });

  it("没有已结算提议时 rows 为空但 seats 照给，不抛", async () => {
    const { views } = await game();
    const early = views.find((v) => v.proposalHistory.length === 0)!;
    const matrix = describeVoteMatrix(early);
    expect(matrix.rows).toEqual([]);
    expect(matrix.seats).toHaveLength(early.players.length);
  });
});
