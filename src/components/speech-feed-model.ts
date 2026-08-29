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
import { describeVotes, type VoteTally } from "./vote-model";

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
// 时间轴：发言 + 组队投票结果
// ---------------------------------------------------------------------------

/**
 * 【`describeFeed` 的签名与返回值刻意一个字没动】`assassination-model.ts` 靠
 * `entry.kind === "opinion"` 从里面捞刺杀推测，把返回值改成联合类型会把那条路
 * 和它二十来条测试一起带塌。所以时间轴是**新增**的一层，不是改造。
 */
export type TimelineItem =
  | {
      type: "speech";
      key: string;
      groupLabel: string | null;
      /**
       * 这一条属于第几轮任务。
       *
       * 【为什么放在 item 上而不是 FeedEntry 上】终局复盘要按轮次把时间轴切段，
       * 而 `FeedEntry` 是 `describeFeed` 的返回值，`assassination-model.ts` 还在用它，
       * 那条路和它的测试不该被这件事牵动。轮次是"时间轴怎么排"的属性，
       * 不是"一条发言长什么样"的属性。
       */
      missionIndex: number;
      entry: FeedEntry;
    }
  | {
      type: "vote";
      key: string;
      groupLabel: string | null;
      missionIndex: number;
      tally: VoteTally;
    };

/**
 * 发言流 + 每次组队投票的逐人票。
 *
 * 【按分组 flush，不按 seq 排序】复盘讨论的 `Speech.attempt` 记的是该轮**最后一次**
 * 提议的 attempt，与提议记录撞号；按 `(missionIndex, attempt, seq)` 排序会把复盘发言
 * 排到本该更早的投票卡前面去。分组 key 是这个文件本来就有的概念，顺着它走不引入
 * 第二套顺序。
 *
 * 【投票卡落在同组最后一条发言之后】一次提议的完整故事是"队长解释名单 → 大家回应
 * → 票出来了"，卡片就该收在这个故事的末尾。它自然也不带 groupLabel——那条分隔线
 * 已经由本组第一条发言画过了。
 */
export function describeTimeline(view: AnyView, msg: Messages): TimelineItem[] {
  const entries = describeFeed(view, msg);
  const unflushed = new Map(describeVotes(view, msg).map((tally) => [tally.key, tally]));
  const items: TimelineItem[] = [];
  let currentKey: string | null = null;
  // 兜底用：speeches 与 entries 一一对应，取不到的那一格沿用上一条的轮次，
  // 而不是给 0——那会把一条发言悄悄挪到第一轮去
  let currentMissionIndex = 0;

  const flush = (key: string | null): void => {
    if (key === null) return;
    const tally = unflushed.get(key);
    if (!tally) return;
    unflushed.delete(key);
    items.push({
      type: "vote",
      key: `vote-${tally.key}`,
      groupLabel: null,
      missionIndex: tally.missionIndex,
      tally,
    });
  };

  entries.forEach((entry, index) => {
    // describeFeed 是 view.speeches 的逐条映射，同序且一一对应
    const speech = view.speeches[index];
    const key = speech ? groupOf(speech, msg).key : currentKey;
    if (speech) currentMissionIndex = speech.missionIndex;
    if (key !== currentKey) {
      flush(currentKey);
      currentKey = key;
    }
    items.push({
      type: "speech",
      key: `speech-${entry.seq}`,
      groupLabel: entry.groupLabel,
      missionIndex: currentMissionIndex,
      entry,
    });
  });
  flush(currentKey);

  // 兜底：一条发言都没有的提议。理论上不存在——每次提议至少带着队长的选人说明——
  // 但真出现了也不该把那次投票吞掉，所以补在末尾并自己带上分组标签
  for (const tally of unflushed.values()) {
    items.push({
      type: "vote",
      key: `vote-${tally.key}`,
      groupLabel: msg.feed.groupProposal(tally.missionIndex + 1, tally.attempt + 1),
      missionIndex: tally.missionIndex,
      tally,
    });
  }

  return items;
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
