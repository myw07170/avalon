/**
 * 对局中的圆桌要显示什么。
 *
 * 每个座位同时压着四层互相独立的信息，所以不能塞进一个 tone：
 *
 * | 层 | 来源 | 变不变 |
 * | --- | --- | --- |
 * | 身份认知（谁是坏人） | describeRole 的 marks | 一整局不变 |
 * | 队长 | view.currentLeaderId | 每轮换 |
 * | 在队伍里 | view.proposedTeam | 每次提议换 |
 * | 交没交（投票/发言） | view.awaitingPlayerIds + 本阶段参与者 | 每个阶段换 |
 *
 * 【刺杀阶段不标参与者】那个阶段只有坏人行动，把"参与者"画出来等于把坏人名单
 * 画出来。view.awaitingPlayerIds 确实会给出当前行动的坏人座位（引擎的既有行为，
 * 且刺杀发生在终局前一步），但我们不主动把整份名单铺开。
 */
import type { Phase, PlayerId, PlayerView } from "@/lib/game";
import { describeRole, type SeatTone } from "./role-card-model";

/** idle = 本阶段不需要他动；acting = 还在等他；done = 已经交了 */
export type SeatStatus = "idle" | "acting" | "done";

export interface SeatState {
  id: PlayerId;
  name: string;
  isSelf: boolean;
  /** 身份认知层，一整局不变 */
  tone: SeatTone;
  isLeader: boolean;
  onTeam: boolean;
  status: SeatStatus;
}

export interface TableState {
  seats: SeatState[];
  phaseLabel: string;
  /** 「已投 3 / 7」。不需要计数的阶段为 null */
  progressLabel: string | null;
  /** 环下面那句话：现在在等谁做什么 */
  statusLine: string;
  /** 「第 2 轮 · 否决 1 / 5」 */
  roundLabel: string;
}

const PHASE_LABEL: Record<Phase, string> = {
  SETUP: "准备",
  ROLE_REVEAL: "查看身份",
  TEAM_BUILDING: "组队",
  PROPOSAL_DISCUSSION: "组队讨论",
  TEAM_VOTE: "组队投票",
  MISSION_EXECUTION: "执行任务",
  MISSION_RESULT: "任务结算",
  REVIEW_DISCUSSION: "复盘讨论",
  ASSASSINATION: "刺杀",
  GAME_OVER: "对局结束",
};

/** 每个阶段在等人做什么。用于拼「等 3 号出名单」这类句子 */
const PHASE_VERB: Partial<Record<Phase, string>> = {
  ROLE_REVEAL: "确认身份",
  TEAM_BUILDING: "出名单",
  PROPOSAL_DISCUSSION: "发言",
  REVIEW_DISCUSSION: "发言",
  TEAM_VOTE: "投票",
  MISSION_EXECUTION: "出任务票",
  ASSASSINATION: "决定",
};

/** 进度条的量词。没有的阶段不显示计数 */
const PHASE_COUNTER: Partial<Record<Phase, string>> = {
  ROLE_REVEAL: "已确认",
  PROPOSAL_DISCUSSION: "已发言",
  REVIEW_DISCUSSION: "已发言",
  TEAM_VOTE: "已投",
  MISSION_EXECUTION: "已出票",
};

/**
 * 本阶段已经交了的人。
 *
 * 【同时行动和依次行动要分开算】投票、任务票、确认身份是同时的，
 * "没在等他"就等于"他交了"；讨论是依次的，发言序里排在游标后面的人
 * 既没说过也不在等——用"参与者减去 awaiting"会把整队人都标成已发言。
 *
 * 刺杀阶段一律返回空：那个阶段只有坏人行动，标出来等于把坏人名单画出来。
 */
function doneIdsOf(view: PlayerView): PlayerId[] {
  const waiting = new Set(view.awaitingPlayerIds);

  switch (view.phase) {
    case "ROLE_REVEAL":
    case "TEAM_VOTE":
      return view.players.map((p) => p.id).filter((id) => !waiting.has(id));

    case "MISSION_EXECUTION":
      return (view.proposedTeam ?? []).filter((id) => !waiting.has(id));

    case "PROPOSAL_DISCUSSION":
    case "REVIEW_DISCUSSION":
      // progress.submitted 就是发言游标
      return view.speakingOrder.slice(0, view.progress.submitted);

    // 队长还没出名单；出了就转阶段了，没有"已交"这个中间态
    case "TEAM_BUILDING":
    case "ASSASSINATION":
    case "SETUP":
    case "MISSION_RESULT":
    case "GAME_OVER":
      return [];
  }
}

function nameOf(view: PlayerView, id: PlayerId): string {
  const player = view.players.find((p) => p.id === id);
  return player ? `${id} 号（${player.name}）` : `${id} 号`;
}

function statusLineOf(view: PlayerView): string {
  const waiting = view.awaitingPlayerIds;
  const verb = PHASE_VERB[view.phase];

  if (view.phase === "GAME_OVER") return "对局已结束。";
  if (waiting.length === 0 || !verb) return "结算中⋯";

  // 只等一个人时点名，等一批人时只报数——"谁还没交"是公开的，"谁先交的"不是
  if (waiting.length === 1) {
    const only = waiting[0]!;
    return only === view.selfId ? `轮到你${verb}。` : `等 ${nameOf(view, only)}${verb}。`;
  }
  const mine = waiting.includes(view.selfId) ? "，其中包括你" : "";
  return `等 ${waiting.length} 人${verb}${mine}。`;
}

function progressLabelOf(view: PlayerView): string | null {
  const counter = PHASE_COUNTER[view.phase];
  if (!counter || view.progress.required === 0) return null;
  return `${counter} ${view.progress.submitted} / ${view.progress.required}`;
}

export function describeTable(view: PlayerView): TableState {
  const knowledge = new Map(describeRole(view).marks.map((m) => [m.id, m.tone]));
  const waiting = new Set(view.awaitingPlayerIds);
  const done = new Set(doneIdsOf(view));
  const team = new Set(view.proposedTeam ?? []);

  const seats: SeatState[] = view.players.map((player) => ({
    id: player.id,
    name: player.name,
    isSelf: player.id === view.selfId,
    tone: knowledge.get(player.id) ?? "plain",
    // TEAM_BUILDING 时队长还没出名单，标出来才知道在等谁
    isLeader: player.id === view.currentLeaderId,
    onTeam: team.has(player.id),
    status: waiting.has(player.id) ? "acting" : done.has(player.id) ? "done" : "idle",
  }));

  return {
    seats,
    phaseLabel: PHASE_LABEL[view.phase],
    progressLabel: progressLabelOf(view),
    statusLine: statusLineOf(view),
    roundLabel: `第 ${view.missionIndex + 1} 轮 · 否决 ${view.rejectCount} / ${view.maxRejects}`,
  };
}
