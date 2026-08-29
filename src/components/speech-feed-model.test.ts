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
  type PlayerView,
  type Role,
} from "@/lib/game";
import {
  TYPEWRITER_MAX_STEP_MS,
  TYPEWRITER_MIN_STEP_MS,
  TYPEWRITER_TARGET_MS,
  describeFeed as describeFeedRaw,
  describeTimeline as describeTimelineRaw,
  typewriterStepMs,
} from "./speech-feed-model";

/*
 * 【这一行 shim 是刻意的】`describeX` 的第二个参数没有默认值——默认值是静默回退，
 * 会让某个漏改的调用点在英文模式下安静地渲染中文，而没有任何东西会报错。
 * 代价就是这里补一行。下面的断言仍然逐字断言中文，那才是真正在验文案。
 */
const describeFeed = (view: PlayerView) => describeFeedRaw(view, zh);
const describeTimeline = (view: PlayerView) => describeTimelineRaw(view, zh);


// ---------------------------------------------------------------------------
// 夹具
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
  const final = await runGame({
    state,
    client: createMockAiClient(rng),
    rng,
    onHumanAction: async (turn) => turn.legalActions[0]!,
    hooks: {
      onState: (next) => {
        views.push(toPlayerView(next, 0));
      },
    },
  });
  return { views, final: toPlayerView(final, 0) };
}

const CACHE = new Map<number, Awaited<ReturnType<typeof playOut>>>();

async function game(seed = 7) {
  const hit = CACHE.get(seed);
  if (hit) return hit;
  const fresh = await playOut(seed);
  CACHE.set(seed, fresh);
  return fresh;
}

/** 多跑几局才凑得齐刺杀阶段——坏人赢的局根本走不到那里 */
async function manyFinals(): Promise<PlayerView[]> {
  const finals: PlayerView[] = [];
  for (const seed of [1, 3, 7, 11, 23, 42, 99]) finals.push((await game(seed)).final);
  return finals;
}

// ---------------------------------------------------------------------------

describe("describeFeed", () => {
  it("条数与顺序跟 view.speeches 完全一致", async () => {
    const { views } = await game();
    for (const view of views) {
      const feed = describeFeed(view);
      expect(feed).toHaveLength(view.speeches.length);
      expect(feed.map((e) => e.seq)).toEqual(view.speeches.map((s) => s.seq));
      expect(feed.map((e) => e.content)).toEqual(view.speeches.map((s) => s.content));
    }
  });

  it("seq 严格递增，可以直接当 React key", async () => {
    const feed = describeFeed((await game()).final);
    expect(feed.length).toBeGreaterThan(20);
    for (let i = 1; i < feed.length; i += 1) {
      expect(feed[i]!.seq).toBeGreaterThan(feed[i - 1]!.seq);
    }
  });

  it("名字与「是不是我」都对得上", async () => {
    const view = (await game()).final;
    for (const entry of describeFeed(view)) {
      const player = view.players.find((p) => p.id === entry.playerId)!;
      expect(entry.name).toBe(player.name);
      expect(entry.isSelf).toBe(entry.playerId === view.selfId);
    }
  });

  it("自己发过言，且被标成 isSelf", async () => {
    const feed = describeFeed((await game()).final);
    const mine = feed.filter((e) => e.isSelf);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((e) => e.playerId === 0)).toBe(true);
  });
});

