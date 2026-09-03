"use client";

/**
 * 轮到你时的操作面板。没轮到你就什么都不画。
 * 所有人类输入——组队、发言、投票、任务票、刺杀——都从右侧发言栏底部的这一处进入。
 *
 * 【面板不判断你能做什么，它只把 legalActions 画出来】推导在 action-panel-model.ts，
 * 那里解释了为什么这条线不能反过来。
 *
 * 【草稿按 turnKey 分家】提交时 store 先清 pendingTurn 再 resolve，理论上组件会
 * 卸载一次；但把"上一轮的发言不会漏进下一轮"寄托在 React 的调度顺序上不划算，
 * 显式给 key 便宜得多。
 */
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { useAtomValue, useSetAtom } from "jotai";
import type { GameAction, PlayerView } from "@/lib/game";
import { useMessages } from "@/i18n/useMessages";
import { toDisplaySeatNumber } from "@/lib/seat-number";
import { cn } from "@/lib/utils";
import { humanTurnAtom, submitActionAtom } from "@/store/game";
import { SeatGrid } from "./SeatGrid";
import { SEAT_TONE_CLASS } from "./SeatRing";
import {
  SPEECH_MAX_LENGTH,
  describeTurn,
  proposeAction,
  speakAction,
  turnKey,
  type ActionOption,
  type AssassinationForm,
  type MissionCardForm,
  type SeatChoice,
  type SpeechForm,
  type TeamForm,
  type VoteForm,
} from "./action-panel-model";
import { useAssassinationDraft } from "./AssassinationDraftContext";
import { describeStrike, strikeLabel } from "./assassination-model";
import { useTeamDraft } from "./TeamDraftContext";

type Submit = (action: GameAction) => void;

export function ActionPanel() {
  const turn = useAtomValue(humanTurnAtom);
  const msg = useMessages();
  const submit = useSetAtom(submitActionAtom);
  const ref = useRef<HTMLElement>(null);
  const key = turn ? turnKey(turn) : null;
  const form = turn ? describeTurn(turn, msg) : null;

  useRevealTurn(ref, key);

  if (!turn) return null;

  return (
    <section
      ref={ref}
      aria-live="polite"
      className={cn(
        "mt-8 w-full scroll-mb-6 rounded-xl border border-brass/60 bg-ink-raised p-5",
        "shadow-[0_0_0_1px_var(--panel-ring)]",
        "lg:mt-0 lg:max-h-[65dvh] lg:shrink-0 lg:overflow-y-auto lg:overscroll-contain",
        "xl:max-h-[55dvh]",
        "lg:scroll-mb-0 lg:rounded-none lg:border-x-0 lg:border-b-0 lg:bg-ink lg:p-4 lg:shadow-none",
      )}
    >
      <p className="font-display text-[10px] tracking-[var(--track-3)] text-brass">
        <span className="-mr-[var(--track-3)]">{msg.turn.heading}</span>
      </p>

      {form === null ? (
        // 引擎给了一手面板认不出来的棋。宁可说实话也不要白屏
        <p className="mt-3 text-sm leading-relaxed text-mordred">
          {msg.turn.unsupported(turn.kind)}
        </p>
      ) : (
        <>
          <h2 className="mt-2 font-display text-xl tracking-wide text-vellum lg:mt-1.5 lg:text-lg">
            {form.title}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted lg:mt-1 lg:text-xs">
            {form.hint}
          </p>

          <div className="mt-5 lg:mt-3">
            {form.kind === "TEAM_PROPOSAL" && (
              <TeamBody key={key} form={form} submit={submit} />
            )}
            {form.kind === "SPEECH" && (
              <SpeechBody key={key} form={form} submit={submit} />
            )}
            {form.kind === "VOTE" && <VoteBody key={key} form={form} submit={submit} />}
            {form.kind === "MISSION_CARD" && (
              <MissionCardBody key={key} form={form} submit={submit} />
            )}
            {form.kind === "ASSASSINATION" && (
              <AssassinationBody key={key} form={form} view={turn.view} submit={submit} />
            )}
          </div>
        </>
      )}
    </section>
  );
}

