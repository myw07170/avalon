"use client";

/**
 * 全程可查的新手教程。
 *
 * 【不读当前对局】角色实验台吃的是 tutorial-model 造出的独立 PlayerView；
 * 真正对局的 store 一个 atom 都不在本文件里。教程因此可以在 idle / ready /
 * running / finished 四种状态下用同一套方式打开，也不会碰正在跑的循环。
 *
 * 【只把动效花在视角变化上】弹窗沿用已有的入场，流程页不做轮播飞入；角色切换
 * 时 SeatRing 自己的颜色过渡就是整套教程唯一的重动作。
 */
import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { Messages } from "@/i18n/messages";
import { useMessages } from "@/i18n/useMessages";
import { ROLE_TEAM, type Role } from "@/lib/game";
import { PREVIEW_AVATAR_SEED } from "@/lib/seat-avatar";
import { cn } from "@/lib/utils";
import { RoleKnowledge } from "./RoleKnowledge";
import { describeRole, type RoleBrief } from "./role-card-model";
import { buildTutorialRoleViews, TUTORIAL_ROLE_ORDER } from "./tutorial-model";

const STEP_KEYS = ["goal", "proposal", "mission", "roles"] as const;
const TUTORIAL_VIEWS = buildTutorialRoleViews();
const DEFAULT_ROLE: Role = "PERCIVAL";

type TutorialCopy = Messages["tutorial"];