describe("发言分类", () => {
  it("队长的选人说明单独成一类", async () => {
    const view = (await game()).final;
    const feed = describeFeed(view);
    const proposals = feed.filter((e) => e.kind === "proposal");

    expect(proposals.length).toBeGreaterThan(0);
    // 每条选人说明都对应 view.speeches 里一条 TEAM_BUILDING 发言
    const teamBuilding = view.speeches.filter((s) => s.phase === "TEAM_BUILDING");
    expect(proposals.map((e) => e.seq)).toEqual(teamBuilding.map((s) => s.seq));
  });

  it("刺杀阶段的推测也在流里，归为 opinion", async () => {
    const withAssassination = (await manyFinals()).find((v) =>
      v.speeches.some((s) => s.phase === "ASSASSINATION"),
    );
    expect(withAssassination).toBeDefined();

    const feed = describeFeed(withAssassination!);
    const opinions = feed.filter((e) => e.kind === "opinion");
    expect(opinions.length).toBeGreaterThan(0);
    // assassination.ts 把它当"说出口的话"记进 speeches，不是暗票——漏掉就谁都读不到
    expect(opinions.map((e) => e.seq)).toEqual(
      withAssassination!.speeches
        .filter((s) => s.phase === "ASSASSINATION")
        .map((s) => s.seq),
    );
  });

  it("空发言被标出来，而不是渲染成一个空气泡", async () => {
    // 引擎不校验发言内容（legal.ts 只管"轮没轮到你"），空串是合法状态
    const silent = (await manyFinals())
      .flatMap((v) => describeFeed(v))
      .filter((e) => e.isSilent);
    expect(silent.length).toBeGreaterThan(0);
    expect(silent.every((e) => e.content.trim() === "")).toBe(true);
  });

  it("有内容的发言不会被误标成沉默", async () => {
    for (const entry of describeFeed((await game()).final)) {
      if (entry.content.trim().length > 0) expect(entry.isSilent).toBe(false);
    }
  });

  it("其余都是普通发言", async () => {
    const view = (await game()).final;
    const feed = describeFeed(view);
    const plain = feed.filter((e) => e.kind === "speech");
    const discussion = view.speeches.filter(
      (s) => s.phase === "PROPOSAL_DISCUSSION" || s.phase === "REVIEW_DISCUSSION",
    );
    expect(plain.map((e) => e.seq)).toEqual(discussion.map((s) => s.seq));
  });
});

describe("分组", () => {
  it("每组只有第一条带标题", async () => {
    const feed = describeFeed((await game()).final);
    const labels = feed.filter((e) => e.groupLabel !== null);

    expect(labels.length).toBeGreaterThan(1);
    // 相邻两条标题之间必然隔着至少一条无标题的发言，否则就是每条都在画分隔线
    expect(labels.length).toBeLessThan(feed.length);
  });

  it("选人说明与紧随其后的讨论归同一组", async () => {
    const feed = describeFeed((await game()).final);
    const firstProposal = feed.findIndex((e) => e.kind === "proposal");
    expect(firstProposal).toBeGreaterThanOrEqual(0);

    // 队长开口时起一组，后面的讨论接着说，不该再插一条分隔线
    expect(feed[firstProposal]!.groupLabel).toMatch(/^第 \d+ 轮 · 第 \d+ 次组队$/);
    const next = feed[firstProposal + 1];
    if (next && next.kind === "speech") expect(next.groupLabel).toBeNull();
  });

  it("复盘与刺杀有自己的标题", async () => {
    const labels = new Set<string>();
    for (const view of await manyFinals()) {
      for (const entry of describeFeed(view)) {
        if (entry.groupLabel) labels.add(entry.groupLabel.replace(/\d+/g, "N"));
      }
    }
    expect(labels).toContain("第 N 轮 · 第 N 次组队");
    expect(labels).toContain("第 N 轮 · 复盘");
    expect(labels).toContain("刺杀");
  });

  it("同一轮的第二次组队会另起一组", async () => {
    const labels = new Set<string>();
    for (const view of await manyFinals()) {
      for (const entry of describeFeed(view)) {
        if (entry.groupLabel) labels.add(entry.groupLabel);
      }
    }
    // 至少有一局出现过被否决后的重提
    expect([...labels].some((l) => /第 [2-9] 次组队/.test(l))).toBe(true);
  });

  it("空发言流不炸", async () => {
    const { views } = await game();
    const empty = views.find((v) => v.speeches.length === 0);
    expect(empty).toBeDefined();
    expect(describeFeed(empty!)).toEqual([]);
  });
});


