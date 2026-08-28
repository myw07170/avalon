"use client";

/**
 * 发言流，最新一条逐字打出来。
 *
 * 【只给最新一条打字】更早的发言早就完整显示了。所以"上一条还没打完下一条就到了"
 * 这件事不需要额外处理——那一条不再是最后一条，自然就整条显示出来。
 *
 * 推导在 speech-feed-model.ts，这里只管画和计时。
 */
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { useAtomValue } from "jotai";
import { useMessages } from "@/i18n/useMessages";
import { cn } from "@/lib/utils";
import { viewAtom } from "@/store/game";
import {
  describeFeed,
  typewriterStepMs,
  type FeedEntry,
} from "./speech-feed-model";

export function SpeechFeed() {
  const view = useAtomValue(viewAtom);
  const msg = useMessages();
  const reduced = useReducedMotion() === true;
  const boxRef = useRef<HTMLDivElement>(null);

  const entries = view ? describeFeed(view, msg) : [];
  const last = entries.at(-1);

  // 自己敲的字不用再演一遍打给自己看
  const typed = useTypewriter(
    last?.seq ?? null,
    last?.content ?? "",
    reduced || last?.isSelf === true || last?.isSilent === true,
  );

  // 直接改容器的 scrollTop，不用 scrollIntoView——后者会把整页也带着跳
  useEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [last?.seq, typed]);

  if (!view) return null;

  return (
    <section className="w-full">
      <h2 className="mb-3 font-display text-xs tracking-[var(--track-3)] text-muted">
        {msg.feed.title}
      </h2>

      <div
        ref={boxRef}
        className="max-h-[45dvh] overflow-y-auto rounded-lg border border-ink-line bg-ink-raised px-4 py-3"
      >
        {entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{msg.feed.empty}</p>
        ) : (
          <ol className="space-y-4">
            {entries.map((entry) => (
              <Bubble
                key={entry.seq}
                entry={entry}
                content={entry.seq === last?.seq ? typed : entry.content}
              />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function Bubble({ entry, content }: { entry: FeedEntry; content: string }) {
  const msg = useMessages();
  // 普通发言不加标：三种发言里只有选人说明和刺杀推测需要区分出来
  const tag = entry.kind === "speech" ? undefined : msg.feed.kind[entry.kind];

  return (
    <li>
      {entry.groupLabel && (
        <div className="mb-3 flex items-center gap-3 pt-1 first:pt-0">
          <span className="h-px flex-1 bg-ink-line" />
          <span className="font-display text-[10px] tracking-[var(--track-2)] text-muted">
            {entry.groupLabel}
          </span>
          <span className="h-px flex-1 bg-ink-line" />
        </div>
      )}

      <div className="flex gap-3">
        <span
          aria-hidden
          className={cn(
            "tabular mt-0.5 grid size-7 shrink-0 place-content-center rounded-full border text-xs",
            entry.isSelf
              ? "border-brass bg-brass/20 text-vellum"
              : "border-ink-line text-muted",
          )}
        >
          {entry.playerId}
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span
              className={cn("text-xs", entry.isSelf ? "text-brass" : "text-muted")}
            >
              {msg.feed.speaker(entry.playerId, entry.isSelf ? msg.seat.you : entry.name)}
            </span>
            {tag && (
              <span className="rounded-sm border border-ink-line px-1.5 py-px text-[10px] text-muted">
                {tag}
              </span>
            )}
          </p>
          {entry.isSilent ? (
            // 引擎允许空发言，如实说"他没说话"，而不是留一个空气泡
            <p className="mt-1 text-sm italic leading-relaxed text-muted">
              {msg.feed.silent}
            </p>
          ) : (
            // 换行保留：模型偶尔会分段
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-vellum">
              {content}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * 逐字显示 text。key 变了就重头打一遍。
 *
 * skip 为真时直接给全文：读屏与 prefers-reduced-motion 下不该有动画，
 * 自己敲的那条也不用演。
 */
function useTypewriter(key: number | null, text: string, skip: boolean): string {
  const [shown, setShown] = useState(() => (skip ? text : ""));
  const [prev, setPrev] = useState({ key, skip });

  // 【在渲染期归零，不放进 effect】新发言到达时必须立刻从头开始。
  // 放 effect 里会先拿上一条的文本渲染一帧，看起来像闪了一下别人的话。
  // 这是 React 官方的"prop 变了就调整 state"写法，也正好绕开
  // react-hooks/set-state-in-effect
  if (prev.key !== key || prev.skip !== skip) {
    setPrev({ key, skip });
    setShown(skip ? text : "");
  }

  useEffect(() => {
    if (key === null || skip) return;

    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(timer);
    }, typewriterStepMs(text.length));

    return () => clearInterval(timer);
  }, [key, text, skip]);

  return shown;
}
