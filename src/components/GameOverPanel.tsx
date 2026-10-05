"use client";

/**
 * 终局复盘。阶段 5 的最后一块。
 *
 * 【它读 revealAtom 与 reviewDecisionsAtom，仍然不读 gameStateAtom】
 * 两个 atom 都在 store 里加了闸：reveal 只有 GAME_OVER 才非空，
 * AI 心证在终局之前恒为空数组。所以"对局中不小心渲染出全身份"在结构上不可能发生。
 *
 * 【刺杀那一块是这个面板存在的第一理由】在它做出来之前，刺客点完那一刀就直接进
 * 占位屏，连自己刺中没刺中都看不到。
 */
import { useAtomValue, useSetAtom } from "jotai";
import { useId, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  errorAtom,
  viewAtom,
  restartGameAtom,
  reviewDecisionsAtom,
  seatAvatarSeedAtom,
} from "@/store/game";
import { useMessages } from "@/i18n/useMessages";
import { toDisplaySeatNumber } from "@/lib/seat-number";
import { cn } from "@/lib/utils";
import type { AnyView } from "@/lib/game";
import type { DecisionRecord } from "@/lib/ai/orchestrator";
import { SeatRing } from "./SeatRing";
import { SeatAvatar } from "./SeatAvatar";
import { RoleArtwork } from "./RoleArtwork";
import { describeReviewRounds, type ReviewRoundPanel } from "./review-round-model";
import { MissionTrack } from "./MissionTrack";
import { VoteMatrix } from "./VoteMatrix";
import { GroupDivider, SpeechBubble, VoteCard } from "./TimelineItems";
import {
  describeGameOver,
  type GameOverBrief,
  type ReplayEntry,
  type RevealedMission,
  type StrikeOutcome,
  type TimingBrief,
} from "./game-over-model";

