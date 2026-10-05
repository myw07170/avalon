/**
 * 终局复盘面板的全部推导。
 *
 * 【唯一的数据源是 view.reveal】那是引擎明确批准公开的那一份（view.ts 的 revealOf
 * 只在 GAME_OVER 才填）。**不要读 gameStateAtom**——那是全知视角，
 * 组件读它一律算 bug（components/README.md）。
 *
 * 【这是全项目第一个 reveal.roles / reveal.missions[].cards 的消费者】
 * 在此之前，"谁投了失败票"这件事连终局都没有任何地方显示得出来：
 * PublicMissionRecord 刻意丢掉了 cards，所以只能走 reveal。
 *
 * 【不抛】认不出的形状返回 null，由面板兜一句话。渲染期抛就是白屏——
 * 与 action-panel-model 的 describeTurn 同一条约定。
 */
import type { Messages } from "@/i18n/messages";
import {
  ROLE_TEAM,
  type AnyView,
  type PlayerId,
  type Role,
  type Team,
} from "@/lib/game";
import type { DecisionRecord } from "@/lib/ai/orchestrator";
import type { SeatTone } from "./role-card-model";
import { describeTimeline, type FeedEntry } from "./speech-feed-model";
import { describeVoteMatrix, type VoteMatrix, type VoteTally } from "./vote-model";

// ---------------------------------------------------------------------------
// 形状
// ---------------------------------------------------------------------------

export interface RevealedSeat {
  id: PlayerId;
  role: Role | null;
  /** 「3 号（孙娜）」，自己那一座带「你」 */
  label: string;
  roleLabel: string;
  team: Team;
  tone: SeatTone;
  isSelf: boolean;
}

export interface StrikeOutcome {
  hit: boolean;
  /** 「刺中了」/「刺空了」 */
  headline: string;
  assassinLabel: string;
  targetLabel: string;
  /** 被刺那一座的真实身份。落空时这一行才是玩家最想看的 */
  targetRoleLabel: string;
  /** 「梅林是 3 号（孙娜）」。本局必有梅林，所以恒有值 */
  merlinLabel: string;
}

export interface RevealedMission {
  index: number;
  label: string;
  succeeded: boolean;
  failCount: number;
  /** 上过车的人 */
  teamLabels: string[];
  /** 投了失败票的人，按座位升序。成功的轮次为空数组 */
  failedByLabels: string[];
  detail: string;
}

export interface ReplayEntry {
  playerId: PlayerId;
  seatLabel: string;
  kindLabel: string;
  /** 模型的内心分析。auto 的那几手是引擎写的一句话 */
  reasoning: string;
  /** 「schema 兜底」「合法性兜底」「未调用模型」 */
  flags: string[];
  /** 「12.4s」。未调用模型时为 null */
  latencyLabel: string | null;
}

/**
 * 复盘时间轴上的一格。
 *
 * 【speech 这一支带着 mind，是这块的全部意义】"他嘴上说 X"和"他心里想的是 Y"
 * 挨在一起才有得看。分成两块各自列一遍，玩家要拿座位号在两处来回对，
 * 而那正是他本来就在费劲做的事。
 */
export type ReviewItem =
  | {
      type: "speech";
      key: string;
      groupLabel: string | null;
      entry: FeedEntry;
      /** 他说这句话时的内心分析。人类那几句为 null——人类的动作不进 DecisionRecord */
      mind: ReplayEntry | null;
    }
  | { type: "vote"; key: string; groupLabel: string | null; tally: VoteTally };

export interface ReviewRound {
  missionIndex: number;
  label: string;
  items: ReviewItem[];
  /**
   * 这一轮里**不产生发言**的那些心证：投票、任务票、刺杀。
   * 它们没有可以挂靠的气泡，只能按轮次收在末尾。
   */
  tail: ReplayEntry[];
}

export interface TimingRow {
  kindLabel: string;
  count: number;
  /** 毫秒 */
  avgMs: number;
  maxMs: number;
}

export interface TimingBrief {
  rows: TimingRow[];
  /** 真的问了模型的次数 */
  askedCount: number;
  /** 只有一个合法动作、直接落地的次数 */
  autoCount: number;
  totalMs: number;
}

