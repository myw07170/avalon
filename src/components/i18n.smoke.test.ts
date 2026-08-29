/**
 * 十个 view-model 在英文模式下不许产出汉字。
 *
 * 【为什么是这一条，而不是逐条写英文期望】逐条断言英文文案是同义反复：
 * `expect(track.detail).toBe(en.track.fail(2))` 只证明了接线，不证明文案，
 * 而漏改的真实症状永远是**中文漏了出来**（某个 `describeX` 里还留着一句模板字符串、
 * 或者某个分支忘了走目录）。所以直接查那个症状：跑几局真实对局，把每个
 * `PlayerView` 与每一手棋都喂给十一个 `describeX`，递归遍历返回值里的每一个字符串。
 *
 * 这样一份测试覆盖到的分支比手写期望多得多——rejectWarning 只在最后一次机会出现、
 * onlySuccessNote 只在好人打任务票时出现、hiddenAllyHint 的两支要有没有奥伯伦——
 * 而这里一行专门的代码都不用为它们写。
 *
 * 【覆盖不到 .tsx】组件里的字面量（尤其是拼接出来的 aria-label）不在这份池子里。
 * 那一层只能靠 `pnpm typecheck` + 人工过一遍双语界面。
 */
import { describe, expect, it } from "vitest";
import { en } from "@/i18n/messages.en";
import { createMockAiClient } from "@/lib/ai/mock";
import {
  decisionKindOf,
  runGame,
  type DecisionRecord,
  type HumanTurn,
} from "@/lib/ai/orchestrator";
import {
  composeRoles,
  createConfig,
  createGame,
  createRng,
  getAwaitingPlayerIds,
  getLegalActions,
  makePlaceholderPersonas,
  toPlayerView,
  toSpectatorView,
  type GameState,
  type PlayerView,
  type Role,
  type SpectatorView,
} from "@/lib/game";
import { describeTurn, type AssassinationForm } from "./action-panel-model";
import { describeStrike, strikeLabel } from "./assassination-model";
import { describeGameOver, type ReplayEntry } from "./game-over-model";
import { describeTrack } from "./mission-track-model";
import { describeRole } from "./role-card-model";
import { describeTable } from "./seat-table-model";
import { describeFeed, describeTimeline } from "./speech-feed-model";
import { describeVoteMatrix, describeVotes } from "./vote-model";
import { describeCast, describeMinds } from "./spectator-model";

const CJK = /[　-〿一-鿿＀-￯]/;

/** 多跑几个种子：刺杀、否决撞线、四轮双失败票不是每局都会走到 */
const SEEDS = [1, 7, 23, 42];
const EVIL: Role[] = ["MORDRED", "OBERON"];

interface Sample {
  views: PlayerView[];
  turns: HumanTurn[];
  /** 终局那一份视角 + 全部心证，喂给 describeGameOver */
  finals: Array<{ view: PlayerView; decisions: DecisionRecord[] }>;
  /** 观战视角。夹具本来就是全 AI 局，顺手多投影一份 */
  spectator: SpectatorView[];
  spectatorFinals: Array<{ view: SpectatorView; decisions: DecisionRecord[] }>;
}

function turnsAt(state: GameState): HumanTurn[] {
  const turns: HumanTurn[] = [];
  for (const id of getAwaitingPlayerIds(state)) {
    const legalActions = getLegalActions(state, id);
    const first = legalActions[0];
    if (!first) continue;
    const kind = decisionKindOf(first);
    // ACKNOWLEDGE 不走 onHumanAction，面板永远见不到它
    if (!kind) continue;
    turns.push({ kind, view: toPlayerView(state, id), legalActions });
  }
  return turns;
}

let SAMPLE: Sample | null = null;

