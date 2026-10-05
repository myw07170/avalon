"use client";

/**
 * 对局中的时间轴：发言逐字打出来，每次组队投票结算后在同组末尾落一张逐人票的卡。
 *
 * 【只给最新一条发言打字】更早的发言早就完整显示了。所以"上一条还没打完下一条就到了"
 * 这件事不需要额外处理——那一条不再是最新的，自然就整条显示出来。
 *
 * 【投票卡追在最后一条发言后面，打字机不受影响】它盯的是最后一条 **speech**，
 * 不是最后一个 item。卡片出现时 key 没变，那条发言会继续打完。
 *
 * 【三个零件在 TimelineItems.tsx】终局复盘画的是同一批东西，只是不打字、
 * 每条发言底下多挂一段心证。本文件只剩"直播"独有的那两样：打字机与自动滚动。
 * 桌面端它还承担整屏右栏：标题固定在上、消息占满中间、人类操作台固定在下。
 *
 * 推导在 speech-feed-model.ts 与 vote-model.ts。
 */
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { useAtomValue } from "jotai";
import { useMessages } from "@/i18n/useMessages";
import { viewAtom } from "@/store/game";
import { ActionPanel } from "./ActionPanel";
import { GroupDivider, SpeechBubble, VoteCard } from "./TimelineItems";
import { describeTimeline, typewriterStepMs } from "./speech-feed-model";

export function SpeechFeed({ enableActions = false }: { enableActions?: boolean }) {
  const view = useAtomValue(viewAtom);
  const msg = useMessages();
  const reduced = useReducedMotion() === true;
  const boxRef = useRef<HTMLDivElement>(null);

  const items = view ? describeTimeline(view, msg) : [];
  // 【要的是最后一条发言，不是最后一个 item】投票卡追在它后面之后，
  // 这个 key 不变，正在打的那一条会继续打完
  const last = items.findLast((item) => item.type === "speech")?.entry;

  // 自己敲的字不用再演一遍打给自己看
  const typed = useTypewriter(
    last?.seq ?? null,
    last?.content ?? "",
    reduced || last?.isSelf === true || last?.isSilent === true,
  );

  // 直接改容器的 scrollTop，不用 scrollIntoView——后者会把整页也带着跳。
  // items.length 也要盯着：投票卡出现时 last?.seq 不变，只靠它滚不到底
  useEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [last?.seq, typed, items.length]);

  if (!view) return null;

  return (
    <section className="w-full lg:flex lg:h-full lg:min-h-0 lg:flex-col">
      <header className="mb-3 lg:mb-0 lg:shrink-0 lg:border-b lg:border-ink-line lg:px-5 lg:pb-4 lg:pt-5">
        <h2 className="text-sm font-medium text-vellum">
          {msg.feed.title}
        </h2>
      </header>

      <div
        ref={boxRef}
        className={
          "max-h-[45dvh] overflow-y-auto rounded-lg border border-ink-line bg-ink-raised px-4 py-3 " +
          "lg:min-h-0 lg:max-h-none lg:flex-1 lg:rounded-none lg:border-0 lg:bg-ink-raised lg:px-5 lg:py-5"
        }
      >
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{msg.feed.empty}</p>
        ) : (
          <ol className="space-y-4">
            {items.map((item) => (
              <li key={item.key}>
                {item.groupLabel && <GroupDivider label={item.groupLabel} />}
                {item.type === "speech" ? (
                  <SpeechBubble
                    entry={item.entry}
                    content={item.entry.seq === last?.seq ? typed : item.entry.content}
                  />
                ) : (
                  <VoteCard tally={item.tally} />
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      {enableActions && <ActionPanel />}
    </section>
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
