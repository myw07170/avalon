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
import {
  ROLE_META,
  ROLE_TEAM,
  type PlayerId,
  type PlayerView,
  type Role,
  type Team,
  type WinReason,
} from "@/lib/game";
import type { DecisionRecord } from "@/lib/ai/orchestrator";
import type { SeatTone } from "./role-card-model";

// ---------------------------------------------------------------------------
// 形状
// ---------------------------------------------------------------------------

export interface RevealedSeat {
  id: PlayerId;
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
  /** 动手之前坏人各自的公开推测，按发言顺序 */
  opinions: Array<{ label: string; content: string }>;
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

export interface ReplayRound {
  missionIndex: number;
  label: string;
  entries: ReplayEntry[];
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
  /** 观战局走不到这里（reveal 为 null），所以恒有值 */
  youWon: boolean;
  yourRoleLabel: string;
  strike: StrikeOutcome | null;
  seats: RevealedSeat[];
  missions: RevealedMission[];
  replay: ReplayRound[];
  /** 一次模型都没调用过（全 auto）时为 null */
  timing: TimingBrief | null;
}

// ---------------------------------------------------------------------------
// 文案
// ---------------------------------------------------------------------------

const TEAM_LABEL: Record<Team, string> = {
  GOOD: "好人阵营",
  EVIL: "坏人阵营",
};

/**
 * 四种终局各一句。
 *
 * 【穷尽 switch 不是风格】WinReason 是闭合联合类型，将来加一种终局会在这里
 * 变成编译错误，而不是悄悄渲染出一个空字符串。
 */
function reasonLabelOf(reason: WinReason): string {
  switch (reason) {
    case "THREE_MISSIONS":
      return "坏人破坏了三次任务";
    case "REJECT_LIMIT":
      return "同一轮里连续否决撞上了上限，视为坏人获胜";
    case "ASSASSINATION_HIT":
      return "好人做完了三次任务，但刺客认出了梅林";
    case "ASSASSINATION_MISS":
      return "好人做完了三次任务，刺客没能认出梅林";
  }
}

const KIND_LABEL: Record<DecisionRecord["kind"], string> = {
  TEAM_PROPOSAL: "组队",
  SPEECH: "发言",
  VOTE: "投票",
  MISSION_CARD: "任务票",
  ASSASSIN_OPINION: "刺杀推测",
  ASSASSINATION: "刺杀",
};

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

/** 座位一律按号称呼，名字只是补充——与 role-card-model 的 seatName 同口径 */
function seatLabel(view: PlayerView, id: PlayerId): string {
  const player = view.players.find((p) => p.id === id);
  const base = player ? `${id} 号（${player.name}）` : `${id} 号`;
  return id === view.selfId ? `${base}（你）` : base;
}

function roleLabel(role: Role): string {
  return ROLE_META[role].label;
}

/** reveal.roles 里第一个梅林。引擎保证本局恰有一个 */
function findMerlin(roles: Record<PlayerId, Role>): PlayerId | null {
  const found = Object.entries(roles).find(([, role]) => role === "MERLIN");
  return found ? Number(found[0]) : null;
}

// ---------------------------------------------------------------------------
// 各块
// ---------------------------------------------------------------------------

function strikeOf(view: PlayerView): StrikeOutcome | null {
  const record = view.reveal?.assassination;
  // 坏人靠三次任务赢、或者否决撞线时，游戏根本没走到刺杀。
  // 这是正常的终局形态，不是缺数据
  if (!record || !view.reveal) return null;

  const { roles } = view.reveal;
  const targetRole = roles[record.targetId];
  const merlinId = findMerlin(roles);

  return {
    hit: record.hit,
    headline: record.hit ? "刺中了梅林" : "刺空了",
    assassinLabel: seatLabel(view, record.assassinId),
    targetLabel: seatLabel(view, record.targetId),
    targetRoleLabel: targetRole ? roleLabel(targetRole) : "身份不明",
    merlinLabel:
      merlinId === null ? "本局没有梅林" : `梅林是 ${seatLabel(view, merlinId)}`,
    opinions: record.opinions.map((o) => ({
      label: seatLabel(view, o.playerId),
      // 空发言是合法状态（legal.ts 不校验文本），如实显示而不是画个空气泡
      content: o.content.trim() === "" ? "（没有开口）" : o.content,
    })),
  };
}

function seatsOf(view: PlayerView): RevealedSeat[] {
  const roles = view.reveal?.roles ?? {};
  return view.players.map((player) => {
    const role = roles[player.id];
    const team = role ? ROLE_TEAM[role] : "GOOD";
    return {
      id: player.id,
      label: seatLabel(view, player.id),
      roleLabel: role ? roleLabel(role) : "身份不明",
      team,
      // 【终局按阵营染色，不再标 self】self 那一档是黄铜，会把你自己的阵营盖掉，
      // 而复盘要看的恰恰是"谁跟谁一伙"。是不是你，由 label 里的「你」说明
      tone: team === "EVIL" ? "evil" : "good",
      isSelf: player.id === view.selfId,
    };
  });
}

function missionsOf(view: PlayerView): RevealedMission[] {
  return (view.reveal?.missions ?? []).map((mission) => {
    const failedBy = mission.cards
      .filter((card) => !card.success)
      .map((card) => card.playerId)
      .sort((a, b) => a - b);

    return {
      index: mission.missionIndex,
      label: `第 ${mission.missionIndex + 1} 轮`,
      succeeded: mission.succeeded,
      failCount: mission.failCount,
      teamLabels: mission.team.map((id) => seatLabel(view, id)),
      failedByLabels: failedBy.map((id) => seatLabel(view, id)),
      // 第四轮要两张失败票，所以"成功"也可能带着一张——那张票是有信息的
      detail: mission.succeeded
        ? mission.failCount > 0
          ? `成功 · ${mission.failCount} 张失败票`
          : "成功"
        : `失败 · ${mission.failCount} 张失败票`,
    };
  });
}

function replayOf(view: PlayerView, decisions: readonly DecisionRecord[]): ReplayRound[] {
  const rounds = new Map<number, ReplayEntry[]>();

  for (const record of decisions) {
    const entry: ReplayEntry = {
      playerId: record.playerId,
      seatLabel: seatLabel(view, record.playerId),
      kindLabel: KIND_LABEL[record.kind],
      reasoning: record.result.payload.reasoning,
      flags: [
        record.result.fallback ? "schema 兜底" : null,
        record.rescued ? "合法性兜底" : null,
        record.auto ? "未调用模型" : null,
      ].filter((flag): flag is string => flag !== null),
      latencyLabel: record.auto ? null : `${(record.latencyMs / 1000).toFixed(1)}s`,
    };
    const bucket = rounds.get(record.missionIndex);
    if (bucket) bucket.push(entry);
    else rounds.set(record.missionIndex, [entry]);
  }

  return [...rounds.entries()]
    .sort(([a], [b]) => a - b)
    .map(([missionIndex, entries]) => ({
      missionIndex,
      label: `第 ${missionIndex + 1} 轮`,
      entries,
    }));
}

/**
 * 每类决策的耗时。
 *
 * 【未调用模型的那些要排除】把好人的任务票（恒为 0ms）混进平均值，
 * 会把"模型到底有多慢"这个数字算得虚低，而这张表存在的全部意义就是回答那个问题。
 */
function timingOf(decisions: readonly DecisionRecord[]): TimingBrief | null {
  const asked = decisions.filter((d) => !d.auto);
  if (asked.length === 0) return null;

  const kinds = [...new Set(asked.map((d) => d.kind))];
  const rows = kinds
    .map((kind) => {
      const ms = asked.filter((d) => d.kind === kind).map((d) => d.latencyMs);
      const total = ms.reduce((sum, v) => sum + v, 0);
      return {
        kindLabel: KIND_LABEL[kind],
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
 * 返回 null 的两种情形，面板都要能画出一句话：
 * - 还没到终局（reveal 恒为 null，见 view.ts 的 revealOf）
 * - 观战局（mySeatAtom 为 null → myViewAtom 为 null，视角本身就不存在）
 */
export function describeGameOver(
  view: PlayerView | null,
  decisions: readonly DecisionRecord[],
): GameOverBrief | null {
  if (!view?.reveal) return null;
  const { winner, winReason } = view.reveal;

  return {
    winner,
    winnerLabel: `${TEAM_LABEL[winner]}获胜`,
    reasonLabel: reasonLabelOf(winReason),
    youWon: view.selfTeam === winner,
    yourRoleLabel: roleLabel(view.selfRole),
    strike: strikeOf(view),
    seats: seatsOf(view),
    missions: missionsOf(view),
    replay: replayOf(view, decisions),
    timing: timingOf(decisions),
  };
}
