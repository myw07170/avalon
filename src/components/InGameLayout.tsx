import type { ReactNode } from "react";

/**
 * 进行中页面的共用骨架。
 *
 * 窄屏仍按「桌面信息 -> 发言 -> 操作」从上到下阅读；桌面端只改变视觉位置，
 * 把发言放进贴右的独立栏。三个 slot 而不是一大串 mode 判断，让落座局和观战局
 * 继续各自决定画什么，这一层只负责空间关系。
 */
export function InGameLayout({
  overview,
  conversation,
  controls,
}: {
  overview: ReactNode;
  conversation: ReactNode;
  controls: ReactNode;
}) {
  return (
    <main
      className={
        "mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-5 py-10 " +
        "sm:py-14 lg:mx-0 lg:grid lg:min-h-dvh lg:max-w-none " +
        "lg:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)] lg:grid-rows-[auto_1fr] " +
        "lg:items-start lg:gap-0 lg:px-0 lg:py-0"
      }
    >
      <div className="flex w-full flex-col items-center gap-8 lg:col-start-1 lg:row-start-1 lg:mx-auto lg:max-w-3xl lg:px-8 lg:pt-14">
        {overview}
      </div>

      <aside className="w-full lg:sticky lg:top-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-dvh lg:min-h-0 lg:self-start lg:border-l lg:border-ink-line lg:bg-ink-raised">
        {conversation}
      </aside>

      <div className="flex w-full flex-col items-center gap-8 lg:col-start-1 lg:row-start-2 lg:mx-auto lg:max-w-3xl lg:px-8 lg:pb-14 lg:pt-8">
        {controls}
      </div>
    </main>
  );
}
