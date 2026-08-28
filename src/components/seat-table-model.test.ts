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
  type GameState,
  type Phase,
  type PlayerView,
  type Role,
} from "@/lib/game";
import { describeTable as describeTableRaw } from "./seat-table-model";

/*
 * 【这一行 shim 是刻意的】`describeX` 的第二个参数没有默认值——默认值是静默回退，
 * 会让某个漏改的调用点在英文模式下安静地渲染中文，而没有任何东西会报错。
 * 代价就是这里补一行。下面的断言仍然逐字断言中文，那才是真正在验文案。
 */
const describeTable = (view: PlayerView) => describeTableRaw(view, zh);


// ---------------------------------------------------------------------------
// 夹具：跑真实的一局，把沿途每个阶段的视角都收下来
// ---------------------------------------------------------------------------

/**
 * 全 AI 跑一局，收集每一步每个座位的视角。
 *
 * 用 runGame 而不是手搓状态：SeatTable 要显示的东西（谁在等、发言序走到哪、
 * 队伍是谁）全是状态机推出来的，手搓一个 PlayerView 只能验到我自己的假设。
 */
async function collectViews(
  playerCount: number,
  seed: number,
  evil: Role[],
): Promise<PlayerView[]> {
  const rng = createRng(seed);
  const state: GameState = createGame({
    config: createConfig(playerCount, { seed, roles: composeRoles(playerCount, evil) }),
    humanSeat: null,
    personas: makePlaceholderPersonas(playerCount),
    rng,
  });

  const views: PlayerView[] = [];
  await runGame({
    state,
    client: createMockAiClient(rng),
    rng,
    hooks: {
      onState: (next) => {
        for (const player of next.players) views.push(toPlayerView(next, player.id));
      },
    },
  });
  return views;
}

let ALL_VIEWS: PlayerView[] = [];

/** 一局跑完就够：10 人局带莫德雷德和奥伯伦，阶段全都会走到 */
async function views(): Promise<PlayerView[]> {
  if (ALL_VIEWS.length === 0) {
    ALL_VIEWS = await collectViews(10, 7, ["MORDRED", "OBERON"]);
  }
  return ALL_VIEWS;
}

function firstIn(all: PlayerView[], phase: Phase): PlayerView {
  const found = all.find((v) => v.phase === phase);
  if (!found) throw new Error(`这一局没走到 ${phase}`);
  return found;
}

// ---------------------------------------------------------------------------

describe("describeTable 不会崩", () => {
  it("一整局每一步每个座位都画得出来", async () => {
    const all = await views();
    expect(all.length).toBeGreaterThan(50);

    for (const view of all) {
      const table = describeTable(view);
      expect(table.seats).toHaveLength(view.players.length);
      expect(table.phaseLabel).toBeTruthy();
      expect(table.statusLine).toBeTruthy();
      // 座位号与 view.players 一一对应，圆桌才画得全
      expect(table.seats.map((s) => s.id)).toEqual(view.players.map((p) => p.id));
    }
  });

  it("每一步恰好一个队长、恰好一个自己", async () => {
    for (const view of await views()) {
      const table = describeTable(view);
      expect(table.seats.filter((s) => s.isLeader)).toHaveLength(1);
      expect(table.seats.filter((s) => s.isSelf)).toHaveLength(1);
      expect(table.seats.find((s) => s.isSelf)?.id).toBe(view.selfId);
    }
  });
});

describe("状态分层", () => {
  it("acting 恒等于 awaitingPlayerIds", async () => {
    for (const view of await views()) {
      const acting = describeTable(view)
        .seats.filter((s) => s.status === "acting")
        .map((s) => s.id);
      expect(acting).toEqual([...view.awaitingPlayerIds].sort((a, b) => a - b));
    }
  });

  it("done 的人数与 progress.submitted 对得上", async () => {
    const COUNTED: Phase[] = [
      "ROLE_REVEAL",
      "TEAM_VOTE",
      "MISSION_EXECUTION",
      "PROPOSAL_DISCUSSION",
      "REVIEW_DISCUSSION",
    ];
    for (const view of await views()) {
      if (!COUNTED.includes(view.phase)) continue;
      const done = describeTable(view).seats.filter((s) => s.status === "done");
      expect(done).toHaveLength(view.progress.submitted);
    }
  });

  it("onTeam 恒等于 proposedTeam", async () => {
    for (const view of await views()) {
      const onTeam = describeTable(view)
        .seats.filter((s) => s.onTeam)
        .map((s) => s.id);
      expect(onTeam).toEqual([...(view.proposedTeam ?? [])].sort((a, b) => a - b));
    }
  });

  it("组队阶段只等队长一个人", async () => {
    const view = firstIn(await views(), "TEAM_BUILDING");
    const table = describeTable(view);
    const acting = table.seats.filter((s) => s.status === "acting");

    expect(acting).toHaveLength(1);
    expect(acting[0]?.isLeader).toBe(true);
    expect(view.proposedTeam).toBeNull();
  });

  it("投票阶段全员参与，交了的算 done", async () => {
    const view = firstIn(await views(), "TEAM_VOTE");
    const table = describeTable(view);

    expect(table.seats.every((s) => s.status !== "idle")).toBe(true);
    expect(table.progressLabel).toMatch(/^已投 \d+ \/ 10$/);
    // 提议已经出来了，队伍要标出来
    expect(table.seats.filter((s) => s.onTeam).length).toBeGreaterThan(0);
  });

  it("任务阶段只有队伍里的人在交票", async () => {
    const view = firstIn(await views(), "MISSION_EXECUTION");
    const table = describeTable(view);
    const involved = table.seats.filter((s) => s.status !== "idle").map((s) => s.id);

    expect(involved).toEqual([...(view.proposedTeam ?? [])].sort((a, b) => a - b));
    expect(table.seats.every((s) => !s.onTeam || s.status !== "idle")).toBe(true);
  });

  it("讨论阶段按发言序推进，说过的算 done", async () => {
    const all = await views();
    const spoken = all.find(
      (v) => v.phase === "PROPOSAL_DISCUSSION" && v.progress.submitted > 0,
    );
    expect(spoken).toBeDefined();

    const table = describeTable(spoken!);
    const done = table.seats.filter((s) => s.status === "done").map((s) => s.id);
    expect(done).toEqual(
      [...spoken!.speakingOrder.slice(0, spoken!.progress.submitted)].sort((a, b) => a - b),
    );
  });
});