export interface GameOverBrief {
  winner: Team;
  winnerLabel: string;
  reasonLabel: string;
  /**
   * 观战局为 null——没有"你"，也就无所谓输赢。
   *
   * 【这里原来写着"观战局走不到这里，所以恒有值"】那句话在观战模式做出来的
   * 同一刻就不成立了：观战局照样会走到 GAME_OVER，照样有 reveal。
   */
  youWon: boolean | null;
  /** 同上，观战局为 null */
  yourRoleLabel: string | null;
  strike: StrikeOutcome | null;
  seats: RevealedSeat[];
  missions: RevealedMission[];
  /**
   * 每次组队提议的逐人票。
   *
   * 【它和 missions 是两个信息级别，别合并】任务票来源（missions[].failedByLabels）
   * 走 reveal，**只有终局才公开**；组队票是全程公开的，对局中的发言流里早就画过了。
   * 混成一块渲染，下一个人会以为组队票也要等终局。
   */
  voteMatrix: VoteMatrix;
  /** 完整对话 + 每句话背后的心证，按轮次分段 */
  review: ReviewRound[];
  /** 一次模型都没调用过（全 auto）时为 null */
  timing: TimingBrief | null;
}

// ---------------------------------------------------------------------------
// 文案
// ---------------------------------------------------------------------------

/*
 * 阵营名、四种终局各一句、六类决策的名字，都在
 * `src/i18n/messages.zh.ts` 的 `team` / `gameOver` 命名空间里。
 *
 * 【`gameOver.reason` 仍然是 `Record<WinReason, string>`】原来这里是一个穷尽
 * switch，加一种终局会变成编译错误。搬进目录之后那条性质由 Record 的键完整性接管，
 * 而且**两种语言各查一次**——漏译一种终局同样是编译错误。
 */

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

/** 座位一律按号称呼，名字只是补充——与 role-card-model 的 seatName 同口径 */
function seatLabel(view: AnyView, id: PlayerId, msg: Messages): string {
  const player = view.players.find((p) => p.id === id);
  const base = player ? msg.seat.named(id, player.name) : msg.seat.short(id);
  return id === view.selfId ? msg.seat.withYou(base) : base;
}

/** reveal.roles 里第一个梅林。引擎保证本局恰有一个 */
function findMerlin(roles: Record<PlayerId, Role>): PlayerId | null {
  const found = Object.entries(roles).find(([, role]) => role === "MERLIN");
  return found ? Number(found[0]) : null;
}

// ---------------------------------------------------------------------------
// 各块
// ---------------------------------------------------------------------------

function strikeOf(view: AnyView, msg: Messages): StrikeOutcome | null {
  const record = view.reveal?.assassination;
  // 坏人靠三次任务赢、或者否决撞线时，游戏根本没走到刺杀。
  // 这是正常的终局形态，不是缺数据
  if (!record || !view.reveal) return null;

  const { roles } = view.reveal;
  const targetRole = roles[record.targetId];
  const merlinId = findMerlin(roles);

  return {
    hit: record.hit,
    headline: record.hit ? msg.gameOver.hit : msg.gameOver.miss,
    assassinLabel: seatLabel(view, record.assassinId, msg),
    targetLabel: seatLabel(view, record.targetId, msg),
    targetRoleLabel: targetRole
      ? msg.roles[targetRole].label
      : msg.gameOver.unknownRole,
    merlinLabel:
      merlinId === null
        ? msg.gameOver.noMerlin
        : msg.gameOver.merlinIs(seatLabel(view, merlinId, msg)),
  };
}

function seatsOf(view: AnyView, msg: Messages): RevealedSeat[] {
  const roles = view.reveal?.roles ?? {};
  return view.players.map((player) => {
    const role = roles[player.id];
    const team = role ? ROLE_TEAM[role] : "GOOD";
    return {
      id: player.id,
      label: seatLabel(view, player.id, msg),
      role: role ?? null,
      roleLabel: role ? msg.roles[role].label : msg.gameOver.unknownRole,
      team,
      // 【终局按阵营染色，不再标 self】self 那一档是黄铜，会把你自己的阵营盖掉，
      // 而复盘要看的恰恰是"谁跟谁一伙"。是不是你，由 label 里的「你」说明
      tone: team === "EVIL" ? "evil" : "good",
      isSelf: player.id === view.selfId,
    };
  });
}