export function GameOverPanel() {
  const view = useAtomValue(viewAtom);
  const avatarSeed = useAtomValue(seatAvatarSeedAtom);
  const decisions = useAtomValue(reviewDecisionsAtom);
  const error = useAtomValue(errorAtom);
  const reset = useSetAtom(restartGameAtom);
  const msg = useMessages();

  return (
    <GameOverReview
      view={view}
      decisions={decisions}
      avatarSeed={avatarSeed}
      footer={
        <>
          {error && (
            <p role="alert" className="max-w-md text-center text-sm text-mordred">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-lg border border-ink-line bg-ink-raised min-h-11 px-6 py-2.5 text-sm text-muted transition-colors hover:border-muted hover:text-vellum"
          >
            {msg.gameOver.again}
          </button>
        </>
      }
    />
  );
}

export function GameOverReview({
  view,
  decisions,
  avatarSeed,
  footer,
}: {
  view: AnyView | null;
  decisions: readonly DecisionRecord[];
  avatarSeed: number;
  footer?: React.ReactNode;
}) {
  const msg = useMessages();
  const brief = useMemo(
    () => describeGameOver(view, decisions, msg),
    [view, decisions, msg],
  );

  return (
    // 【比对局中那一屏宽】这一屏的主角是长自由文本——完整对话与心证。
    // 对局中的 GameShell 仍是 max-w-3xl，那边是圆桌和表单，不需要这个宽度
    <main className="mx-auto flex w-full max-w-7xl min-w-0 flex-1 flex-col items-center gap-5 px-4 py-6 sm:px-8 sm:py-8">
      {brief && view ? (
        <Result brief={brief} view={view} avatarSeed={avatarSeed} />
      ) : (
        <NoReveal />
      )}
      {footer}
    </main>
  );
}

/** 观战局没有视角，也就没有 reveal。给一句话，不要白屏 */
function NoReveal() {
  const msg = useMessages();

  return (
    <>
      <p className="text-xs font-medium tracking-[var(--track-1)] text-muted">
        {msg.gameOver.title}
      </p>
      <p className="max-w-md rounded-lg border border-ink-line bg-ink-raised px-4 py-3 text-center text-sm leading-relaxed text-muted">
        {msg.gameOver.noSeat}
      </p>
    </>
  );
}

function Result({ brief, view, avatarSeed }: { brief: GameOverBrief; view: AnyView; avatarSeed: number }) {
  const msg = useMessages();
  const rounds = useMemo(() => describeReviewRounds(brief, msg), [brief, msg]);
  const [selected, setSelected] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const round = rounds.find((entry) => entry.missionIndex === selected);
  const selectedPosition = selected === null ? 0 : rounds.findIndex((entry) => entry.missionIndex === selected) + 1;
  const tabs = [{ index: null, label: msg.ui.overview, mission: null }, ...rounds.map((entry) => ({ index: entry.missionIndex, label: entry.label, mission: entry.mission }))];

  function select(index: number | null) {
    setSelected(index);
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ block: "start", behavior: "instant" }));
  }

  return <div className="min-w-0 w-full space-y-5">
    <Banner brief={brief} />
    <div className="sticky top-[var(--app-header-height)] z-20 -mx-1 border-b border-ink-line bg-ink px-1 pb-2 pt-2">
      <div role="tablist" aria-label={msg.ui.rounds} className="flex gap-2 overflow-x-auto pb-1"
        onKeyDown={(event) => {
          const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
          const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
          let next = current;
          if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
          else if (event.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = tabs.length - 1;
          else return;
          event.preventDefault();
          const target = tabs[next];
          if (target) select(target.index);
          buttons[next]?.focus({ preventScroll: true });
          buttons[next]?.scrollIntoView({ block: "nearest", inline: "nearest" });
        }}>
        {tabs.map((tab, position) => <button key={tab.index ?? "overview"} id={`${id}-tab-${position}`} role="tab" type="button"
          aria-label={tab.label} aria-describedby={tab.mission ? `${id}-outcome-${position}` : undefined}
          aria-selected={selected === tab.index} aria-controls={`${id}-panel`} tabIndex={selected === tab.index ? 0 : -1}
          onClick={() => select(tab.index)}
          className={cn("flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-4 text-sm transition-colors",
            selected === tab.index ? "ui-selected border-brass-line bg-brass-soft text-brass" : "border-ink-line bg-ink-raised text-muted hover:text-vellum")}>
          {tab.label}
          {tab.mission && <><span aria-hidden className={cn("size-1.5 rounded-full", tab.mission.succeeded ? "bg-loyal" : "bg-mordred")} /><span id={`${id}-outcome-${position}`} className="sr-only">{tab.mission.detail}</span></>}
        </button>)}
      </div>
    </div>
    <div ref={panelRef} id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${selectedPosition}`} tabIndex={0}
      className="min-w-0 scroll-mt-[calc(var(--app-header-height)+5rem)] space-y-5">
      {round ? <RoundPanel key={round.missionIndex} round={round} /> : <>
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="ui-panel min-w-0 p-5 sm:p-6"><Identities brief={brief} avatarSeed={avatarSeed} /></div>
          <div className="min-w-0 space-y-5">
            {brief.strike && <Strike strike={brief.strike} />}
            <div className="ui-panel min-w-0 p-5"><MissionTrack view={view} /><div className="mt-5"><Missions missions={brief.missions} /></div></div>
          </div>
        </div>
        <div className="ui-panel min-w-0 p-5"><VoteMatrix matrix={brief.voteMatrix} /></div>
        {brief.timing && <details className="ui-panel p-5"><summary className="min-h-11 cursor-pointer text-sm font-medium">{msg.ui.advancedStats}</summary><div className="mt-3"><Timing timing={brief.timing} /></div></details>}
      </>}
    </div>
    {rounds.length > 0 && <div className="flex justify-between gap-3 border-t border-ink-line pt-4">
      <button type="button" className="ui-button" disabled={selectedPosition === 0} onClick={() => select(tabs[selectedPosition - 1]?.index ?? null)}><ChevronLeft className="size-4" aria-hidden />{msg.ui.previous}</button>
      <button type="button" className="ui-button" disabled={selectedPosition === tabs.length - 1} onClick={() => select(tabs[selectedPosition + 1]?.index ?? null)}>{msg.ui.next}<ChevronRight className="size-4" aria-hidden /></button>
    </div>}
  </div>;
}

function RoundPanel({ round }: { round: ReviewRoundPanel }) {
  const msg = useMessages();
  return <>
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <section className="ui-panel min-w-0 p-5">
        {round.mission ? <Missions missions={[round.mission]} /> : <><h2 className="ui-section-title">{round.label}</h2><p className="mt-3 text-sm text-muted">{msg.ui.noMission}</p></>}
      </section>
      {round.matrix.rows.length > 0 && <section className="ui-panel min-w-0 p-5"><VoteMatrix matrix={round.matrix} defaultOpen /></section>}
    </div>
    <Review round={round} />
  </>;
}

// ---------------------------------------------------------------------------

function Banner({ brief }: { brief: GameOverBrief }) {
  const msg = useMessages();

  return (
    <header className="ui-panel flex flex-col gap-2 border-t-2 border-t-brass p-5 sm:p-6">
      <p className="text-xs font-medium tracking-[var(--track-1)] text-muted">
        {msg.gameOver.title}
      </p>

      <h1
        className={cn(
          "font-display text-2xl sm:text-3xl",
          brief.winner === "EVIL" ? "text-mordred" : "text-loyal",
        )}
      >
        {brief.winnerLabel}
      </h1>

      <p className="max-w-md text-sm leading-relaxed text-muted">{brief.reasonLabel}</p>

      {/* 观战局没有"你"，这一行整块换成一句中立的说明——
          留着「你是 —— 你输了」比不显示更糟 */}
      {brief.yourRoleLabel === null || brief.youWon === null ? (
        <p className="text-sm text-muted">{msg.gameOver.spectated}</p>
      ) : (
        <p className="text-sm text-vellum">
          {msg.gameOver.youAre(brief.yourRoleLabel)}
          <span className={brief.youWon ? "text-loyal" : "text-mordred"}>
            {brief.youWon ? msg.gameOver.youWon : msg.gameOver.youLost}
          </span>
        </p>
      )}
    </header>
  );
}

/**
 * 整局唯一不可撤销的那一刀，结果单独占一块。
 *
 * 命中与落空用同一套结构，只换配色与那一句 headline——落空时"被刺的其实是谁"
 * 才是玩家真正在找的一行，所以它跟命中时一样显眼。
 */
function Strike({ strike }: { strike: StrikeOutcome }) {
  const msg = useMessages();

  return (
    <section
      className={cn(
        "w-full rounded-xl border px-5 py-4",
        strike.hit ? "border-mordred bg-mordred-soft" : "border-loyal bg-loyal-soft",
      )}
    >
      <h2 className="font-display text-sm tracking-[var(--track-1)] text-muted">
        {msg.gameOver.strikeTitle}
      </h2>

      <p className="mt-3 text-sm leading-relaxed text-vellum">
        {msg.gameOver.strikeLine(strike.assassinLabel, strike.targetLabel)}
        <strong className="px-1 font-normal text-brass">{strike.targetRoleLabel}</strong>—
        <strong
          className={cn("px-1 font-normal", strike.hit ? "text-mordred" : "text-loyal")}
        >
          {strike.headline}
        </strong>
        {msg.gameOver.period}
      </p>

      <p className="mt-1 text-sm text-muted">
        {strike.merlinLabel}
        {msg.gameOver.period}
      </p>

    </section>
  );
}

function Identities({ brief, avatarSeed }: { brief: GameOverBrief; avatarSeed: number }) {
  const msg = useMessages();

  return (
    <section className="w-full">
      <h2 className="ui-section-title mb-4">
        {msg.gameOver.allRoles}
      </h2>

      <div className="hidden sm:block"><SeatRing
        count={brief.seats.length}
        avatarSeed={avatarSeed}
        marks={brief.seats.map((seat) => ({ id: seat.id, tone: seat.tone }))}
        seatLabel={(id) => {
          const seat = brief.seats.find((s) => s.id === id);
          return seat
            ? msg.gameOver.seatRole(seat.label, seat.roleLabel)
            : msg.seat.short(id);
        }}
      /></div>

      <ul className="grid grid-cols-2 gap-2 sm:mt-4 sm:grid-cols-3">
        {brief.seats.map((seat) => (
          <li
            key={seat.id}
            aria-label={msg.gameOver.seatRole(seat.label, seat.roleLabel)}
            className={cn(
              "tabular flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2.5 text-xs",
              seat.team === "EVIL"
                ? "border-mordred bg-mordred-soft text-vellum"
                : "border-loyal bg-loyal-soft text-vellum",
              seat.isSelf && "ring-1 ring-brass",
            )}
          >
            {seat.role ? <RoleArtwork role={seat.role} className="h-10 w-8 shrink-0 rounded" />
              : <SeatAvatar seed={avatarSeed} id={seat.id} className="size-8 shrink-0" />}
            <span>{toDisplaySeatNumber(seat.id)}</span>
            <span className="min-w-0 break-words text-muted">{seat.roleLabel}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * 每轮的失败票来自谁。
 *
 * 【这是全项目唯一显示得出这件事的地方】PublicMissionRecord 刻意丢掉了 cards，
 * 所以对局中任何人（包括你）都只知道"几张失败票"，不知道是谁投的。
 */
function Missions({ missions }: { missions: RevealedMission[] }) {
  const msg = useMessages();

  return (
    <section className="w-full">
      <h2 className="font-display text-sm tracking-[var(--track-1)] text-muted">
        {msg.gameOver.failSourceTitle}
      </h2>
      {missions.length === 0 && <p className="mt-3 text-xs text-muted">{msg.ui.noMissions}</p>}

      <ul className="mt-3 space-y-2">
        {missions.map((mission) => (
          <li
            key={mission.index}
            className="rounded-lg border border-ink-line bg-ink-raised px-4 py-3"
          >
            <p className="flex items-baseline justify-between gap-3 text-sm">
              <span className="tabular text-vellum">{mission.label}</span>
              <span className={mission.succeeded ? "text-loyal" : "text-mordred"}>
                {mission.detail}
              </span>
            </p>

            <p className="tabular mt-1 text-xs leading-relaxed text-muted">
              {msg.gameOver.onTeam(mission.teamLabels)}
            </p>

            {mission.failedByLabels.length > 0 && (
              <p className="tabular mt-1 text-xs leading-relaxed text-mordred">
                {msg.gameOver.failedBy(mission.failedByLabels)}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * 每类决策等了多久。
 *
 * 【这张表是调 LLM_EXTRA_BODY / LLM_MAX_TOKENS 时唯一的依据】"感觉快了"不是依据。
 * 未调用模型的那些单独报一个数，混进平均值会把它算得虚低。
 */
function Timing({ timing }: { timing: TimingBrief }) {
  const msg = useMessages();
  const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

  return (
    <section className="w-full">
      <ul className="mt-3 divide-y divide-ink-line rounded-lg border border-ink-line bg-ink-raised">
        {timing.rows.map((row) => (
          <li
            key={row.kindLabel}
            className="tabular flex items-baseline justify-between gap-3 px-4 py-2 text-xs"
          >
            <span className="text-vellum">{row.kindLabel}</span>
            <span className="text-muted">
              {msg.gameOver.timingRow(row.count, seconds(row.avgMs), seconds(row.maxMs))}
            </span>
          </li>
        ))}
      </ul>

      <p className="tabular mt-2 text-xs leading-relaxed text-muted">
        {msg.gameOver.timingSummary(
          timing.askedCount,
          seconds(timing.totalMs),
          timing.autoCount,
        )}
      </p>
    </section>
  );
}

/** One round at a time; each row keeps the speech and its reasoning paired. */
function Review({ round }: { round: ReviewRoundPanel }) {
  const msg = useMessages();
  return <section className="min-w-0 w-full">
    <h2 className="ui-section-title">{round.label} · {msg.gameOver.reviewTitle}</h2>
    <p className="mt-1 text-xs leading-relaxed text-muted">{msg.ui.roundNote}</p>
    <div className="ui-panel mt-4 min-w-0 overflow-hidden">
      <div className="hidden grid-cols-2 gap-6 border-b border-ink-line px-5 py-3 text-xs font-medium text-muted md:grid">
        <span>{msg.ui.conversation}</span><span>{msg.ui.reasoning}</span>
      </div>
      {round.items.length === 0 ? <p className="p-5 text-sm text-muted">{msg.ui.noConversation}</p> : <ol className="divide-y divide-ink-line">
        {round.items.map((item) => <li key={item.key} className="p-4 sm:p-5">
          {item.groupLabel && <GroupDivider label={item.groupLabel} />}
          {item.type === "speech" ? <div className="grid min-w-0 gap-4 md:grid-cols-2 md:gap-6">
            <div className="min-w-0"><SpeechBubble entry={item.entry} content={item.entry.content} /></div>
            <div className="min-w-0 border-l-2 border-brass-line pl-4">
              <p className="mb-2 text-[11px] font-medium text-brass md:hidden">{msg.ui.reasoning}</p>
              {item.mind ? <MindBody entry={item.mind} hideSeat /> : <p className="text-xs text-muted">{msg.ui.noReasoning}</p>}
            </div>
          </div> : <VoteCard tally={item.tally} />}
        </li>)}
      </ol>}
    </div>
    {round.tail.length > 0 && <details className="ui-panel mt-4 p-4 sm:p-5">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm text-vellum">
        {msg.gameOver.tailTitle}<span className="tabular pl-2 text-muted">{msg.gameOver.tailCount(round.tail.length)}</span>
      </summary>
      <ul className="mt-4 grid gap-4 md:grid-cols-2">
        {round.tail.map((entry, index) => <li key={index} className="min-w-0 rounded-lg border border-ink-line bg-ink p-4"><MindBody entry={entry} /></li>)}
      </ul>
    </details>}
  </section>;
}

/** 心证正文那两行。挂在发言下面时不必再报一遍座位号 */
function MindBody({ entry, hideSeat = false }: { entry: ReplayEntry; hideSeat?: boolean }) {
  return (
    <div className="text-sm leading-7">
      <p className="tabular mb-1 text-[11px] leading-relaxed text-muted">
        {!hideSeat && <span className="text-vellum">{entry.seatLabel}</span>}
        <span className={hideSeat ? "" : "pl-2"}>{entry.kindLabel}</span>
        {entry.latencyLabel && <span className="pl-2">{entry.latencyLabel}</span>}
        {entry.flags.map((flag) => (
          <span key={flag} className="pl-2 text-brass">
            [{flag}]
          </span>
        ))}
      </p>
      <p className="whitespace-pre-wrap break-words text-vellum">{entry.reasoning}</p>
    </div>
  );
}
