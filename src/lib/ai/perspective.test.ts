import { describe, expect, it } from "vitest";
import { createConfig } from "../game/config";
import { createRng } from "../game/rng";
import { createGame, makePlaceholderPersonas } from "../game/setup";
import { toPlayerView } from "../game/view";
import type { GameState, PlayerView, Role, Speech } from "../game/types";
import { simulateGame } from "../sim/random";
import { buildPerspective as buildPerspectiveRaw } from "./perspective";
import { PROMPT_COPY } from "./prompt-copy";

/*
 * 【这一行 shim 与 view-model 那几份同源】buildPerspective 现在要一份语料表，
 * 因为"座位 3"这个 token 分语言。第二个参数没有默认值——默认值是静默回退，
 * 会让英文局里这几条角度永远不触发，而且不报任何错。
 */
const buildPerspective = (view: PlayerView) => buildPerspectiveRaw(view, PROMPT_COPY.zh);

const FIVE: Role[] = ["MERLIN", "PERCIVAL", "LOYAL_SERVANT", "MORGANA", "ASSASSIN"];

/**
 * 一份真视角再打补丁，而不是手搓字面量：PlayerView 加字段时这个 helper 不用跟着改，
 * 也不会因为漏填某个字段而测出假结果。
 */
function viewOf(patch: Partial<PlayerView>, selfId = 0): PlayerView {
  const state = createGame({
    config: createConfig(5, { roles: FIVE }),
    humanSeat: null,
    personas: makePlaceholderPersonas(5),
    rng: createRng(3),
  });
  return { ...toPlayerView(state, selfId), ...patch };
}

function speech(playerId: number, content: string, missionIndex = 0): Speech {
  return {
    seq: 0,
    playerId,
    phase: "PROPOSAL_DISCUSSION",
    missionIndex,
    attempt: 0,
    content,
  };
}

const text = (view: PlayerView): string => buildPerspective(view).join(" ");

// ---------------------------------------------------------------------------
// 五种角度
// ---------------------------------------------------------------------------

describe("被点名", () => {
  it("本轮有人写了你的座位号就提示，并列出是谁", () => {
    const view = viewOf({
      speeches: [speech(2, "我觉得座位 0 有问题"), speech(3, "同意座位 2 的说法")],
    });
    expect(text(view)).toContain("座位 2 在本轮点了你的名");
  });

  it("上一轮点的名不算——那是旧账，本轮没人提你", () => {
    const view = viewOf({
      missionIndex: 1,
      speeches: [speech(2, "座位 0 很可疑", 0)],
    });
    expect(text(view)).not.toContain("点了你的名");
  });

  it("自己提到自己不算", () => {
    const view = viewOf({ speeches: [speech(0, "我是座位 0，我说两句")] });
    expect(text(view)).not.toContain("点了你的名");
  });
});

describe("票型分歧", () => {
  const proposal = (votes: Record<number, boolean>, forced = false) => ({
    missionIndex: 0,
    attempt: 0,
    leaderId: 1,
    team: [0, 1],
    votes,
    approved: true,
    forced,
  });

  it("列出上一次和你投得不一样的人", () => {
    const view = viewOf({
      proposalHistory: [proposal({ 0: true, 1: true, 2: false, 3: false, 4: true })],
    });
    expect(text(view)).toContain("座位 2、3 和你投的相反");
  });

  it("全场一致时不提", () => {
    const view = viewOf({
      proposalHistory: [proposal({ 0: true, 1: true, 2: true, 3: true, 4: true })],
    });
    expect(text(view)).not.toContain("投的相反");
  });

  it("强制通过那次没人投过票，不能凭空造出分歧", () => {
    const view = viewOf({ proposalHistory: [proposal({}, true)] });
    expect(text(view)).not.toContain("投的相反");
  });
});

describe("上过的车", () => {
  const mission = (missionIndex: number, team: number[], failCount: number) => ({
    missionIndex,
    attempt: 0,
    team,
    leaderId: team[0] ?? 0,
    failCount,
    succeeded: failCount === 0,
  });

  it("你在一趟出过失败票的车上，会被提醒别人多半要拿这事问你", () => {
    const view = viewOf({ missionHistory: [mission(0, [0, 1, 2], 2)] });
    expect(text(view)).toContain("你上过第 1 轮那趟车");
    expect(text(view)).toContain("2 张失败票");
  });

  it("车没出过失败票就不提", () => {
    const view = viewOf({ missionHistory: [mission(0, [0, 1, 2], 0)] });
    expect(text(view)).not.toContain("那趟车");
  });

  it("失败的车你不在上面也不提", () => {
    const view = viewOf({ missionHistory: [mission(0, [1, 2, 3], 2)] });
    expect(text(view)).not.toContain("你上过");
  });

  it("一直没上过车会被单独点出来", () => {
    const view = viewOf({ missionHistory: [mission(0, [1, 2, 3], 0)] });
    expect(text(view)).toContain("一次都没上过车");
  });

  it("一局都还没打完时不提「没上过车」——那时所有人都没上过", () => {
    expect(text(viewOf({ missionHistory: [] }))).not.toContain("没上过车");
  });
});