function missionsOf(view: AnyView, msg: Messages): RevealedMission[] {
  return (view.reveal?.missions ?? []).map((mission) => {
    const failedBy = mission.cards
      .filter((card) => !card.success)
      .map((card) => card.playerId)
      .sort((a, b) => a - b);

    return {
      index: mission.missionIndex,
      label: msg.common.round(mission.missionIndex + 1),
      succeeded: mission.succeeded,
      failCount: mission.failCount,
      teamLabels: mission.team.map((id) => seatLabel(view, id, msg)),
      failedByLabels: failedBy.map((id) => seatLabel(view, id, msg)),
      // 第四轮要两张失败票，所以"成功"也可能带着一张——那张票是有信息的
      detail: mission.succeeded
        ? mission.failCount > 0
          ? msg.gameOver.missionSuccessWithFails(mission.failCount)
          : msg.gameOver.missionSuccess
        : msg.gameOver.missionFail(mission.failCount),
    };
  });
}

function replayEntryOf(
  view: AnyView,
  record: DecisionRecord,
  msg: Messages,
): ReplayEntry {
  return {
    playerId: record.playerId,
    seatLabel: seatLabel(view, record.playerId, msg),
    kindLabel: msg.gameOver.kind[record.kind],
    reasoning: record.result.payload.reasoning,
    flags: [
      record.result.fallback ? msg.gameOver.flagSchema : null,
      record.rescued ? msg.gameOver.flagRescued : null,
      record.auto ? msg.gameOver.flagAuto : null,
    ].filter((flag): flag is string => flag !== null),
    latencyLabel: record.auto ? null : `${(record.latencyMs / 1000).toFixed(1)}s`,
  };
}

/**
 * 这一手提交上去的公开原文；不产生发言的动作返回 null。
 *
 * 【读的是 record.action 而不是 result.payload】action 是**实际交给引擎**的那个
 * （合法性兜底之后的），而引擎正是拿它记的 Speech。rescued 的那几手里 payload
 * 还留着模型原本想做的，拿它去配对配不上——那恰恰说明两者不是一回事。
 */
function spokenTextOf(action: DecisionRecord["action"]): string | null {
  switch (action.type) {
    // 队长的选人说明就是他在提议讨论里的那一次发言（phases/teamBuilding.ts）
    case "PROPOSE_TEAM":
      return action.statement;
    case "SPEAK":
      return action.content;
    default:
      return null;
  }
}

/**
 * 完整对话 + 每句话背后的心证，按轮次分段。
 *
 * 【配对是精确的，不是启发式】三条事实凑齐了它：
 * 1. `runGame` 的主循环里 `onDecision` 恒在对应的 `reduce` 之前调用，并发阶段
 *    也按座位序逐个走——决策流与 `view.speeches` 是同一条时间线。
 * 2. `record.action` 带着提交上去的原文，而引擎就是拿它记的 Speech。
 * 3. 人类那几手 `record` 为 null（`takeTurn` 走 onHumanAction 那一支），
 *    所以人类的发言本来就配不上心证。
 *
 * 【座位号和原文两个条件都要判】只判顺序，人类插在中间时整条会**错位一格**，
 * 症状是把 A 的心证安到 B 的发言底下——比缺一格严重得多。只判原文，
 * mock 造得出两条一模一样的空发言，会配错。两条一起判，人类那几句自然被跳过，
 * 指针停在原地。
 */
