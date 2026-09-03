import { describe, expect, it } from "vitest";
import { zh } from "@/i18n/messages.zh";
import { createMockAiClient } from "@/lib/ai/mock";
import { runGame, type HumanTurn } from "@/lib/ai/orchestrator";
import { toDisplaySeatNumber } from "@/lib/seat-number";
import {
  ROLE_TEAM,
  composeRoles,
  countEvil,
  createConfig,
  createGame,
  createRng,
  getAwaitingPlayerIds,
  getLegalActions,
  makePlaceholderPersonas,
  toPlayerView,
  type GameState,
  type PlayerId,
  type PlayerView,
  type Role,
} from "@/lib/game";
import { describeTurn as describeTurnRaw, type AssassinationForm } from "./action-panel-model";
import {
  describeStrike as describeStrikeRaw,
  strikeLabel as strikeLabelRaw,
  type StrikeTarget,
} from "./assassination-model";

/*
 * 【这一行 shim 是刻意的】`describeX` 的第二个参数没有默认值——默认值是静默回退，
 * 会让某个漏改的调用点在英文模式下安静地渲染中文，而没有任何东西会报错。
 * 代价就是这里补一行。下面的断言仍然逐字断言中文，那才是真正在验文案。
 */
const describeTurn = (turn: HumanTurn) => describeTurnRaw(turn, zh);
const describeStrike = (form: AssassinationForm, view: PlayerView) =>
  describeStrikeRaw(form, view, zh);
const strikeLabel = (target: StrikeTarget | null) => strikeLabelRaw(target, zh);


// ---------------------------------------------------------------------------
// 夹具：跑真实对局，收所有走到"刺客该开刀了"那一刻的局面
// ---------------------------------------------------------------------------

const SEEDS = [1, 3, 7, 11, 23, 42, 99, 123, 777];

interface Strike {
  state: GameState;
  form: AssassinationForm;
  view: HumanTurn["view"];
}

async function collect(evil: Role[]): Promise<Strike[]> {
  const found: Strike[] = [];

  const take = (state: GameState) => {
    for (const id of getAwaitingPlayerIds(state)) {
      const legalActions = getLegalActions(state, id);
      if (legalActions[0]?.type !== "ASSASSINATE") continue;
      const view = toPlayerView(state, id);
      const form = describeTurn({ kind: "ASSASSINATION", view, legalActions });
      if (form?.kind === "ASSASSINATION") found.push({ state, form, view });
    }
  };

  for (const seed of SEEDS) {
    const rng = createRng(seed);
    const state = createGame({
      config: createConfig(10, { seed, roles: composeRoles(10, evil) }),
      humanSeat: null,
      personas: makePlaceholderPersonas(10),
      rng,
    });
    await runGame({
      state,
      client: createMockAiClient(rng),
      rng,
      hooks: { onState: take },
    });
  }
  return found;
}

const CACHE = new Map<string, Strike[]>();

async function strikes(evil: Role[] = ["MORDRED", "OBERON"]): Promise<Strike[]> {
  const key = evil.join(",");
  const hit = CACHE.get(key);
  if (hit) return hit;
  const fresh = await collect(evil);
  CACHE.set(key, fresh);
  return fresh;
}

function roleOf(state: GameState, id: PlayerId): Role {
  return state.players.find((p) => p.id === id)!.role;
}

function targetOf(targets: StrikeTarget[], id: PlayerId): StrikeTarget {
  return targets.find((t) => t.id === id)!;
}

// ---------------------------------------------------------------------------

describe("目标名单", () => {
  it("好人赢的局都能走到刺杀，断言不是空跑", async () => {
    expect((await strikes()).length).toBeGreaterThan(0);
  });

  it("全场都是目标，一个不少", async () => {
    for (const { form, view } of await strikes()) {
      const brief = describeStrike(form, view);
      // rules.md §4.5 允许指自己和队友，就是为了不出现"没有合法目标"的死局
      expect(brief.targets.map((t) => t.id)).toEqual(view.players.map((p) => p.id));
    }
  });

  it("自己和已知队友被标成必输", async () => {
    let flagged = 0;
    for (const { form, view } of await strikes()) {
      const brief = describeStrike(form, view);
      for (const target of brief.targets) {
        if (target.isSelf) {
          expect(target.risk).toContain("你不可能是梅林");
          flagged += 1;
        } else if (target.tone === "evil") {
          expect(target.risk).toContain("队友");
          flagged += 1;
        } else {
          expect(target.risk).toBeNull();
        }
      }
    }
    expect(flagged).toBeGreaterThan(0);
  });

  it("好人一个都没被标", async () => {
    for (const { state, form, view } of await strikes()) {
      for (const target of describeStrike(form, view).targets) {
        if (target.risk === null) continue;
        // 标了"必输"就必须真的是坏人，否则等于把好人从名单上划掉
        expect(ROLE_TEAM[roleOf(state, target.id)]).toBe("EVIL");
      }
    }
  });
});

describe("奥伯伦是刺客的盲区", () => {
  it("他是坏人，但既不标红也不标必输", async () => {
    let checked = 0;
    for (const { state, form, view } of await strikes()) {
      const oberon = state.players.find((p) => p.role === "OBERON")!;
      if (oberon.id === view.selfId) continue; // 刺客不可能同时是奥伯伦，保险起见

      const target = targetOf(describeStrike(form, view).targets, oberon.id);
      // 【界面替刺客认出奥伯伦就是开天眼】visibility.ts 明确不让他知道
      expect(target.tone).not.toBe("evil");
      expect(target.risk).toBeNull();
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("但会直说「还有一个队友你认不出来」", async () => {
    for (const { form, view } of await strikes()) {
      const brief = describeStrike(form, view);
      expect(brief.hiddenAllyHint).toContain("奥伯伦在场");
      expect(brief.hiddenAllyHint).toContain(`本局有 ${countEvil(view.roleComposition)} 个坏人`);
    }
  });

  it("没有奥伯伦的局说的是另一句", async () => {
    const withoutOberon = await strikes(["MORDRED", "MINION"]);
    expect(withoutOberon.length).toBeGreaterThan(0);
    for (const { form, view } of withoutOberon) {
      const brief = describeStrike(form, view);
      expect(brief.hiddenAllyHint).toContain("全认得");
      expect(brief.hiddenAllyHint).not.toContain("奥伯伦");
      // 全认得的局里，没被标必输的那些人真的全是好人
      expect(brief.targets.filter((t) => t.risk === null).length).toBe(
        view.players.length - countEvil(view.roleComposition),
      );
    }
  });
});

describe("strikeLabel", () => {
  it("没选人时催一句", () => {
    expect(strikeLabel(null)).toBe("先选一个人");
  });

  it("选了人就指名道姓", async () => {
    const { form, view } = (await strikes())[0]!;
    const brief = describeStrike(form, view);
    const other = brief.targets.find((t) => !t.isSelf)!;
    const self = brief.targets.find((t) => t.isSelf)!;

    expect(strikeLabel(other)).toBe(
      `就是他：${toDisplaySeatNumber(other.id)} 号（${other.name}）`,
    );
    expect(strikeLabel(self)).toContain("你自己");
  });
});
