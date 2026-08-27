"use client";

/**
 * 轮到你时的操作面板。没轮到你就什么都不画。
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
import type { GameAction } from "@/lib/game";
import { cn } from "@/lib/utils";
import { humanTurnAtom, submitActionAtom } from "@/store/game";
import { AssassinationModal } from "./AssassinationModal";
import { SeatGrid } from "./SeatGrid";
import { SEAT_TONE_CLASS } from "./SeatRing";
import {
  SPEECH_MAX_LENGTH,
  describeTurn,
  proposeAction,
  speakAction,
  turnKey,
  type ActionOption,
  type MissionCardForm,
  type SpeechForm,
  type TeamForm,
  type VoteForm,
} from "./action-panel-model";

type Submit = (action: GameAction) => void;

export function ActionPanel() {
  const turn = useAtomValue(humanTurnAtom);
  const submit = useSetAtom(submitActionAtom);
  const reduced = useReducedMotion() === true;
  const ref = useRef<HTMLElement>(null);
  const key = turn ? turnKey(turn) : null;

  // 发言流会把面板顶到屏幕外，手机上尤其明显。block: "nearest" 保证
  // 已经看得见时不动——真正的"滚一下"只发生在它确实在视野外的时候
  useEffect(() => {
    if (!key) return;
    ref.current?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [key, reduced]);

  if (!turn) return null;

  const form = describeTurn(turn);

  return (
    <section
      ref={ref}
      aria-live="polite"
      className="w-full scroll-mb-6 rounded-xl border border-brass/60 bg-ink-raised p-5 shadow-[0_0_0_1px_rgba(192,138,62,0.08)]"
    >
      <p className="font-display text-[10px] tracking-[0.3em] text-brass">
        <span className="-mr-[0.3em]">轮到你</span>
      </p>

      {form === null ? (
        // 引擎给了一手面板认不出来的棋。宁可说实话也不要白屏
        <p className="mt-3 text-sm leading-relaxed text-mordred">
          这一步（{turn.kind}）面板还画不出来。
        </p>
      ) : (
        <>
          <h2 className="mt-2 font-display text-xl tracking-wide text-vellum">
            {form.title}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{form.hint}</p>

          <div className="mt-5">
            {form.kind === "TEAM_PROPOSAL" && (
              <TeamBody key={key} form={form} submit={submit} />
            )}
            {(form.kind === "SPEECH" || form.kind === "ASSASSIN_OPINION") && (
              <SpeechBody key={key} form={form} submit={submit} />
            )}
            {form.kind === "VOTE" && <VoteBody key={key} form={form} submit={submit} />}
            {form.kind === "MISSION_CARD" && (
              <MissionCardBody key={key} form={form} submit={submit} />
            )}
            {/* 刺杀抢整个屏幕，理由见 AssassinationModal 的文件头 */}
            {form.kind === "ASSASSINATION" && (
              <AssassinationModal key={key} form={form} view={turn.view} submit={submit} />
            )}
          </div>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// 组队
// ---------------------------------------------------------------------------

function TeamBody({ form, submit }: { form: TeamForm; submit: Submit }) {
  const [team, setTeam] = useState<number[]>([]);
  const [statement, setStatement] = useState("");
  const full = team.length >= form.teamSize;
  const ready = team.length === form.teamSize;

  // 选满之后不再接受新的选择，而不是悄悄把最早那个挤掉——
  // 被挤掉的那个人玩家不会注意到，交上去才发现名单不对
  const toggle = (id: number) =>
    setTeam((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < form.teamSize ? [...prev, id] : prev,
    );

  return (
    <div className="space-y-4">
      <SeatGrid
        seats={form.candidates}
        selected={team}
        disabled={(id) => full && !team.includes(id)}
        onToggle={toggle}
      />

      <p className="tabular text-xs text-muted">
        已选 {team.length} / {form.teamSize}
        {full && "，要换人先取消一个"}
      </p>

      <TextBox
        label="选人说明"
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
        {ready ? "交名单" : `还差 ${form.teamSize - team.length} 个人`}
      </PrimaryButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 发言
// ---------------------------------------------------------------------------

function SpeechBody({ form, submit }: { form: SpeechForm; submit: Submit }) {
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
        <PrimaryButton disabled={content.trim().length === 0} onClick={send}>
          发言
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
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs text-muted">本次名单</p>
        <ul className="flex flex-wrap gap-2">
          {form.team.map((seat) => (
            <li
              key={seat.id}
              aria-label={seat.label}
              className={cn(
                "tabular rounded-lg border px-3 py-1.5 text-sm ring-2 ring-brass",
                SEAT_TONE_CLASS[seat.tone],
              )}
            >
              {seat.id} <span className="text-xs opacity-70">{seat.isSelf ? "你" : seat.name}</span>
            </li>
          ))}
        </ul>
      </div>

      {form.warning && (
        <p role="alert" className="text-sm leading-relaxed text-mordred">
          {form.warning}
        </p>
      )}

      <OptionButtons options={form.options} submit={submit} />
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
        className="w-full resize-y rounded-lg border border-ink-line bg-ink px-3 py-2.5 text-sm leading-relaxed text-vellum placeholder:text-muted/60"
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
  tone = "brass",
  onClick,
  children,
}: {
  disabled?: boolean;
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
        "w-full rounded-lg px-6 py-3 font-display text-base tracking-[0.2em] transition-colors",
        "disabled:cursor-not-allowed disabled:border disabled:border-ink-line disabled:bg-transparent disabled:text-muted",
        tone === "brass"
          ? "bg-brass text-ink hover:bg-brass/85"
          : "bg-mordred text-vellum hover:bg-mordred/85",
      )}
    >
      <span className="-mr-[0.2em]">{children}</span>
    </button>
  );
}