async function sample(): Promise<Sample> {
  if (SAMPLE) return SAMPLE;

  const out: Sample = {
    views: [],
    turns: [],
    finals: [],
    spectator: [],
    spectatorFinals: [],
  };

  for (const seed of SEEDS) {
    const rng = createRng(seed);
    const state = createGame({
      config: createConfig(10, { seed, roles: composeRoles(10, EVIL) }),
      humanSeat: null,
      personas: makePlaceholderPersonas(10),
      rng,
    });

    const decisions: DecisionRecord[] = [];
    const collect = (next: GameState) => {
      for (const player of next.players) out.views.push(toPlayerView(next, player.id));
      out.turns.push(...turnsAt(next));
      out.spectator.push(toSpectatorView(next));
    };

    collect(state);
    const final = await runGame({
      state,
      client: createMockAiClient(rng),
      rng,
      hooks: {
        onState: collect,
        onDecision: (record) => {
          decisions.push(record);
        },
      },
    });

    // 复盘面板只吃终局视角。每个座位各来一份——梅林与爪牙看到的复盘不是同一份
    for (const player of final.players) {
      out.finals.push({ view: toPlayerView(final, player.id), decisions });
    }
    out.spectatorFinals.push({ view: toSpectatorView(final), decisions });
  }

  SAMPLE = out;
  return out;
}

/** 递归遍历任意返回值，把每一个字符串交给 visit */
function walkStrings(node: unknown, visit: (text: string) => void): void {
  if (typeof node === "string") {
    visit(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) walkStrings(item, visit);
    return;
  }
  if (node !== null && typeof node === "object") {
    for (const value of Object.values(node)) walkStrings(value, visit);
  }
}

function offendersIn(label: string, value: unknown): string[] {
  const found: string[] = [];
  walkStrings(value, (text) => {
    if (CJK.test(text)) found.push(`${label} → ${text}`);
  });
  return found;
}

