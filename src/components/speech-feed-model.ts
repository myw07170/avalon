/**
 * 发言流。
 *
 * 【四个阶段都会往 speeches 里写】队长的选人说明（TEAM_BUILDING）、
 * 组队讨论、复盘讨论、以及刺杀阶段的逐个推测。最后一个容易漏——
 * assassination.ts 明确把它当作"说出口的话"记进 speeches，不是暗票。
 *
 * 三种发言在流里要分得开：选人说明是队长对自己名单的解释，
 * 刺杀讨论是终局前的公开推测，其余才是普通发言。
 */
import type { Messages } from "@/i18n/messages";
import type { AnyView, Phase, PlayerId, Speech } from "@/lib/game";

export type SpeechKind = "proposal" | "speech" | "opinion";

export interface FeedEntry {
  seq: number;
  playerId: PlayerId;
  name: string;
  isSelf: boolean;
  content: string;
  /**
   * 内容是空的。
   *
   * 【引擎不校验发言内容】legal.ts 只校验"轮没轮到你"，文本本身不管。
   * 所以一条空发言是合法状态——渲染成一个空气泡会让玩家以为界面坏了，
   * 得如实说"他没说话"。
   */
  isSilent: boolean;
  kind: SpeechKind;
  /** 只有该组第一条有，用来画分隔线 */
  groupLabel: string | null;
}

interface Group {
  key: string;
  label: string;
}

/**
 * 发言归到哪一组。
 *
 * 队长的选人说明和紧跟着的组队讨论属于同一次提议，归一组——
 * 拆开的话"他当时怎么解释这份名单"和"大家怎么回应"会隔着一条分隔线。
 */
function groupOf(speech: Speech, msg: Messages): Group {
  const round = speech.missionIndex + 1;

  switch (speech.phase) {
    case "TEAM_BUILDING":
    case "PROPOSAL_DISCUSSION":
      return {
        key: `propose-${speech.missionIndex}-${speech.attempt}`,
        label: msg.feed.groupProposal(round, speech.attempt + 1),
      };

    case "REVIEW_DISCUSSION":
      return { key: `review-${speech.missionIndex}`, label: msg.feed.groupReview(round) };

    case "ASSASSINATION":
      return { key: "assassination", label: msg.feed.groupAssassination };

    default:
      // 其余阶段不产生发言。真出现了也别丢，按阶段名单独成组
      return { key: `other-${speech.phase}`, label: labelOfPhase(speech.phase) };
  }
}

function labelOfPhase(phase: Phase): string {
  return phase;
}

function kindOf(phase: Phase): SpeechKind {
  if (phase === "TEAM_BUILDING") return "proposal";
  if (phase === "ASSASSINATION") return "opinion";
  return "speech";
}

export function describeFeed(view: AnyView, msg: Messages): FeedEntry[] {
  const nameOf = new Map(view.players.map((p) => [p.id, p.name]));
  let lastGroup: string | null = null;

  // speeches 只被追加，seq 就是下标顺序，不需要再排一次
  return view.speeches.map((speech) => {
    const group = groupOf(speech, msg);
    const isNewGroup = group.key !== lastGroup;
    lastGroup = group.key;

    return {
      seq: speech.seq,
      playerId: speech.playerId,
      name: nameOf.get(speech.playerId) ?? msg.seat.short(speech.playerId),
      isSelf: speech.playerId === view.selfId,
      content: speech.content,
      isSilent: speech.content.trim().length === 0,
      kind: kindOf(speech.phase),
      groupLabel: isNewGroup ? group.label : null,
    };
  });
}

// ---------------------------------------------------------------------------
// 打字机
// ---------------------------------------------------------------------------

/**
 * 一条发言打完的目标时长。
 *
 * 【必须短于发言之间的间隔】store 的 paceMsAtom 默认 800ms，且停顿发生在
 * 下一条发言出现【之前】。打字比这慢的话，上一条还没打完下一条就到了，
 * 观感是一直在被打断。所以按长度反推每字耗时，让总时长大致恒定。
 */
export const TYPEWRITER_TARGET_MS = 700;

/** 太长的发言不至于快到看不清，太短的也不至于慢得像卡住 */
export const TYPEWRITER_MIN_STEP_MS = 12;
export const TYPEWRITER_MAX_STEP_MS = 45;

export function typewriterStepMs(length: number): number {
  if (length <= 0) return TYPEWRITER_MAX_STEP_MS;
  const raw = TYPEWRITER_TARGET_MS / length;
  return Math.round(
    Math.min(TYPEWRITER_MAX_STEP_MS, Math.max(TYPEWRITER_MIN_STEP_MS, raw)),
  );
}
