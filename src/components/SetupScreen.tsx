"use client";

/**
 * 开局设置：人数、座位、坏人配置、模型开关。
 *
 * 【这里不做计算】所有推导都在 setup-model.ts 里，本文件只负责把
 * previewSetup 的返回值画出来。那些函数因此能用 .ts 测试覆盖，
 * 不必为一屏表单引入 jsdom。
 */
import { useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useLocale, useMessages } from "@/i18n/useMessages";
import { MAX_PLAYERS, MIN_PLAYERS, type MissionConfig } from "@/lib/game";
import { cn } from "@/lib/utils";
import { fetchPersonas } from "@/lib/ai/remote";
import { createSeatAvatarSeed, PREVIEW_AVATAR_SEED } from "@/lib/seat-avatar";
import { aiModeAtom, createGameAtom, errorAtom } from "@/store/game";
import { SeatRing } from "./SeatRing";
import {
  defaultDraft,
  finalizeConfig,
  previewSetup,
  tallyRoles,
  withEvilOption,
  withHumanSeat,
  withPlayerCount,
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
  const [aiMode, setAiMode] = useAtom(aiModeAtom);
  const createGame = useSetAtom(createGameAtom);
  const storeError = useAtomValue(errorAtom);
  const msg = useMessages();
  // 人设跟着**界面语言**生成：英文界面下的那桌人该有英文名字
  const locale = useLocale();

  const [busy, setBusy] = useState(false);

  const preview = previewSetup(draft);
  const seated = draft.humanSeat !== null;

  /**
   * 开局。落座与观战走同一条路——差别只有 humanSeat 是不是 null，
   * 而 aiSeatCount 早就把这件事算对了。remote 模式下先取一桌真人设，再建局。
   *
   * 【异步的只有这一步】createGameAtom 本身是同步的（createGame 是纯函数），
   * store 的注释写着"异步的只有人设生成，那一步在调用方"——就是这里。
   *
   * 【人设失败绝不拦着开局】拿不到就用占位继续，把原因带进 personaNotes 显示出来。
   * 人设是锦上添花，不是开局的必要条件（personas.ts 文件头）。
   */
  async function start() {
    // 【种子在点击时才取】放进 useState 初值会让 SSR 与 hydration 对不上。
    // 不显式传的话 createConfig 的缺省 seed 是 0，每一局发的牌完全一样。
    // 注意要在 await 之前取好：await 之后 draft 可能已经不是这一份了
    const config = finalizeConfig(draft, Date.now() >>> 0);
    // 与发牌 seed 完全独立；同样在 await 前锁住，避免人设请求期间换成另一套脸
    const avatarSeed = createSeatAvatarSeed();
    const humanSeat = draft.humanSeat;

    // mock 模式根本不碰 LLM，发这一趟就是白等
    if (aiMode !== "remote") {
      createGame({ config, avatarSeed, humanSeat });
      return;
    }

    const aiSeatCount = humanSeat === null ? config.playerCount : config.playerCount - 1;

    setBusy(true);
    try {
      const { personas, notes } = await fetchPersonas(aiSeatCount, locale);
      createGame({
        config,
        avatarSeed,
        humanSeat,
        // null 时不传，createGameAtom 自己回退 makePlaceholderPersonas
        ...(personas ? { personas } : {}),
        personaNotes: notes,
      });
    } finally {
      setBusy(false);
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
          {tallyRoles(preview.roles).map((entry) => (
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
          onClick={() => void start()}
          // busy 期间也要禁用：连点两次会发两趟人设请求，还会建两次局
          disabled={!preview.canStart || busy}
          aria-busy={busy}
          className={cn(
            "mt-1 w-full rounded-lg px-6 py-3.5 font-display text-lg tracking-[var(--track-3)] transition-colors",
            "bg-brass text-on-brass hover:bg-brass/85",
            "disabled:cursor-not-allowed disabled:bg-ink-raised disabled:text-muted",
          )}
        >
          <span className="-mr-[var(--track-3)]">
            {busy ? msg.setup.busy : seated ? msg.setup.submit : msg.setup.spectate}
          </span>
        </button>
      </div>
    </main>
  );
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
