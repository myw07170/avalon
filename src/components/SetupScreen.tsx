"use client";

/**
 * 开局设置：人数、座位、坏人配置、模型开关。
 *
 * 【这里不做计算】所有推导都在 setup-model.ts 里，本文件只负责把
 * previewSetup 的返回值画出来。那些函数因此能用 .ts 测试覆盖，
 * 不必为一屏表单引入 jsdom。
 */
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useState } from "react";
import { useLocale, useMessages } from "@/i18n/useMessages";
import { MAX_PLAYERS, MIN_PLAYERS, type MissionConfig } from "@/lib/game";
import { GAME_CREDITS_CHANGED_EVENT } from "@/lib/credits/events";
import { isClientAuthRequired } from "@/lib/supabase/config";
import { cn } from "@/lib/utils";
import { assignPersonas } from "@/lib/persona-catalog";
import { createSeatAvatarSeed, PREVIEW_AVATAR_SEED } from "@/lib/seat-avatar";
import { aiModeAtom, createGameAtom, errorAtom, setRawErrorAtom } from "@/store/game";
import { SeatRing } from "./SeatRing";
import { PersonaLibrary } from "./PersonaLibrary";
import {
  aiSeatsOf,
  clearPersonaSelections,
  defaultDraft,
  finalizeConfig,
  previewSetup,
  tallyRoles,
  withEvilOption,
  withHumanSeat,
  withPersonaSelection,
  withPlayerCount,
  withRolePreference,
  withSeat,
  withSpectator,
  type SetupDraft,
} from "./setup-model";

const PLAYER_COUNTS = Array.from(
  { length: MAX_PLAYERS - MIN_PLAYERS + 1 },
  (_, i) => MIN_PLAYERS + i,
);

