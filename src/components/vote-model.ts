/**
 * 组队投票的逐人票，三个消费面共用的唯一推导。
 *
 * 【为什么可以画出来】组队投票规则上就是公开投票（rules.md §4.2）。引擎把它
 * 原样留在 `PublicProposalRecord.votes` 里，`PlayerView` 与 `SpectatorView` 都拿得到——
 * 与任务票（`MissionRecord.cards`，只有终局的 `reveal` 才有）是两个信息级别，别混。
 *
 * 【「全员投完才公开」不需要在这里实现】未结算的票待在 `state.pending.votes`，
 * 那个对象根本进不了任何视角（`view.ts` 的 `submissionOf` 只把它折算成两个数字）。
 * 所以本文件读到的每一条都**已经**结算过了，投票阶段中途读它恒为空。
 *
 * 【三处共用一份，不许各写各的】发言流的投票卡、票型总表、终局复盘读的是同一批
 * 数据，而 `forced` 那个分支（变体强制通过、没有人投过票）写三遍必然漏一遍。
 */
import type { Messages } from "@/i18n/messages";
import type { AnyView, PlayerId } from "@/lib/game";

export interface VoteSeat {
  id: PlayerId;
  name: string;
  isSelf: boolean;
}

export interface VoteTally {
  /** 与 speech-feed-model 的分组 key 同源（`propose-${missionIndex}-${attempt}`） */
  key: string;
  missionIndex: number;
  attempt: number;
  leaderId: PlayerId;
  team: PlayerId[];
  approved: boolean;
  /** 变体 forcePassOnLastAttempt 触发的强制通过，此时没有任何人投过票 */
  forced: boolean;
  approveCount: number;
  rejectCount: number;
  /** 按座位号升序。forced 时两份名单都为空 */
  approvedBy: VoteSeat[];
  rejectedBy: VoteSeat[];
  /** 「否决」/「通过」 */
  outcomeLabel: string;
  /** 「3 赞成 / 4 反对」；forced 时是「未投票」那一句 */
  detailLabel: string;
}

export interface VoteMatrixCell {
  /** forced 那一行恒为 null——没有人投过票 */
  vote: "approve" | "reject" | null;
  /** 当时在队伍里。「他给一支自己不在的队投了赞成」是票型里信息量最大的一格 */
  onTeam: boolean;
  isLeader: boolean;
}

export interface VoteMatrixRow {
  key: string;
  /** 「1-2」= 第 1 轮第 2 次提议 */
  label: string;
  ariaLabel: string;
  leaderId: PlayerId;
  approved: boolean;
  forced: boolean;
  outcomeLabel: string;
  detailLabel: string;
  /** 与 seats 等长同序。组件靠这条对齐表头和格子，不做二次查找 */
  cells: VoteMatrixCell[];
}

export interface VoteMatrix {
  seats: VoteSeat[];
  rows: VoteMatrixRow[];
}

/** `propose-0-1`。speech-feed-model 的 groupOf 用的是同一个式子 */
function keyOf(missionIndex: number, attempt: number): string {
  return `propose-${missionIndex}-${attempt}`;
}

function seatOf(view: AnyView, id: PlayerId, msg: Messages): VoteSeat {
  const player = view.players.find((p) => p.id === id);
  return {
    id,
    name: player ? player.name : msg.seat.short(id),
    // 观战没有"自己"，selfId 恒为 null，这一档自然全 false
    isSelf: id === view.selfId,
  };
}

/**
 * 投了某一侧的座位，**按座位号升序**。
 *
 * 【为什么要这句排序，尽管它现在改不出症状】`votes` 是 `Record<PlayerId, boolean>`，
 * 整数键的枚举顺序由语言规范保证成升序，所以去掉 `.sort()` 今天一条测试也炸不了
 * （变异测试实测过）。它防的是**形状变了**的那一天：这个字段哪天换成 `Map`、
 * 或者键换成字符串，枚举顺序就变回插入顺序，也就是提交先后。
 *
 * 而提交先后不能出去。理由同 `legal.ts` 的 `getAwaitingPlayerIds`：
 * 「谁投了什么」是公开的，「谁先投的」不是。下面那条升序断言钉的是这个**契约**，
 * 不是这一行代码。
 */
function votersOf(
  view: AnyView,
  votes: Record<PlayerId, boolean>,
  approve: boolean,
  msg: Messages,
): VoteSeat[] {
  return Object.keys(votes)
    .map(Number)
    .filter((id) => votes[id] === approve)
    .sort((a, b) => a - b)
    .map((id) => seatOf(view, id, msg));
}

export function describeVotes(view: AnyView, msg: Messages): VoteTally[] {
  return view.proposalHistory.map((record) => {
    const approvedBy = votersOf(view, record.votes, true, msg);
    const rejectedBy = votersOf(view, record.votes, false, msg);

    return {
      key: keyOf(record.missionIndex, record.attempt),
      missionIndex: record.missionIndex,
      attempt: record.attempt,
      leaderId: record.leaderId,
      team: [...record.team],
      approved: record.approved,
      forced: record.forced,
      approveCount: approvedBy.length,
      rejectCount: rejectedBy.length,
      approvedBy,
      rejectedBy,
      outcomeLabel: record.approved ? msg.vote.approved : msg.vote.rejected,
      // forced 时渲染成「0 赞成 / 0 反对却通过了」是 bug，得说清没投过票
      detailLabel: record.forced
        ? msg.vote.forcedNote
        : msg.vote.tally(approvedBy.length, rejectedBy.length),
    };
  });
}

export function describeVoteMatrix(view: AnyView, msg: Messages): VoteMatrix {
  const seats: VoteSeat[] = view.players.map((p) => ({
    id: p.id,
    name: p.name,
    isSelf: p.id === view.selfId,
  }));

  const rows: VoteMatrixRow[] = view.proposalHistory.map((record) => {
    const team = new Set(record.team);
    const label = msg.vote.rowLabel(record.missionIndex + 1, record.attempt + 1);
    const outcomeLabel = record.approved ? msg.vote.approved : msg.vote.rejected;
    const detailLabel = record.forced
      ? msg.vote.forcedNote
      : msg.vote.tally(
          Object.values(record.votes).filter(Boolean).length,
          Object.values(record.votes).filter((v) => !v).length,
        );

    return {
      key: keyOf(record.missionIndex, record.attempt),
      label,
      ariaLabel: msg.vote.rowAria(label, outcomeLabel, detailLabel),
      leaderId: record.leaderId,
      approved: record.approved,
      forced: record.forced,
      outcomeLabel,
      detailLabel,
      cells: seats.map((seat) => ({
        vote: record.forced
          ? null
          : record.votes[seat.id] === undefined
            ? null
            : record.votes[seat.id]
              ? "approve"
              : "reject",
        onTeam: team.has(seat.id),
        isLeader: seat.id === record.leaderId,
      })),
    };
  });

  return { seats, rows };
}