/** block: nearest 只在面板确实离开视野时滚动；桌面常驻栏因此不会带着正文跳。 */
function useRevealTurn(ref: React.RefObject<HTMLElement | null>, key: string | null) {
  const reduced = useReducedMotion() === true;

  useEffect(() => {
    if (!key) return;
    ref.current?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [key, reduced, ref]);
}

// ---------------------------------------------------------------------------
// 组队
// ---------------------------------------------------------------------------

function TeamBody({ form, submit }: { form: TeamForm; submit: Submit }) {
  const msg = useMessages();
  const teamDraft = useTeamDraft();
  const [statement, setStatement] = useState("");
  const team = teamDraft.selected;
  const full = teamDraft.full;
  const ready = team.length === form.teamSize;
  const selectedSeats = team
    .map((id) => form.candidates.find((candidate) => candidate.id === id))
    .filter((seat): seat is TeamForm["candidates"][number] => seat !== undefined);

  return (
    <div className="space-y-4">
      <div className="lg:hidden">
        <SeatGrid
          seats={form.candidates}
          selected={team}
          disabled={(id) => full && !team.includes(id)}
          onToggle={teamDraft.toggle}
        />
      </div>

      <div className="hidden lg:block">
        <p className="mb-2 text-xs text-muted">{msg.turn.pickOnTable}</p>
        {selectedSeats.length > 0 && (
          <SeatChips label={msg.turn.teamPreview} seats={selectedSeats} />
        )}
      </div>

      <p className="tabular text-xs text-muted">
        {msg.turn.picked(team.length, form.teamSize, full)}
      </p>

      <TextBox
        label={msg.turn.statementLabel}
        note={form.statementHint}
        value={statement}
        placeholder={form.placeholder}
        onChange={setStatement}
        onSubmit={() => ready && submit(proposeAction(form, team, statement))}
      />

      <PrimaryButton
        disabled={!ready}
        onClick={() => submit(proposeAction(form, team, statement))}
      >
        {ready ? msg.turn.submitTeam : msg.turn.needMore(form.teamSize - team.length)}
      </PrimaryButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 发言
// ---------------------------------------------------------------------------

function SpeechBody({ form, submit }: { form: SpeechForm; submit: Submit }) {
  const msg = useMessages();
  const [content, setContent] = useState("");
  const send = () => submit(speakAction(form, content));

  return (
    <div className="space-y-4">
      <TextBox
        value={content}
        placeholder={form.placeholder}
        onChange={setContent}
        onSubmit={send}
      />

      <div className="flex flex-wrap items-center gap-3">
        <PrimaryButton fullWidth={false} disabled={content.trim().length === 0} onClick={send}>
          {msg.turn.speechLabel}
        </PrimaryButton>
        {/* 空发言在引擎里是合法的，所以给一个明写的出口，
            而不是让玩家交一个空文本框去试 */}
        <button
          type="button"
          onClick={() => submit(speakAction(form, ""))}
          className="rounded-lg border border-ink-line min-h-11 px-4 py-2.5 text-sm text-muted transition-colors hover:border-muted hover:text-vellum"
        >
          {form.skipLabel}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 投票与任务票
// ---------------------------------------------------------------------------

function VoteBody({ form, submit }: { form: VoteForm; submit: Submit }) {
  const msg = useMessages();

  return (
    <div className="space-y-4">
      <SeatChips label={msg.turn.teamPreview} seats={form.team} />

      {form.warning && (
        <p role="alert" className="text-sm leading-relaxed text-mordred">
          {form.warning}
        </p>
      )}

      <OptionButtons options={form.options} submit={submit} />
    </div>
  );
}

function SeatChips({
  label,
  seats,
}: {
  label: string;
  seats: readonly SeatChoice[];
}) {
  const msg = useMessages();

  return (
    <div>
      <p className="mb-2 text-xs text-muted">{label}</p>
      <ul className="flex flex-wrap gap-2">
        {seats.map((seat) => (
          <li
            key={seat.id}
            aria-label={seat.label}
            className={cn(
              "tabular rounded-lg border px-3 py-1.5 text-sm ring-2 ring-brass",
              SEAT_TONE_CLASS[seat.tone],
            )}
          >
            {toDisplaySeatNumber(seat.id)}{" "}
            <span className="text-xs opacity-70">
              {seat.isSelf ? msg.seat.you : seat.name}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MissionCardBody({ form, submit }: { form: MissionCardForm; submit: Submit }) {
  return (
    <div className="space-y-4">
      <OptionButtons options={form.options} submit={submit} />
      {form.note && <p className="text-xs leading-relaxed text-muted">{form.note}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 刺杀
// ---------------------------------------------------------------------------

function AssassinationBody({
  form,
  view,
  submit,
}: {
  form: AssassinationForm;
  view: PlayerView;
  submit: Submit;
}) {
  const msg = useMessages();
  const draft = useAssassinationDraft();
  const [sent, setSent] = useState(false);

  const brief = describeStrike(form, view, msg);
  const target = brief.targets.find((t) => t.id === draft.selected[0]) ?? null;
  const selectedTargets = target ? [target] : [];

  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-ink-line px-3 py-2.5 text-xs leading-relaxed text-muted">
        {brief.hiddenAllyHint}
      </p>

      <div className="lg:hidden">
        <p className="mb-2 text-xs text-muted">{msg.strike.pickOne}</p>
        <SeatGrid
          seats={brief.targets}
          selected={draft.selected}
          onToggle={draft.toggle}
        />
      </div>

      <div className="hidden lg:block">
        <p className="mb-2 text-xs text-muted">{msg.strike.pickOnTable}</p>
        {selectedTargets.length > 0 && (
          <SeatChips label={msg.strike.targetPreview} seats={selectedTargets} />
        )}
      </div>

      {target?.risk && (
        <p role="alert" className="text-sm leading-relaxed text-mordred">
          {target.risk}
        </p>
      )}

      <PrimaryButton
        tone="danger"
        disabled={!target || sent}
        onClick={() => {
          if (!target) return;
          setSent(true);
          submit(target.action);
        }}
      >
        {strikeLabel(target, msg)}
      </PrimaryButton>
    </div>
  );
}

function OptionButtons({ options, submit }: { options: ActionOption[]; submit: Submit }) {
  const [sent, setSent] = useState(false);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {options.map((option) => (
        <button
          key={option.label}
          type="button"
          disabled={sent}
          onClick={() => {
            setSent(true);
            submit(option.action);
          }}
          className={cn(
            "rounded-lg border px-4 py-3 text-left transition-colors disabled:opacity-50",
            option.tone === "positive"
              ? "border-loyal/60 bg-loyal/10 hover:bg-loyal/20"
              : "border-mordred/60 bg-mordred/10 hover:bg-mordred/20",
          )}
        >
          <span
            className={cn(
              "font-display text-lg tracking-wide",
              option.tone === "positive" ? "text-loyal" : "text-mordred",
            )}
          >
            {option.label}
          </span>
          <span className="mt-0.5 block text-xs text-muted">{option.detail}</span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 小件
// ---------------------------------------------------------------------------

function TextBox({
  label,
  note,
  value,
  placeholder,
  onChange,
  onSubmit,
}: {
  label?: string;
  note?: string;
  value: string;
  placeholder: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div>
      {label && <p className="mb-2 text-xs text-muted">{label}</p>}
      <textarea
        rows={3}
        value={value}
        maxLength={SPEECH_MAX_LENGTH}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        // 手机上没有这个组合键，所以它只是快捷方式，不是唯一入口
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) onSubmit();
        }}
        className="w-full resize-y rounded-lg border border-ink-line bg-ink px-3 py-2.5 text-sm leading-relaxed text-vellum placeholder:text-muted/80"
      />
      <div className="mt-1.5 flex items-baseline justify-between gap-3">
        <p className="text-xs leading-relaxed text-muted">{note}</p>
        <p className="tabular shrink-0 text-xs text-muted">
          {value.length} / {SPEECH_MAX_LENGTH}
        </p>
      </div>
    </div>
  );
}

function PrimaryButton({
  disabled,
  fullWidth = true,
  tone = "brass",
  onClick,
  children,
}: {
  disabled?: boolean;
  fullWidth?: boolean;
  tone?: "brass" | "danger";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "whitespace-nowrap rounded-lg font-display text-base tracking-[var(--track-1)] transition-colors",
        fullWidth ? "w-full px-6 py-3" : "min-h-11 px-5 py-2.5",
        "disabled:cursor-not-allowed disabled:border disabled:border-ink-line disabled:bg-transparent disabled:text-muted",
        tone === "brass"
          ? "bg-brass text-on-brass hover:bg-brass/85"
          : "bg-mordred text-on-mordred hover:bg-mordred/85",
      )}
    >
      <span className="-mr-[var(--track-1)]">{children}</span>
    </button>
  );
}