describe("英文模式下 view-model 不产出汉字", () => {
  it("夹具本身别悄悄跑空了", async () => {
    // 这条防的是"runGame 的 hook 没挂上导致下面几条在空池子上全绿"
    const { views, turns, finals } = await sample();
    expect(views.length).toBeGreaterThan(200);
    expect(turns.length).toBeGreaterThan(50);
    expect(finals.length).toBeGreaterThan(0);
    expect((await sample()).spectator.length).toBeGreaterThan(20);
    // 刺杀那几个表单只在走到刺杀的局里出现，缺了就等于白测一大块
    expect(turns.some((t) => t.kind === "ASSASSINATION")).toBe(true);
  });

  it("describeTrack / describeTable / describeRole / describeFeed", async () => {
    const { views } = await sample();
    const offenders: string[] = [];

    for (const view of views) {
      offenders.push(...offendersIn("describeTrack", describeTrack(view, en)));
      offenders.push(...offendersIn("describeTable", describeTable(view, en)));
      offenders.push(...offendersIn("describeRole", describeRole(view, en)));
      // 发言内容本身是 mock 造的中文，只查分组标签和座位名
      offenders.push(
        ...offendersIn(
          "describeFeed",
          describeFeed(view, en).map((entry) => ({
            name: entry.name,
            groupLabel: entry.groupLabel,
          })),
        ),
      );
      if (offenders.length > 0) break; // 第一条就够定位，不要刷屏
    }

    expect(offenders).toEqual([]);
  });

  it("describeVotes / describeVoteMatrix / describeTimeline", async () => {
    const { views } = await sample();
    const offenders: string[] = [];

    for (const view of views) {
      // 投票这一路全是我们自己拼的标签，没有模型生成的自由文本，可以整个查
      offenders.push(...offendersIn("describeVotes", describeVotes(view, en)));
      offenders.push(...offendersIn("describeVoteMatrix", describeVoteMatrix(view, en)));
      // 时间轴里的发言内容是 mock 造的中文，只查分组标签和投票卡
      offenders.push(
        ...offendersIn(
          "describeTimeline",
          describeTimeline(view, en).map((item) =>
            item.type === "vote"
              ? { groupLabel: item.groupLabel, tally: item.tally }
              : { groupLabel: item.groupLabel },
          ),
        ),
      );
      if (offenders.length > 0) break;
    }

    expect(offenders).toEqual([]);
  });

  it("describeTurn（含五种表单）与 describeStrike / strikeLabel", async () => {
    const { turns } = await sample();
    const offenders: string[] = [];

    for (const turn of turns) {
      const form = describeTurn(turn, en);
      offenders.push(...offendersIn(`describeTurn:${turn.kind}`, form));

      if (form?.kind === "ASSASSINATION") {
        const brief = describeStrike(form as AssassinationForm, turn.view, en);
        // opinions 里是 mock 造的中文发言，只查我们自己拼的那几段
        offenders.push(
          ...offendersIn("describeStrike", {
            hiddenAllyHint: brief.hiddenAllyHint,
            risks: brief.targets.map((t) => t.risk),
            labels: brief.targets.map((t) => t.label),
          }),
        );
        offenders.push(...offendersIn("strikeLabel", strikeLabel(null, en)));
        for (const target of brief.targets) {
          offenders.push(...offendersIn("strikeLabel", strikeLabel(target, en)));
        }
      }
      if (offenders.length > 0) break;
    }

    expect(offenders).toEqual([]);
  });

  it("describeGameOver", async () => {
    const { finals } = await sample();
    const offenders: string[] = [];

    /** 一条心证里，除 reasoning 之外全是我们自己拼的 */
    const mindLabels = (entry: ReplayEntry) => ({
      seatLabel: entry.seatLabel,
      kindLabel: entry.kindLabel,
      flags: entry.flags,
      latencyLabel: entry.latencyLabel,
    });

    for (const { view, decisions } of finals) {
      const brief = describeGameOver(view, decisions, en);
      if (!brief) continue;
      // reasoning 与 opinions 的 content 是模型（这里是 mock）产出的中文，不是文案
      offenders.push(
        ...offendersIn("describeGameOver", {
          ...brief,
          // 回放里的 reasoning 与发言正文同理，只查我们自己拼的那几段
          review: brief.review.map((round) => ({
            label: round.label,
            items: round.items.map((item) => ({
              groupLabel: item.groupLabel,
              ...(item.type === "speech"
                ? { name: item.entry.name, mind: item.mind && mindLabels(item.mind) }
                : { tally: item.tally }),
            })),
            tail: round.tail.map(mindLabels),
          })),
          strike: brief.strike && {
            ...brief.strike,
            opinions: brief.strike.opinions.map((o) => o.label),
          },
        }),
      );
      if (offenders.length > 0) break;
    }

    expect(offenders).toEqual([]);
  });

  it("describeCast / describeMinds（观战）", async () => {
    const { spectator, spectatorFinals } = await sample();
    const offenders: string[] = [];

    for (const view of spectator) {
      const all = new Set(view.players.map((p) => p.id));
      // 两种极端都要走：全盖时是牌背那几句，全翻时才轮到角色名
      offenders.push(...offendersIn("describeCast:down", describeCast(view, new Set(), en)));
      offenders.push(...offendersIn("describeCast:up", describeCast(view, all, en)));
      if (offenders.length > 0) break;
    }

    for (const { view, decisions } of spectatorFinals) {
      const all = new Set(view.players.map((p) => p.id));
      // reasoning 是 mock 造的中文，不是文案；只查我们自己拼的那几段
      offenders.push(
        ...offendersIn(
          "describeMinds",
          describeMinds(view, decisions, all, en).map((entry) => ({
            seatLabel: entry.seatLabel,
            roleLabel: entry.roleLabel,
            kindLabel: entry.kindLabel,
            flags: entry.flags,
            latencyLabel: entry.latencyLabel,
          })),
        ),
      );
      if (offenders.length > 0) break;
    }

    expect(offenders).toEqual([]);
  });
});
