"use client";

/**
 * 观战的开局屏。对应落座局的 RoleCard 那一档（runStatus === "ready"）。
 *
 * 【为什么观战也要留这一档】RoleCard 存在的理由（给翻牌动效留时间）在这里不适用，
 * 但另一条更硬：**remote 模式下一局是 60–116 次模型调用**，中途没有任何人类回合
 * 会把它停下来。挂载即开跑等于点进来就开始烧钱，必须有一个明确的「开始观战」。
 *
 * 顺带这一屏就把观战的规矩说清楚了：牌已经发完，但全部扣着，想看谁自己翻。
 */
import { useAtomValue, useSetAtom } from "jotai";
import { useMessages } from "@/i18n/useMessages";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/game";
import { errorAtom, restartGameAtom, runGameAtom, viewAtom } from "@/store/game";
import { IdentityDeck } from "./IdentityDeck";
import { tallyRoles } from "./setup-model";

export function SpectatorIntro() {
  const view = useAtomValue(viewAtom);
  const error = useAtomValue(errorAtom);
  const startRun = useSetAtom(runGameAtom);
  const reset = useSetAtom(restartGameAtom);
  const msg = useMessages();

  if (!view || view.selfId !== null) return null;

  // 【角色构成从 roleComposition 来，不从 view.roles 数】前者是开局公开信息
  // （rules.md §3.2，只有数量没有座位），后者带着座位——这一屏的全部克制就在这里
  const roles = Object.entries(view.roleComposition).flatMap(([role, count]) =>
    Array.from({ length: count }, () => role as Role),
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-6 px-4 py-8 sm:py-10">
      <header className="text-center">
        <h1 className="-mr-[var(--track-3)] font-display text-3xl tracking-[var(--track-3)] sm:text-4xl">
          {msg.spectator.introTitle}
        </h1>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
          {msg.spectator.introNote}
        </p>
      </header>

      <ul className="flex flex-wrap justify-center gap-2">
        {tallyRoles(roles).map((entry) => (
          <li
            key={entry.role}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              entry.team === "GOOD"
                ? "border-loyal-line text-loyal"
                : "border-mordred-line text-mordred",
            )}
          >
            {msg.roles[entry.role].label}
            {entry.count > 1 && <span className="tabular"> ×{entry.count}</span>}
          </li>
        ))}
      </ul>

      <IdentityDeck />

      {error && (
        <p role="alert" className="max-w-md text-center text-sm text-mordred">
          {error}
        </p>
      )}

      <div className="flex w-full max-w-sm flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => startRun()}
          className="w-full rounded-lg ui-button-primary px-6 py-3.5 font-display text-lg tracking-[var(--track-3)] transition-colors"
        >
          <span className="-mr-[var(--track-3)]">{msg.spectator.start}</span>
        </button>
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-lg border border-ink-line bg-ink-raised min-h-11 px-6 py-2.5 text-sm text-muted transition-colors hover:border-muted hover:text-vellum"
        >
          {msg.shell.restart}
        </button>
      </div>
    </main>
  );
}