describe("describeTimeline", () => {
  it("发言一条不少，顺序与 describeFeed 完全一致", async () => {
    for (const view of (await game()).views) {
      const speeches = describeTimeline(view)
        .filter((item) => item.type === "speech")
        .map((item) => item.entry);
      expect(speeches).toEqual(describeFeed(view));
    }
  });

  it("投票卡的条数等于已结算的提议数", async () => {
    for (const view of (await game()).views) {
      const votes = describeTimeline(view).filter((item) => item.type === "vote");
      expect(votes).toHaveLength(view.proposalHistory.length);
    }
  });

  it("每张投票卡都排在本组最后一条发言之后、下一组第一条发言之前", async () => {
    const view = (await game()).final;
    const items = describeTimeline(view);

    items.forEach((item, index) => {
      if (item.type !== "vote") return;

      // 前一条必须是本组的发言：同一次提议的完整故事收在这张卡上
      const before = items[index - 1];
      expect(before?.type).toBe("speech");

      // 后一条要么是新分组的第一条发言，要么是流的末尾
      const after = items[index + 1];
      if (after) expect(after.groupLabel).not.toBeNull();
    });
  });

  it("投票卡不带分组标签——那条分隔线已经由本组第一条发言画过了", async () => {
    const view = (await game()).final;
    for (const item of describeTimeline(view)) {
      if (item.type === "vote") expect(item.groupLabel).toBeNull();
    }
  });

  it("卡上的票与 proposalHistory 逐条对得上，顺序也一致", async () => {
    const view = (await game()).final;
    const tallies = describeTimeline(view)
      .filter((item) => item.type === "vote")
      .map((item) => item.tally);

    tallies.forEach((tally, index) => {
      const record = view.proposalHistory[index]!;
      expect(tally.missionIndex).toBe(record.missionIndex);
      expect(tally.attempt).toBe(record.attempt);
      expect(tally.approved).toBe(record.approved);
    });
  });

  it("组队投票进行中，流里没有当前这一次的投票卡", async () => {
    // 【这是本次改动的核心不变量】未结算的票待在 state.pending.votes 里，
    // 它进不了视角，所以也进不了时间轴
    const voting = (await game()).views.filter((v) => v.phase === "TEAM_VOTE");
    expect(voting.length).toBeGreaterThan(0);

    for (const view of voting) {
      for (const item of describeTimeline(view)) {
        if (item.type !== "vote") continue;
        const isCurrent =
          item.tally.missionIndex === view.missionIndex &&
          item.tally.attempt === view.rejectCount;
        expect(isCurrent).toBe(false);
      }
    }
  });

  it("每个 item 的 missionIndex 与它对应的发言 / 提议记录一致", async () => {
    // 【终局复盘靠它切段】轮次错一格，整轮的对话会跑到隔壁轮次底下
    const view = (await game()).final;
    const items = describeTimeline(view);

    let speechIndex = 0;
    for (const item of items) {
      if (item.type === "vote") {
        expect(item.missionIndex).toBe(item.tally.missionIndex);
      } else {
        expect(item.missionIndex).toBe(view.speeches[speechIndex]!.missionIndex);
        speechIndex += 1;
      }
    }
    expect(speechIndex).toBe(view.speeches.length);
  });

  it("key 在同一份流里唯一——React 拿它当 key", async () => {
    for (const view of (await game()).views) {
      const keys = describeTimeline(view).map((item) => item.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("空流不炸", async () => {
    const { views } = await game();
    const empty = views.find(
      (v) => v.speeches.length === 0 && v.proposalHistory.length === 0,
    );
    expect(empty).toBeDefined();
    expect(describeTimeline(empty!)).toEqual([]);
  });
});

describe("打字机节奏", () => {
  it("总时长大致恒定，短发言不至于慢得像卡住", () => {
    expect(typewriterStepMs(20) * 20).toBeCloseTo(TYPEWRITER_TARGET_MS, -2);
    expect(typewriterStepMs(50) * 50).toBeCloseTo(TYPEWRITER_TARGET_MS, -2);
  });

  it("每字耗时被夹在上下界之间", () => {
    for (const len of [1, 2, 5, 20, 60, 200, 1000]) {
      const step = typewriterStepMs(len);
      expect(step).toBeGreaterThanOrEqual(TYPEWRITER_MIN_STEP_MS);
      expect(step).toBeLessThanOrEqual(TYPEWRITER_MAX_STEP_MS);
    }
  });

  it("空串不会除零", () => {
    expect(typewriterStepMs(0)).toBe(TYPEWRITER_MAX_STEP_MS);
    expect(typewriterStepMs(-1)).toBe(TYPEWRITER_MAX_STEP_MS);
  });

  it("真实发言长度下都打得完一条 800ms 的节奏", async () => {
    // 【这是打字机存在的前提】store 默认 800ms 一条，打字比这慢就会一直被打断
    const view = (await game()).final;
    for (const speech of view.speeches) {
      const total = typewriterStepMs(speech.content.length) * speech.content.length;
      expect(total).toBeLessThanOrEqual(900);
    }
  });
});