describe("刺杀阶段不铺开坏人名单", () => {
  it("除了当前行动的那个，其余座位一律 idle", async () => {
    const all = await views();
    const assassination = all.filter((v) => v.phase === "ASSASSINATION");
    if (assassination.length === 0) return; // 这一局坏人赢了，没走到刺杀

    for (const view of assassination) {
      const table = describeTable(view);
      const notIdle = table.seats.filter((s) => s.status !== "idle").map((s) => s.id);
      // 【关键】参与者集合为空，只有 awaiting 会亮。
      // 把"参与者"画出来等于把坏人名单画出来
      expect(notIdle).toEqual([...view.awaitingPlayerIds].sort((a, b) => a - b));
      expect(notIdle.length).toBeLessThanOrEqual(1);
    }
  });
});

describe("身份认知这一层跟着整局走", () => {
  it("梅林在每一个阶段都还看得见他知道的坏人", async () => {
    const all = await views();
    const merlinViews = all.filter((v) => v.selfRole === "MERLIN");
    expect(merlinViews.length).toBeGreaterThan(10);

    const expected = [...merlinViews[0]!.knowledge]
      .map((k) => (k.kind === "IS_EVIL" ? k.playerId : -1))
      .sort((a, b) => a - b);

    for (const view of merlinViews) {
      const evil = describeTable(view)
        .seats.filter((s) => s.tone === "evil")
        .map((s) => s.id)
        .sort((a, b) => a - b);
      expect(evil).toEqual(expected);
    }
  });

  it("忠臣从头到尾没有任何身份标记", async () => {
    const all = await views();
    const loyal = all.filter((v) => v.selfRole === "LOYAL_SERVANT");
    expect(loyal.length).toBeGreaterThan(0);

    for (const view of loyal) {
      const table = describeTable(view);
      expect(table.seats.every((s) => s.tone === "plain" || s.tone === "self")).toBe(true);
    }
  });

  it("派西维尔那一对始终共用同一个 tone", async () => {
    const all = await views();
    const percival = all.filter((v) => v.selfRole === "PERCIVAL");
    expect(percival.length).toBeGreaterThan(0);

    for (const view of percival) {
      const unsure = describeTable(view).seats.filter((s) => s.tone === "unsure");
      expect(unsure).toHaveLength(2);
      expect(unsure[0]?.tone).toBe(unsure[1]?.tone);
    }
  });
});

describe("文案", () => {
  it("只等一个人时点名，等一批人时只报数", async () => {
    const all = await views();

    const single = all.find((v) => v.awaitingPlayerIds.length === 1);
    expect(describeTable(single!).statusLine).toMatch(/^等 \d+ 号（.+?）.+。$/);

    const many = all.find((v) => v.awaitingPlayerIds.length > 1);
    // 「谁还没交」是公开的，「谁先交的」不是——批量时不能逐个点名
    expect(describeTable(many!).statusLine).toMatch(/^等 \d+ 人.+。$/);
  });

  it("轮到自己时说「轮到你」", async () => {
    const all = await views();
    const mine = all.find(
      (v) => v.awaitingPlayerIds.length === 1 && v.awaitingPlayerIds[0] === v.selfId,
    );
    expect(describeTable(mine!).statusLine).toMatch(/^轮到你.+。$/);
  });

  it("轮次与否决计数跟着状态走", async () => {
    for (const view of await views()) {
      expect(describeTable(view).roundLabel).toBe(
        `第 ${view.missionIndex + 1} 轮 · 否决 ${view.rejectCount} / ${view.maxRejects}`,
      );
    }
  });

  it("不计数的阶段不显示进度", async () => {
    const view = firstIn(await views(), "TEAM_BUILDING");
    expect(describeTable(view).progressLabel).toBeNull();
  });
});
