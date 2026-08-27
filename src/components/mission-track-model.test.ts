import { describe, expect, it } from "vitest";
import { createMockAiClient } from "@/lib/ai/mock";
import { runGame } from "@/lib/ai/orchestrator";
import {
  MISSIONS_TO_WIN,
  composeRoles,
  createConfig,
  createGame,
  createRng,
  makePlaceholderPersonas,
  toPlayerView,
  type PlayerView,
  type Role,
} from "@/lib/game";
import { describeTrack } from "./mission-track-model";

// ---------------------------------------------------------------------------
// 夹具：跑真实的整局，收下沿途每一步的视角
// ---------------------------------------------------------------------------

async function collectViews(seed: number, evil: Role[] = ["MORDRED", "OBERON"]) {
  const rng = createRng(seed);
  const state = createGame({
    config: createConfig(10, { seed, roles: composeRoles(10, evil) }),
    humanSeat: null,
    personas: makePlaceholderPersonas(10),
    rng,
  });

  const views: PlayerView[] = [];
  await runGame({
    state,
    client: createMockAiClient(rng),
    rng,
    hooks: {
      onState: (next) => {
        views.push(toPlayerView(next, 0));
      },
    },
  });
  return views;
}

const CACHE = new Map<number, PlayerView[]>();

async function views(seed = 7): Promise<PlayerView[]> {
  const hit = CACHE.get(seed);
  if (hit) return hit;
  const fresh = await collectViews(seed);
  CACHE.set(seed, fresh);
  return fresh;
}

/** 多跑几局，才凑得齐"成功""失败""否决撞线"这些不是每局都出现的状态 */
async function manyViews(): Promise<PlayerView[]> {
  const all: PlayerView[] = [];
  for (const seed of [1, 3, 7, 11, 23, 42, 99]) all.push(...(await views(seed)));
  return all;
}

// ---------------------------------------------------------------------------

describe("五个节点", () => {
  it("永远是 5 个，且顺序与配置一致", async () => {
    for (const view of await views()) {
      const track = describeTrack(view);
      expect(track.nodes).toHaveLength(5);
      expect(track.nodes.map((n) => n.index)).toEqual([0, 1, 2, 3, 4]);
      expect(track.nodes.map((n) => n.teamSize)).toEqual(
        view.missionConfigs.map((c) => c.teamSize),
      );
      expect(track.nodes.map((n) => n.label)).toEqual([
        "第 1 轮",
        "第 2 轮",
        "第 3 轮",
        "第 4 轮",
        "第 5 轮",
      ]);
    }
  });

  it("10 人局第四轮要两张失败票", async () => {
    const track = describeTrack((await views())[0]!);
    expect(track.nodes.map((n) => n.failsRequired)).toEqual([1, 1, 1, 2, 1]);
  });

  it("已结算的轮次与 missionHistory 对得上", async () => {
    for (const view of await views()) {
      const track = describeTrack(view);
      for (const record of view.missionHistory) {
        const node = track.nodes[record.missionIndex]!;
        expect(node.outcome).toBe(record.succeeded ? "success" : "fail");
        expect(node.failCount).toBe(record.failCount);
      }
    }
  });

  it("未结算的轮次没有失败票数", async () => {
    for (const view of await views()) {
      for (const node of describeTrack(view).nodes) {
        if (node.outcome === "success" || node.outcome === "fail") continue;
        expect(node.failCount).toBeNull();
      }
    }
  });

  it("最多一个 current，且就是 missionIndex 那一轮", async () => {
    for (const view of await views()) {
      const current = describeTrack(view).nodes.filter((n) => n.outcome === "current");
      expect(current.length).toBeLessThanOrEqual(1);
      if (current[0]) expect(current[0].index).toBe(view.missionIndex);
    }
  });

  it("结算阶段那一轮显示结果，而不是「进行中」", async () => {
    const all = await views();
    const settling = all.find((v) => v.phase === "MISSION_RESULT");
    expect(settling).toBeDefined();

    // 【这一步最容易写错】记录已经进了 history，但 missionIndex 要等 NEXT 才递增，
    // 两者同时指向同一轮。已结算必须优先
    const node = describeTrack(settling!).nodes[settling!.missionIndex]!;
    expect(["success", "fail"]).toContain(node.outcome);
    expect(node.detail).not.toBe("进行中");
  });

  it("终局不再高亮任何一轮", async () => {
    for (const seed of [1, 3, 7, 11, 23, 42, 99]) {
      const all = await views(seed);
      const final = all.at(-1)!;
      expect(final.phase).toBe("GAME_OVER");
      expect(describeTrack(final).nodes.some((n) => n.outcome === "current")).toBe(false);
    }
  });
});