export function SetupScreen() {
  const [draft, setDraft] = useState<SetupDraft>(defaultDraft);
  const [starting, setStarting] = useState(false);
  const [aiMode, setAiMode] = useAtom(aiModeAtom);
  const createGame = useSetAtom(createGameAtom);
  const setRawError = useSetAtom(setRawErrorAtom);
  const storeError = useAtomValue(errorAtom);
  const msg = useMessages();
  // 开局时按界面语言解析同一组双语条目，之后随 Persona 一起锁进本局。
  const locale = useLocale();

  const preview = previewSetup(draft);
  const seated = draft.humanSeat !== null;
  const roleTallies = tallyRoles(preview.roles);

  /**
   * 开局。落座与观战走同一条路——差别只有 humanSeat 是不是 null，
   * 人设来自随代码发布的静态库；用户手选优先，其余座位用独立随机源补齐。
   * 它不推进引擎 RNG，所以选择人设不会改变同一 seed 下的发牌与首任队长。
   */
  async function start() {
    if (starting) return;

    // 【种子在点击时才取】放进 useState 初值会让 SSR 与 hydration 对不上。
    // 不显式传的话 createConfig 的缺省 seed 是 0，每一局发的牌完全一样。
    const config = finalizeConfig(draft, Date.now() >>> 0);
    // 头像 seed 与发牌 seed 完全独立。
    const avatarSeed = createSeatAvatarSeed();
    const humanSeat = draft.humanSeat;

    const personas = assignPersonas({
      playerCount: config.playerCount,
      humanSeat,
      selections: draft.personaSelections,
      locale,
      seed: config.seed,
    });

    setStarting(true);
    try {
      const gameSessionId =
        aiMode === "remote" && isClientAuthRequired
          ? await requestGameSession(msg.setup.startRemoteFailed)
          : null;
      createGame({
        config,
        avatarSeed,
        humanSeat,
        preferredHumanRole: humanSeat === null ? null : draft.rolePreference,
        personas,
        gameSessionId,
      });
    } catch (error) {
      setRawError(error instanceof Error ? error.message : msg.setup.startRemoteFailed);
    } finally {
      setStarting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-5 py-12 sm:px-8 sm:py-16">
      <header className="text-center">
        <h1 className="-mr-[var(--track-4)] font-display text-4xl tracking-[var(--track-4)] sm:text-5xl">
          {msg.app.title}
        </h1>
        <p className="mt-4 text-sm text-muted">{msg.app.tagline}</p>
      </header>

      <Field label={msg.setup.playerCount}>
        <div role="radiogroup" aria-label={msg.setup.playerCount} className="flex gap-2">
          {PLAYER_COUNTS.map((count) => (
            <Choice
              key={count}
              checked={count === draft.playerCount}
              onSelect={() => setDraft((d) => withPlayerCount(d, count))}
              className="tabular flex-1 py-2.5 text-base"
            >
              {count}
            </Choice>
          ))}
        </div>
      </Field>

      <RoundTable
        playerCount={draft.playerCount}
        humanSeat={draft.humanSeat}
        good={preview.split.good}
        evil={preview.split.evil}
        onSeat={(id) => setDraft((d) => withHumanSeat(d, id))}
        onToggleSpectate={() =>
          setDraft((d) => (d.humanSeat === null ? withSeat(d) : withSpectator(d)))
        }
      />

      <Field label={msg.setup.personaField}>
        <PersonaLibrary
          aiSeats={aiSeatsOf(draft)}
          selections={draft.personaSelections}
          onSelect={(seat, personaId) =>
            setDraft((current) => withPersonaSelection(current, seat, personaId))
          }
          onClearAll={() => setDraft(clearPersonaSelections)}
        />
      </Field>

      <Field label={msg.setup.freeEvilSlots(preview.freeEvilSlots)}>
        {preview.freeEvilSlots === 0 ? (
          // rules.md §3.2.1：5、6 人局没有任何可调空间，
          // 如实说明，不要渲染一个点了没反应的编辑器
          <p className="rounded-lg border border-ink-line bg-ink-raised px-4 py-3 text-sm text-muted">
            {msg.setup.fixedEvil}
          </p>
        ) : (
          <>
            <div
              role="radiogroup"
              aria-label={msg.setup.freeEvilAria}
              className="grid grid-cols-2 gap-2 sm:grid-cols-4"
            >
              {preview.evilOptions.map((option, index) => (
                <Choice
                  key={option.join("+")}
                  checked={index === draft.evilOptionIndex}
                  onSelect={() => setDraft((d) => withEvilOption(d, index))}
                  className="min-h-11 px-3 py-2.5 text-sm"
                >
                  {option.map((role) => msg.roles[role].label).join(" + ")}
                </Choice>
              ))}
            </div>
            <ul className="mt-3 space-y-1.5">
              {dedupe(preview.selectedEvil).map((role) => (
                <li key={role} className="text-xs leading-relaxed text-muted">
                  <span className="text-mordred">{msg.roles[role].label}</span>
                  {msg.gameOver.opinionLine("", msg.roles[role].ability)}
                </li>
              ))}
            </ul>
          </>
        )}
      </Field>

      <Field label={msg.setup.rolesField}>
        <ul className="flex flex-wrap gap-2">
          {roleTallies.map((entry) => (
            <li
              key={entry.role}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                entry.team === "GOOD"
                  ? "border-loyal/40 text-loyal"
                  : "border-mordred/40 text-mordred",
              )}
            >
              {msg.roles[entry.role].label}
              {entry.count > 1 && <span className="tabular"> ×{entry.count}</span>}
            </li>
          ))}
        </ul>
        {seated && (
          <div className="mt-5">
            <h3 className="mb-3 text-xs text-muted">{msg.setup.rolePreferenceField}</h3>
            <div
              role="radiogroup"
              aria-label={msg.setup.rolePreferenceField}
              className="grid grid-cols-2 gap-2 sm:grid-cols-4"
            >
              <Choice
                checked={draft.rolePreference === null}
                onSelect={() => setDraft((d) => withRolePreference(d, null))}
                className="min-h-11 px-3 py-2.5 text-sm"
              >
                {msg.setup.rolePreferenceRandom}
              </Choice>
              {roleTallies.map((entry) => (
                <Choice
                  key={entry.role}
                  checked={draft.rolePreference === entry.role}
                  onSelect={() => setDraft((d) => withRolePreference(d, entry.role))}
                  className="min-h-11 px-3 py-2.5 text-sm"
                >
                  {msg.roles[entry.role].label}
                </Choice>
              ))}
            </div>
          </div>
        )}
      </Field>

      <Field label={msg.setup.missionsField}>
        <MissionTable missions={preview.missions} />
      </Field>

      <Field label={msg.setup.modelField}>
        <div role="radiogroup" aria-label={msg.setup.modelField} className="flex gap-2">
          <Choice
            checked={aiMode === "mock"}
            onSelect={() => setAiMode("mock")}
            className="min-h-11 flex-1 py-2.5 text-sm"
          >
            mock
          </Choice>
          <Choice
            checked={aiMode === "remote"}
            onSelect={() => setAiMode("remote")}
            className="min-h-11 flex-1 py-2.5 text-sm"
          >
            remote
          </Choice>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          {msg.setup.modelNote}
        </p>
      </Field>

      <div className="flex flex-col gap-3">
        {preview.errors.map((issue) => (
          <Notice key={issue.code} tone="error">
            {msg.configIssue[issue.code](issue.params)}
          </Notice>
        ))}
        {preview.warnings.map((issue) => (
          <Notice key={issue.code} tone="warning">
            {msg.setup.balanceNote(msg.configIssue[issue.code](issue.params))}
          </Notice>
        ))}
        {/* 【观战不是错误，所以不用 error 那一档】它是一种正常的对局形态，
            红字会让人以为自己配错了什么 */}
        {!seated && <Notice tone="warning">{msg.setup.spectateHint}</Notice>}
        {!seated && aiMode === "remote" && (
          <Notice tone="warning">{msg.setup.spectateCostNote}</Notice>
        )}
        {storeError && <Notice tone="error">{storeError}</Notice>}

        <button
          type="button"
          onClick={start}
          disabled={!preview.canStart || starting}
          className={cn(
            "mt-1 w-full rounded-lg px-6 py-3.5 font-display text-lg tracking-[var(--track-3)] transition-colors",
            "bg-brass text-on-brass hover:bg-brass/85",
            "disabled:cursor-not-allowed disabled:bg-ink-raised disabled:text-muted",
          )}
        >
          <span className="-mr-[var(--track-3)]">
            {starting ? msg.setup.starting : seated ? msg.setup.submit : msg.setup.spectate}
          </span>
        </button>
      </div>
    </main>
  );
}

