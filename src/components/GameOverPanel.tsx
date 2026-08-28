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
import { useMemo } from "react";
import { myViewAtom, resetGameAtom, reviewDecisionsAtom } from "@/store/game";
import { useMessages } from "@/i18n/useMessages";
import { cn } from "@/lib/utils";
import { SeatRing } from "./SeatRing";
import { MissionTrack } from "./MissionTrack";
import {
  describeGameOver,
  type GameOverBrief,
  type ReplayRound,
  type RevealedMission,
  type StrikeOutcome,
  type TimingBrief,
} from "./game-over-model";

export function GameOverPanel() {
  const view = useAtomValue(myViewAtom);
  const decisions = useAtomValue(reviewDecisionsAtom);
  const reset = useSetAtom(resetGameAtom);
  const msg = useMessages();

  const brief = useMemo(
    () => describeGameOver(view, decisions, msg),
    [view, decisions, msg],
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-8 px-5 py-10 sm:py-14">
      {brief ? <Result brief={brief} /> : <NoReveal />}

      <button
        type="button"
        onClick={() => reset()}
        className="rounded-lg border border-ink-line bg-ink-raised min-h-11 px-6 py-2.5 text-sm text-muted transition-colors hover:border-muted hover:text-vellum"
      >
        {msg.gameOver.again}
      </button>
    </main>
  );
}

/** 观战局没有视角，也就没有 reveal。给一句话，不要白屏 */
function NoReveal() {
  const msg = useMessages();

  return (
    <>
      <p className="font-display text-xs tracking-[var(--track-3)] text-muted">
        {msg.gameOver.title}
      </p>
      <p className="max-w-md rounded-lg border border-ink-line bg-ink-raised px-4 py-3 text-center text-sm leading-relaxed text-muted">
        {msg.gameOver.noSeat}
      </p>
    </>
  );
}

function Result({ brief }: { brief: GameOverBrief }) {
  return (
    <>
      <Banner brief={brief} />

      {brief.strike && <Strike strike={brief.strike} />}

      <MissionTrack />

      <Identities brief={brief} />

      <Missions missions={brief.missions} />

      {brief.timing && <Timing timing={brief.timing} />}

      <Replay rounds={brief.replay} />
    </>
  );
}

// ---------------------------------------------------------------------------

function Banner({ brief }: { brief: GameOverBrief }) {
  const msg = useMessages();

  return (
    <header className="flex flex-col items-center gap-3 text-center">
      <p className="font-display text-xs tracking-[var(--track-3)] text-muted">
        {msg.gameOver.title}
      </p>

      <h1
        className={cn(
          "font-display text-3xl sm:text-4xl",
          brief.winner === "EVIL" ? "text-mordred" : "text-loyal",
        )}
      >
        {brief.winnerLabel}
      </h1>

      <p className="max-w-md text-sm leading-relaxed text-muted">{brief.reasonLabel}</p>

      <p className="text-sm text-vellum">
        {msg.gameOver.youAre(brief.yourRoleLabel)}
        <span className={brief.youWon ? "text-loyal" : "text-mordred"}>
          {brief.youWon ? msg.gameOver.youWon : msg.gameOver.youLost}
        </span>
      </p>
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
        "w-full max-w-md rounded-lg border px-5 py-4",
        strike.hit ? "border-mordred bg-mordred/10" : "border-loyal bg-loyal/10",
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

      {/* break-words：模型自由文本里可能有一长串不带空格的东西，不加会撑破 max-w-md */}
      {strike.opinions.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-ink-line pt-3">
          {strike.opinions.map((opinion, i) => (
            <li key={i} className="break-words text-xs leading-relaxed text-muted">
              <span className="tabular text-vellum">{opinion.label}</span>
              {msg.gameOver.opinionLine("", opinion.content)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Identities({ brief }: { brief: GameOverBrief }) {
  const msg = useMessages();

  return (
    <section className="w-full">
      <h2 className="text-center font-display text-sm tracking-[var(--track-1)] text-muted">
        {msg.gameOver.allRoles}
      </h2>

      <SeatRing
        count={brief.seats.length}
        marks={brief.seats.map((seat) => ({ id: seat.id, tone: seat.tone }))}
        seatLabel={(id) => {
          const seat = brief.seats.find((s) => s.id === id);
          return seat
            ? msg.gameOver.seatRole(seat.label, seat.roleLabel)
            : msg.seat.short(id);
        }}
      />

      <ul className="mx-auto flex max-w-md flex-wrap justify-center gap-2">
        {brief.seats.map((seat) => (
          <li
            key={seat.id}
            className={cn(
              "tabular flex items-baseline gap-1.5 rounded-lg border px-3 py-1.5 text-xs",
              seat.team === "EVIL"
                ? "border-mordred bg-mordred/20 text-vellum"
                : "border-loyal bg-loyal/15 text-vellum",
              seat.isSelf && "ring-1 ring-brass",
            )}
          >
            <span>{seat.id}</span>
            <span className="text-muted">{seat.roleLabel}</span>
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
    <section className="w-full max-w-md">
      <h2 className="font-display text-sm tracking-[var(--track-1)] text-muted">
        {msg.gameOver.failSourceTitle}
      </h2>

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
    <section className="w-full max-w-md">
      <h2 className="font-display text-sm tracking-[var(--track-1)] text-muted">
        {msg.gameOver.timingTitle}
      </h2>

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

/** AI 心证。对局中读到就是开天眼，所以它的闸在 store 的 reviewDecisionsAtom 上 */
function Replay({ rounds }: { rounds: ReplayRound[] }) {
  const msg = useMessages();

  if (rounds.length === 0) return null;

  return (
    <section className="w-full max-w-md">
      <h2 className="font-display text-sm tracking-[var(--track-1)] text-muted">
        {msg.gameOver.replayTitle}
      </h2>

      <div className="mt-3 space-y-4">
        {rounds.map((round) => (
          <details key={round.missionIndex} className="group">
            <summary className="tabular flex min-h-11 cursor-pointer list-none items-center rounded-lg border border-ink-line bg-ink-raised px-4 py-2 text-sm text-vellum transition-colors hover:border-muted">
              {round.label}
              <span className="pl-2 text-xs text-muted">
                {msg.gameOver.replayCount(round.entries.length)}
              </span>
            </summary>

            <ul className="mt-2 space-y-2 pl-1">
              {round.entries.map((entry, i) => (
                <li key={i} className="border-l border-ink-line pl-3 text-xs leading-relaxed">
                  <p className="tabular text-muted">
                    <span className="text-vellum">{entry.seatLabel}</span>
                    <span className="pl-2">{entry.kindLabel}</span>
                    {entry.latencyLabel && <span className="pl-2">{entry.latencyLabel}</span>}
                    {entry.flags.map((flag) => (
                      <span key={flag} className="pl-2 text-brass">
                        [{flag}]
                      </span>
                    ))}
                  </p>
                  <p className="break-words text-muted">{entry.reasoning}</p>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}
