"use client";

/**
 * 时间轴的三个零件：分组分隔线、发言气泡、组队投票卡。
 *
 * 【为什么抽出来】两处要画同一批东西——对局中的 `SpeechFeed`（直播，最新一条带
 * 打字机）和终局的复盘回放（静态，每条发言底下还挂着心证）。抄一份必然分叉：
 * 下次改投票卡的配色只会改到其中一处，而两边长得不一样这件事没有任何测试会报。
 *
 * 【纯展示，只吃 props】本文件不读任何 atom、不认识 `GameState`。
 * `leak.test.ts` 的三条源码断言因此一个字都不用改。
 *
 * 【打字机不在这里】那是"直播"独有的：复盘一进来就该是全文。`SpeechBubble`
 * 的 `content` 与 `entry.content` 分开传，正是为了让调用方决定显示到第几个字。
 */
import type { Messages } from "@/i18n/messages";
import { useMessages } from "@/i18n/useMessages";
import { toDisplaySeatNumber } from "@/lib/seat-number";
import { cn } from "@/lib/utils";
import type { FeedEntry } from "./speech-feed-model";
import type { VoteSeat, VoteTally } from "./vote-model";

export function GroupDivider({ label }: { label: string }) {
  return (
    <div className="mb-3 flex items-center gap-3 pt-1">
      <span className="h-px flex-1 bg-ink-line" />
      <span className="font-display text-[10px] tracking-[var(--track-2)] text-muted">
        {label}
      </span>
      <span className="h-px flex-1 bg-ink-line" />
    </div>
  );
}

/**
 * 一条发言。
 *
 * `content` 单独传：直播时它是打字机打到一半的前缀，复盘时它就是 `entry.content`。
 */
export function SpeechBubble({
  entry,
  content,
}: {
  entry: FeedEntry;
  content: string;
}) {
  const msg = useMessages();
  // 普通讨论不加标，队长的选人说明单独标出。
  const tag = entry.kind === "speech" ? undefined : msg.feed.kind[entry.kind];

  return (
    <div className="flex gap-3">
      <span
        aria-hidden
        className={cn(
          "tabular mt-0.5 grid size-7 shrink-0 place-content-center rounded-full border text-xs",
          entry.isSelf
            ? "border-brass bg-brass-soft text-vellum"
            : "border-ink-line text-muted",
        )}
      >
        {toDisplaySeatNumber(entry.playerId)}
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className={cn("text-xs", entry.isSelf ? "text-brass" : "text-muted")}>
            {msg.feed.speaker(entry.playerId, entry.isSelf ? msg.seat.you : entry.name)}
          </span>
          {tag && (
            <span className="rounded-sm border border-ink-line px-1.5 py-px text-[10px] text-muted">
              {tag}
            </span>
          )}
        </p>
        {entry.isSilent ? (
          // 引擎允许空发言，如实说"他没说话"，而不是留一个空气泡
          <p className="mt-1 text-sm italic leading-relaxed text-muted">
            {msg.feed.silent}
          </p>
        ) : (
          // 换行保留：模型偶尔会分段
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-vellum">
            {content}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * 一次组队投票的逐人票。
 *
 * 【它只会在结算之后出现】未结算的票根本进不了视角（见 vote-model.ts 文件头），
 * 所以这张卡的存在本身就意味着"全员已经投完了"。投票阶段进行中，圆桌上仍然
 * 只有「已投 3 / 10」这个数字。
 *
 * 【forced 那一次不画名单】变体强制通过时没有任何人投过票，画两行「无」会让人
 * 以为大家集体弃权。detailLabel 已经把原因说清楚了。
 */
export function VoteCard({ tally }: { tally: VoteTally }) {
  const msg = useMessages();

  return (
    <div
      role="group"
      aria-label={msg.vote.cardAria(
        tally.outcomeLabel,
        tally.detailLabel,
        seatSentence(tally.approvedBy, msg),
        seatSentence(tally.rejectedBy, msg),
      )}
      className={cn(
        "rounded-lg border border-l-2 border-ink-line bg-ink px-3 py-2.5",
        tally.approved ? "border-l-loyal" : "border-l-mordred",
      )}
    >
      <p aria-hidden className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-display text-[10px] tracking-[var(--track-2)] text-muted">
          {msg.vote.title}
        </span>
        <span className={cn("text-sm", tally.approved ? "text-loyal" : "text-mordred")}>
          {tally.outcomeLabel}
        </span>
        <span className="tabular text-xs text-muted">{tally.detailLabel}</span>
      </p>

      {!tally.forced && (
        <div aria-hidden className="mt-2 space-y-1.5">
          <VoteLine
            mark="✓"
            label={msg.vote.approveLabel}
            seats={tally.approvedBy}
            approve
          />
          <VoteLine mark="✗" label={msg.vote.rejectLabel} seats={tally.rejectedBy} />
        </div>
      )}
    </div>
  );
}

function VoteLine({
  mark,
  label,
  seats,
  approve = false,
}: {
  mark: string;
  label: string;
  seats: VoteSeat[];
  approve?: boolean;
}) {
  const msg = useMessages();

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className={cn("shrink-0 text-xs", approve ? "text-loyal" : "text-mordred")}>
        {mark} {label}
      </span>
      {seats.length === 0 ? (
        <span className="text-xs text-muted">{msg.vote.nobody}</span>
      ) : (
        seats.map((seat) => (
          <span
            key={seat.id}
            className={cn(
              "tabular grid size-5 place-content-center rounded-full border text-[11px]",
              approve
                ? "border-loyal-line bg-loyal-soft text-vellum"
                : "border-mordred-line bg-mordred-soft text-vellum",
              // 自己那一票跟圆桌用同一条视觉通道：黄铜 = 你
              seat.isSelf && "ring-1 ring-brass",
            )}
          >
            {toDisplaySeatNumber(seat.id)}
          </span>
        ))
      )}
    </p>
  );
}

/**
 * 读屏用：把一侧的名单念成一句话。数字圆圈对读屏是无意义的。
 *
 * 【自己那一座念「（你）」，不念 player.name】引擎给人类座位的 name 是硬写的中文
 * "你"（setup.ts），照念会让英文界面里冒出一个汉字。项目里每个渲染座位名的地方
 * 都做了这个替换，这里跟着做。
 */
function seatSentence(seats: VoteSeat[], msg: Messages): string {
  if (seats.length === 0) return msg.vote.nobody;
  return msg.turn.joinSeatParts(
    seats.map((seat) =>
      seat.isSelf
        ? msg.seat.withYou(msg.seat.short(seat.id))
        : msg.seat.named(seat.id, seat.name),
    ),
  );
}