function reviewOf(
  view: AnyView,
  decisions: readonly DecisionRecord[],
  msg: Messages,
): ReviewRound[] {
  // 会变成发言的那些，按原顺序排队；其余的按轮次分桶留给 tail
  const spoken = decisions.filter((r) => spokenTextOf(r.action) !== null);
  const tails = new Map<number, ReplayEntry[]>();
  for (const record of decisions) {
    if (spokenTextOf(record.action) !== null) continue;
    const bucket = tails.get(record.missionIndex);
    const entry = replayEntryOf(view, record, msg);
    if (bucket) bucket.push(entry);
    else tails.set(record.missionIndex, [entry]);
  }

  const rounds = new Map<number, ReviewItem[]>();
  let cursor = 0;

  for (const item of describeTimeline(view, msg)) {
    let reviewItem: ReviewItem;

    if (item.type === "vote") {
      reviewItem = {
        type: "vote",
        key: item.key,
        groupLabel: item.groupLabel,
        tally: item.tally,
      };
    } else {
      const head = spoken[cursor];
      const matched =
        head !== undefined &&
        head.playerId === item.entry.playerId &&
        spokenTextOf(head.action) === item.entry.content;
      if (matched) cursor += 1;

      reviewItem = {
        type: "speech",
        key: item.key,
        groupLabel: item.groupLabel,
        entry: item.entry,
        mind: matched ? replayEntryOf(view, head, msg) : null,
      };
    }

    const bucket = rounds.get(item.missionIndex);
    if (bucket) bucket.push(reviewItem);
    else rounds.set(item.missionIndex, [reviewItem]);
  }

  // 只有 tail、没有任何发言的轮次也要出现，否则那几条心证会凭空消失
  for (const missionIndex of tails.keys()) {
    if (!rounds.has(missionIndex)) rounds.set(missionIndex, []);
  }

  return [...rounds.entries()]
    .sort(([a], [b]) => a - b)
    .map(([missionIndex, items]) => ({
      missionIndex,
      label: msg.common.round(missionIndex + 1),
      items,
      tail: tails.get(missionIndex) ?? [],
    }));
}

/**
 * 每类决策的耗时。
 *
 * 【未调用模型的那些要排除】把好人的任务票（恒为 0ms）混进平均值，
 * 会把"模型到底有多慢"这个数字算得虚低，而这张表存在的全部意义就是回答那个问题。
 */
function timingOf(decisions: readonly DecisionRecord[], msg: Messages): TimingBrief | null {
  const asked = decisions.filter((d) => !d.auto);
  if (asked.length === 0) return null;

  const kinds = [...new Set(asked.map((d) => d.kind))];
  const rows = kinds
    .map((kind) => {
      const ms = asked.filter((d) => d.kind === kind).map((d) => d.latencyMs);
      const total = ms.reduce((sum, v) => sum + v, 0);
      return {
        kindLabel: msg.gameOver.kind[kind],
        count: ms.length,
        avgMs: Math.round(total / ms.length),
        maxMs: Math.max(...ms),
      };
    })
    .sort((a, b) => b.avgMs - a.avgMs);

  return {
    rows,
    askedCount: asked.length,
    autoCount: decisions.length - asked.length,
    totalMs: asked.reduce((sum, d) => sum + d.latencyMs, 0),
  };
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

/**
 * 【只剩一种情形返回 null】还没到终局——reveal 在 GAME_OVER 之前恒为 null
 * （见 view.ts 的 revealOf）。
 *
 * 观战局**不再**返回 null：它有自己的视角（toSpectatorView），终局照样出复盘，
 * 只是 youWon / yourRoleLabel 两项为 null，面板画中立版标题。
 */
export function describeGameOver(
  view: AnyView | null,
  decisions: readonly DecisionRecord[],
  msg: Messages,
): GameOverBrief | null {
  if (!view?.reveal) return null;
  const { winner, winReason } = view.reveal;

  return {
    winner,
    winnerLabel: msg.gameOver.winner(msg.team.label[winner]),
    reasonLabel: msg.gameOver.reason[winReason],
    youWon: view.selfTeam === null ? null : view.selfTeam === winner,
    yourRoleLabel: view.selfRole === null ? null : msg.roles[view.selfRole].label,
    strike: strikeOf(view, msg),
    seats: seatsOf(view, msg),
    missions: missionsOf(view, msg),
    // 复用同一份推导，不重写——proposalHistory 在 PublicView 上，不必碰 reveal
    voteMatrix: describeVoteMatrix(view, msg),
    review: reviewOf(view, decisions, msg),
    timing: timingOf(decisions, msg),
  };
}