async function requestGameSession(fallbackMessage: string): Promise<string> {
  const response = await fetch("/api/game-sessions", { method: "POST" });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const detail =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : fallbackMessage;
    throw new Error(detail);
  }

  if (
    typeof body === "object" &&
    body !== null &&
    "gameSessionId" in body &&
    typeof body.gameSessionId === "string"
  ) {
    window.dispatchEvent(new Event(GAME_CREDITS_CHANGED_EVENT));
    return body.gameSessionId;
  }

  throw new Error(fallbackMessage);
}

// ---------------------------------------------------------------------------
// 圆桌
// ---------------------------------------------------------------------------

interface RoundTableProps {
  playerCount: number;
  humanSeat: number | null;
  good: number;
  evil: number;
  onSeat: (id: number) => void;
  onToggleSpectate: () => void;
}

/**
 * 选座器就是圆桌本身。环的画法在 SeatRing 里，与 RoleCard、SeatTable 共用；
 * 这里只负责把"我的座位"翻译成 self tone，再配一句说明。
 */
function RoundTable({
  playerCount,
  humanSeat,
  good,
  evil,
  onSeat,
  onToggleSpectate,
}: RoundTableProps) {
  const msg = useMessages();

  return (
    <div>
      <SeatRing
        count={playerCount}
        avatarSeed={PREVIEW_AVATAR_SEED}
        marks={humanSeat === null ? [] : [{ id: humanSeat, tone: "self" }]}
        onSelect={onSeat}
        seatLabel={(id, mark) =>
          mark.tone === "self" ? msg.setup.seatAriaSelf(id) : msg.setup.seatAria(id)
        }
        center={
          <>
            <p className="tabular text-sm text-loyal">{msg.setup.goodCount(good)}</p>
            <p className="tabular mt-1 text-sm text-mordred">
              {msg.setup.evilCount(evil)}
            </p>
          </>
        }
      />

      <p className="mt-4 text-center text-xs text-muted">
        {humanSeat === null
          ? msg.setup.seatHintIdle
          : msg.setup.seatHintSeated(humanSeat)}
      </p>

      {/* 【起身要有个说得出名字的按钮】「再点一次自己的座位」是既有行为，
          但只有点过的人才知道，而观战是一种对局形态，不该靠试出来 */}
      <div className="mt-3 flex justify-center">
        <button
          type="button"
          onClick={onToggleSpectate}
          className="rounded-lg border border-ink-line bg-ink-raised min-h-11 px-5 py-2 text-xs text-muted transition-colors hover:border-muted hover:text-vellum"
        >
          {humanSeat === null ? msg.setup.sitDown : msg.setup.standUp}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 任务表
// ---------------------------------------------------------------------------

function MissionTable({ missions }: { missions: MissionConfig[] }) {
  const msg = useMessages();
  const hasDoubleFail = missions.some((m) => m.failsRequired > 1);

  return (
    <div>
      <ol className="flex gap-2">
        {missions.map((mission, index) => (
          <li
            key={index}
            className="flex-1 rounded-lg border border-ink-line bg-ink-raised py-3 text-center"
          >
            <p className="text-[10px] tracking-widest text-muted">
              {msg.common.round(index + 1)}
            </p>
            <p className="tabular mt-1 text-xl">
              {mission.teamSize}
              {mission.failsRequired > 1 && (
                <span className="text-mordred" aria-hidden>
                  ✳
                </span>
              )}
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted">
        {msg.setup.missionsNote}
        {hasDoubleFail && ` ${msg.setup.doubleFailNote}`}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 小件
// ---------------------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 font-display text-xs tracking-[var(--track-3)] text-muted">{label}</h2>
      {children}
    </section>
  );
}

/**
 * 单选项。
 *
 * 用 role="radio" 而不是 aria-pressed：这几组都是互斥单选，
 * 读屏软件要能报出"3 选 2"，切换按钮报不出来。
 */
function Choice({
  checked,
  onSelect,
  className,
  children,
}: {
  checked: boolean;
  onSelect: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        "rounded-lg border transition-colors",
        checked
          ? "border-brass bg-brass/15 text-vellum"
          : "border-ink-line bg-ink-raised text-muted hover:border-muted hover:text-vellum",
        className,
      )}
    >
      {children}
    </button>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "error" | "warning";
  children: React.ReactNode;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : undefined}
      className={cn(
        "rounded-lg border px-4 py-3 text-sm leading-relaxed",
        tone === "error"
          ? "border-mordred/50 bg-mordred/10 text-mordred"
          : "border-brass/50 bg-brass/10 text-brass",
      )}
    >
      {children}
    </p>
  );
}

/** 「爪牙 + 爪牙」只需要说明一次 */
function dedupe<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}