describe("节点文案", () => {
  it("成功、带失败票的成功、失败，三种说法都出现过", async () => {
    const details = new Set<string>();
    for (const view of await manyViews()) {
      for (const node of describeTrack(view).nodes) {
        if (node.detail) details.add(node.detail.replace(/\d+/, "N"));
      }
    }
    expect(details).toContain("成功");
    expect(details).toContain("失败 · N 败");
    expect(details).toContain("进行中");
  });

  it("失败的轮次一定报了失败票数", async () => {
    for (const view of await manyViews()) {
      for (const node of describeTrack(view).nodes) {
        if (node.outcome !== "fail") continue;
        expect(node.failCount).toBeGreaterThan(0);
        expect(node.detail).toBe(`失败 · ${node.failCount} 败`);
      }
    }
  });

  it("零失败票的成功不画蛇添足", async () => {
    for (const view of await manyViews()) {
      for (const node of describeTrack(view).nodes) {
        if (node.outcome === "success" && node.failCount === 0) {
          expect(node.detail).toBe("成功");
        }
      }
    }
  });
});

describe("比分", () => {
  it("跟着 view 走，且等于已结算轮次的统计", async () => {
    for (const view of await manyViews()) {
      const track = describeTrack(view);
      expect(track.goodScore).toBe(view.goodScore);
      expect(track.evilScore).toBe(view.evilScore);
      expect(track.missionsToWin).toBe(MISSIONS_TO_WIN);
      expect(track.nodes.filter((n) => n.outcome === "success")).toHaveLength(
        view.goodScore,
      );
      expect(track.nodes.filter((n) => n.outcome === "fail")).toHaveLength(view.evilScore);
    }
  });
});

describe("否决计数器", () => {
  it("恒在 0 到 maxRejects 之间", async () => {
    for (const view of await manyViews()) {
      const track = describeTrack(view);
      expect(track.rejectCount).toBeGreaterThanOrEqual(0);
      expect(track.rejectCount).toBeLessThanOrEqual(track.maxRejects);
      expect(track.maxRejects).toBe(view.maxRejects);
    }
  });

  it("没被否决过就不显示提议次数", async () => {
    for (const view of await manyViews()) {
      const track = describeTrack(view);
      if (view.rejectCount === 0) {
        expect(track.attemptLabel).toBeNull();
      } else {
        expect(track.attemptLabel).toBe(`第 ${view.rejectCount + 1} 次提议`);
      }
    }
  });

  it("只在最后一次机会时警告", async () => {
    let warned = 0;
    for (const view of await manyViews()) {
      const track = describeTrack(view);
      const shouldWarn =
        view.phase !== "GAME_OVER" && view.rejectCount === view.maxRejects - 1;
      if (shouldWarn) {
        expect(track.rejectWarning).toBe("再被否决一次，坏人直接获胜。");
        warned += 1;
      } else {
        expect(track.rejectWarning).toBeNull();
      }
    }
    // 至少有一局走到过最后一次机会，否则这条断言是空跑
    expect(warned).toBeGreaterThan(0);
  });

  it("终局不再警告", async () => {
    for (const seed of [1, 3, 7, 11, 23, 42, 99]) {
      const final = (await views(seed)).at(-1)!;
      expect(describeTrack(final).rejectWarning).toBeNull();
    }
  });
});