describe("在待表决的队伍里", () => {
  it("队伍带上了你就提示", () => {
    expect(text(viewOf({ proposedTeam: [0, 1] }))).toContain("把你带上了");
  });

  it("没带你就不提", () => {
    expect(text(viewOf({ proposedTeam: [1, 2] }))).not.toContain("把你带上了");
  });
});

// ---------------------------------------------------------------------------
// 数量、确定性、纯函数
// ---------------------------------------------------------------------------

/** 五种角度同时成立的局面，用来验数量上限与轮换 */
function crowded(selfId = 0): PlayerView {
  return viewOf(
    {
      missionIndex: 2,
      proposedTeam: [0, 1],
      speeches: [speech(2, "座位 0 解释一下", 2), speech(3, "座位 0 别躲", 2)],
      proposalHistory: [
        {
          missionIndex: 1,
          attempt: 0,
          leaderId: 1,
          team: [0, 1],
          votes: { 0: true, 1: false, 2: false, 3: true, 4: true },
          approved: true,
          forced: false,
        },
      ],
      missionHistory: [
        { missionIndex: 0, attempt: 0, team: [0, 1, 2], leaderId: 0, failCount: 1, succeeded: false },
        { missionIndex: 1, attempt: 0, team: [0, 1], leaderId: 1, failCount: 1, succeeded: false },
      ],
    },
    selfId,
  );
}

describe("数量与确定性", () => {
  it("最多给两条", () => {
    expect(buildPerspective(crowded()).length).toBeLessThanOrEqual(2);
  });

  it("同一视角每次结果相同，且不改动传入的 view", () => {
    const view = crowded();
    const before = JSON.stringify(view);

    expect(buildPerspective(view)).toEqual(buildPerspective(view));
    expect(JSON.stringify(view)).toBe(before);
  });

  /**
   * 轮换而不是永远取前两条：否则"被点名"一旦触发就永久占住名额，
   * 后面几条角度一辈子不会出现，五个人又会说回一样的话。
   */
  it("不同座位拿到的角度不完全相同", () => {
    const sets = [0, 1, 2, 3].map((id) => buildPerspective(crowded(id)).join("|"));
    expect(new Set(sets).size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// 只给事实，不给立场
// ---------------------------------------------------------------------------

/**
 * 【本组钉住的是一条设计红线】
 *
 * 视角提示只能给"你身上发生过的事实"和"要不要提"的开放问句。
 * 一旦开始给立场或结论，就会重蹈两次覆辙：我们自己把算好的推理塞进 prompt 让讨论
 * 变成装饰；wolfcha 的立场类提示推动同一玩家前后立场漂移，最后他们也删掉了。
 */
const BANNED = [
  "是坏人",
  "必然",
  "应该投",
  "不要带",
  "可疑",
  "至少有",
  "建议你",
];

describe("红线：只给事实，不给立场", () => {
  it("手工构造的密集局面里不出现任何判断性措辞", () => {
    for (const id of [0, 1, 2, 3, 4]) {
      const body = buildPerspective(crowded(id)).join("\n");
      for (const word of BANNED) expect(body, `座位 ${id} / ${word}`).not.toContain(word);
    }
  });

  it("真实对局的每个中间状态、每个座位都不出现判断性措辞", () => {
    let produced = 0;

    const check = (state: GameState): void => {
      for (const player of state.players) {
        const hints = buildPerspective(toPlayerView(state, player.id));
        produced += hints.length;
        const body = hints.join("\n");
        for (const word of BANNED) expect(body).not.toContain(word);
        // 座位号必须都在本局范围内，不能凭空冒出一个不存在的座位
        for (const match of body.matchAll(/座位 (\d+)/g)) {
          expect(Number(match[1])).toBeLessThan(state.players.length);
        }
      }
    };

    for (let seed = 0; seed < 40; seed += 1) {
      simulateGame(5 + (seed % 6), seed, { onStep: check });
    }
    // 一条都没产出的话上面的断言全是空转
    expect(produced).toBeGreaterThan(100);
  },
  // 40 局 × 每个中间状态 × 每个座位 × 每个禁用词，实测 5.9s，正好压着默认的 5s。
  // 机器一忙就随机变红，而它跟被测代码没有半点关系——这种红最耗人，
  // 因为你会先去翻 perspective.ts 而不是翻时钟
  30_000);
});
