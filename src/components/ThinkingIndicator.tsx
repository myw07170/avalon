"use client";

/**
 * 「3 号在想…（12 秒）」。
 *
 * 【为什么值得占一块屏】AI 等模型的时候界面一动不动，于是"15 秒"和"3 分钟"
 * 长得一模一样，玩家分不清是慢还是卡死了。这是对局中唯一能当场发现某次调用
 * 出问题的手段——秒数一直涨，说明该去看 .env.local 的 LLM_EXTRA_BODY 了。
 *
 * 【只读 thinkingAtom】那里面只有座位号和决策种类，没有任何 payload。
 * 把"他在想什么"显示出来就是开天眼，AI 心证的闸在 reviewDecisionsAtom 上。
 */
import { useAtomValue } from "jotai";
import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useMessages } from "@/i18n/useMessages";
import { viewAtom, thinkingAtom } from "@/store/game";
import { describeThinking } from "./thinking-indicator-model";

export function ThinkingIndicator() {
  const entries = useAtomValue(thinkingAtom);
  const view = useAtomValue(viewAtom);
  const msg = useMessages();
  const model = describeThinking(entries, view?.players ?? [], msg);
  const seconds = useElapsedSeconds(model?.startedAt ?? null);

  if (!model) return null;

  return (
    <section
      role="status"
      aria-live="polite"
      className={
        "w-full max-w-md rounded-lg border border-brass/60 bg-brass/10 px-4 py-3 " +
        "shadow-[0_0_0_1px_var(--panel-ring)]"
      }
    >
      <div className="flex items-start gap-3">
        <LoaderCircle
          aria-hidden
          className="mt-0.5 size-5 shrink-0 animate-spin text-brass"
        />
        <div className="min-w-0">
          <p className="tabular mt-1 text-sm leading-relaxed text-vellum">
            {model.line}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {msg.thinking.seconds(seconds)}
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * 已经等了几秒。startedAt 为 null 时不起计时器。
 *
 * 【记的是时刻不是计数】标签页切到后台时 setInterval 会被节流，自增会越走越慢，
 * 而这里报的必须是真实经过的时间。
 *
 * 【换人时的归零放在渲染期，不放 effect 里】放 effect 会先用上一位的秒数渲染一帧，
 * 看起来像跳了一下；也正好绕开 react-hooks/set-state-in-effect。
 * 与 SpeechFeed 打字机的归零是同一个做法。
 */
function useElapsedSeconds(startedAt: number | null): number {
  const [now, setNow] = useState(0);
  const [seen, setSeen] = useState(startedAt);

  if (seen !== startedAt) {
    setSeen(startedAt);
    setNow(startedAt ?? 0);
  }

  useEffect(() => {
    if (startedAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  if (startedAt === null) return 0;
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}