export function TutorialModal() {
  const msg = useMessages();
  const copy = msg.tutorial;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<Role>(DEFAULT_ROLE);
  const stepHeading = useRef<HTMLHeadingElement>(null);

  const view = TUTORIAL_VIEWS[role];
  const brief = describeRole(view, msg);

  useEffect(() => {
    if (open) stepHeading.current?.focus();
  }, [open, step]);

  function changeOpen(next: boolean) {
    if (next) {
      setStep(0);
      setRole(DEFAULT_ROLE);
    }
    setOpen(next);
  }

  function goTo(next: number) {
    setStep(Math.max(0, Math.min(STEP_KEYS.length - 1, next)));
  }

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={copy.triggerAria}
          className="min-h-11 rounded-lg border border-ink-line bg-ink-raised px-3 text-xs text-muted transition-colors hover:border-muted hover:text-vellum"
        >
          {copy.trigger}
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="dialog-veil fixed inset-0 z-40 bg-scrim backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            "dialog-rise fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-4xl flex-col overflow-hidden",
            "rounded-2xl border border-ink-line bg-ink-raised shadow-2xl",
          )}
        >
          <header className="shrink-0 border-b border-ink-line px-5 pb-4 pt-5 sm:px-7 sm:pt-6">
            <div className="pr-12">
              <Dialog.Title className="-mr-[var(--track-1)] font-display text-2xl tracking-[var(--track-1)] text-vellum sm:text-3xl">
                {copy.title}
              </Dialog.Title>
              <Dialog.Description className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                {copy.description}
              </Dialog.Description>
            </div>

            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={copy.closeAria}
                className="absolute right-4 top-4 grid size-11 place-content-center rounded-lg border border-ink-line text-xl leading-none text-muted transition-colors hover:border-muted hover:text-vellum"
              >
                <span aria-hidden>×</span>
              </button>
            </Dialog.Close>

            <nav aria-label={copy.stepsLabel} className="mt-5">
              <ol className="grid grid-cols-4 gap-1.5">
                {STEP_KEYS.map((key, index) => {
                  const active = index === step;
                  const tab = copy.steps[key].tab;
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        aria-current={active ? "step" : undefined}
                        aria-label={copy.stepAria(index + 1, STEP_KEYS.length, tab)}
                        onClick={() => goTo(index)}
                        className={cn(
                          "flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border px-2 text-xs transition-colors",
                          active
                            ? "border-brass bg-brass/15 text-vellum"
                            : "border-transparent text-muted hover:border-ink-line hover:text-vellum",
                        )}
                      >
                        <span className="tabular text-[10px] text-brass">{index + 1}</span>
                        <span>{tab}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7 sm:py-8">
            {step === 0 && <GoalStep copy={copy.steps.goal} headingRef={stepHeading} />}
            {step === 1 && (
              <ProposalStep copy={copy.steps.proposal} headingRef={stepHeading} />
            )}
            {step === 2 && (
              <MissionStep copy={copy.steps.mission} headingRef={stepHeading} />
            )}
            {step === 3 && (
              <RolesStep
                copy={copy.steps.roles}
                headingRef={stepHeading}
                role={role}
                onRole={setRole}
                view={view}
                brief={brief}
              />
            )}
          </div>

          <footer className="flex shrink-0 items-center gap-3 border-t border-ink-line bg-ink px-5 py-3 sm:px-7">
            <span className="tabular mr-auto text-xs text-muted">
              {copy.progress(step + 1, STEP_KEYS.length)}
            </span>
            <button
              type="button"
              onClick={() => goTo(step - 1)}
              disabled={step === 0}
              className="min-h-11 rounded-lg border border-ink-line px-4 text-sm text-muted transition-colors hover:border-muted hover:text-vellum disabled:cursor-not-allowed disabled:opacity-35"
            >
              {copy.previous}
            </button>
            {step < STEP_KEYS.length - 1 ? (
              <button
                type="button"
                onClick={() => goTo(step + 1)}
                className="min-h-11 rounded-lg bg-brass px-5 text-sm text-on-brass transition-colors hover:bg-brass/85"
              >
                {copy.next}
              </button>
            ) : (
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="min-h-11 rounded-lg bg-brass px-5 text-sm text-on-brass transition-colors hover:bg-brass/85"
                >
                  {copy.finish}
                </button>
              </Dialog.Close>
            )}
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function StepIntro({
  eyebrow,
  title,
  intro,
  headingRef,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="font-display text-[10px] tracking-[var(--track-3)] text-brass">
        <span className="-mr-[var(--track-3)]">{eyebrow}</span>
      </p>
      <h2
        ref={headingRef}
        tabIndex={-1}
        // 这是给步骤切换做读屏播报与滚动定位的程序化焦点，不是可操作控件。
        // 全局的黄铜焦点框留给按钮；圈住整行标题反而会被误读成一颗大按钮。
        style={{ outline: "none" }}
        className="mt-3 font-display text-2xl leading-tight text-vellum sm:text-3xl"
      >
        {title}
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-muted">{intro}</p>
    </div>
  );
}

function GoalStep({
  copy,
  headingRef,
}: {
  copy: TutorialCopy["steps"]["goal"];
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <section>
      <StepIntro
        eyebrow={copy.eyebrow}
        title={copy.title}
        intro={copy.intro}
        headingRef={headingRef}
      />
      <div className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
        <article className="rounded-xl border border-loyal/45 bg-loyal/10 p-5">
          <p className="font-display text-sm tracking-[var(--track-2)] text-loyal">
            {copy.goodTitle}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-vellum">{copy.goodBody}</p>
        </article>
        <article className="rounded-xl border border-mordred/45 bg-mordred/10 p-5">
          <p className="font-display text-sm tracking-[var(--track-2)] text-mordred">
            {copy.evilTitle}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-vellum">{copy.evilBody}</p>
        </article>
      </div>
      <Callout>{copy.note}</Callout>
    </section>
  );
}

function ProposalStep({
  copy,
  headingRef,
}: {
  copy: TutorialCopy["steps"]["proposal"];
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const items = [
    { title: copy.leaderTitle, body: copy.leaderBody },
    { title: copy.discussTitle, body: copy.discussBody },
    { title: copy.voteTitle, body: copy.voteBody },
  ];

  return (
    <section>
      <StepIntro
        eyebrow={copy.eyebrow}
        title={copy.title}
        intro={copy.intro}
        headingRef={headingRef}
      />
      <ol className="mx-auto mt-8 grid max-w-3xl gap-3 sm:grid-cols-3">
        {items.map((item, index) => (
          <li key={item.title} className="rounded-xl border border-ink-line bg-ink p-5">
            <span className="tabular grid size-8 place-content-center rounded-full border border-brass text-xs text-brass">
              {index + 1}
            </span>
            <h4 className="mt-4 font-display text-base text-vellum">{item.title}</h4>
            <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
          </li>
        ))}
      </ol>
      <Callout>{copy.note}</Callout>
    </section>
  );
}

function MissionStep({
  copy,
  headingRef,
}: {
  copy: TutorialCopy["steps"]["mission"];
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <section>
      <StepIntro
        eyebrow={copy.eyebrow}
        title={copy.title}
        intro={copy.intro}
        headingRef={headingRef}
      />
      <div className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
        <article className="rounded-xl border border-loyal/45 bg-loyal/10 p-5">
          <p className="font-display text-sm text-loyal">{copy.goodTitle}</p>
          <p className="mt-3 text-sm leading-relaxed text-vellum">{copy.goodBody}</p>
        </article>
        <article className="rounded-xl border border-mordred/45 bg-mordred/10 p-5">
          <p className="font-display text-sm text-mordred">{copy.evilTitle}</p>
          <p className="mt-3 text-sm leading-relaxed text-vellum">{copy.evilBody}</p>
        </article>
      </div>
      <Callout>{copy.threshold}</Callout>
      <div className="mx-auto mt-4 max-w-3xl rounded-xl border border-mordred/45 bg-mordred/10 p-5">
        <h4 className="font-display text-base text-mordred">{copy.assassinationTitle}</h4>
        <p className="mt-2 text-sm leading-relaxed text-vellum">{copy.assassinationBody}</p>
      </div>
    </section>
  );
}

function RolesStep({
  copy,
  headingRef,
  role,
  onRole,
  view,
  brief,
}: {
  copy: TutorialCopy["steps"]["roles"];
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  role: Role;
  onRole: (role: Role) => void;
  view: (typeof TUTORIAL_VIEWS)[Role];
  brief: RoleBrief;
}) {
  const msg = useMessages();

  return (
    <section>
      <StepIntro
        eyebrow={copy.eyebrow}
        title={copy.title}
        intro={copy.intro}
        headingRef={headingRef}
      />

      <div
        role="radiogroup"
        aria-label={copy.pickerLabel}
        className="mx-auto mt-7 grid max-w-3xl grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {TUTORIAL_ROLE_ORDER.map((candidate) => {
          const selected = candidate === role;
          const team = ROLE_TEAM[candidate];
          return (
            <button
              key={candidate}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onRole(candidate)}
              className={cn(
                "min-h-11 rounded-lg border px-3 py-2 text-sm transition-colors",
                selected
                  ? "border-brass bg-brass/15 text-vellum"
                  : team === "GOOD"
                    ? "border-loyal/30 text-loyal hover:border-loyal/70"
                    : "border-mordred/30 text-mordred hover:border-mordred/70",
              )}
            >
              {msg.roles[candidate].label}
            </button>
          );
        })}
      </div>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="rounded-xl border border-ink-line bg-ink p-5 lg:sticky lg:top-0">
          <p
            className={cn(
              "font-display text-xs tracking-[var(--track-2)]",
              brief.team === "GOOD" ? "text-loyal" : "text-mordred",
            )}
          >
            {brief.teamLabel}
          </p>
          <h3 className="mt-3 font-display text-3xl text-vellum">{brief.label}</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted">{brief.ability}</p>
          <p className="mt-5 border-t border-ink-line pt-4 text-xs leading-relaxed text-muted">
            {copy.sampleNote}
          </p>
        </aside>

        <div className="min-w-0 rounded-xl border border-ink-line bg-ink px-4 py-5 sm:px-6">
          <RoleKnowledge
            view={view}
            brief={brief}
            avatarSeed={PREVIEW_AVATAR_SEED}
            showTableWhenEmpty
          />
        </div>
      </div>
    </section>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <p className="mx-auto mt-5 max-w-3xl rounded-xl border border-brass/45 bg-brass/10 px-4 py-3 text-sm leading-relaxed text-vellum">
      {children}
    </p>
  );
}
