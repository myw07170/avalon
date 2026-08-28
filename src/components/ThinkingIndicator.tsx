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
import { useEffect, useState } from "react";
import { useMessages } from "@/i18n/useMessages";
import { viewAtom, thinkingAtom } from "@/store/game";

export function ThinkingIndicator() {
  const thinking = useAtomValue(thinkingAtom);
  const view = useAtomValue(viewAtom);
  const msg = useMessages();
  const seconds = useElapsedSeconds(thinking?.startedAt ?? null);

  if (!thinking) return null;

  const player = view?.players.find((p) => p.id === thinking.playerId);
  const who = player
    ? msg.seat.named(thinking.playerId, player.name)
    : msg.seat.short(thinking.playerId);

  return (
    <p
      role="status"
      aria-live="polite"
      className="tabular flex items-center gap-2 text-xs text-muted"
    >
      <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-brass" />
      {who} {msg.thinking.kind[thinking.kind]}…
      {/* 秒数只在等了一会儿之后才出现：mock 模式下每次都是 0 秒，闪一下反而像坏了 */}
      {seconds >= 3 && <span>{msg.thinking.seconds(seconds)}</span>}
    </p>
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
