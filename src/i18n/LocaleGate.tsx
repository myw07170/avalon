"use client";

/**
 * 把语言状态同步到 <html> 上，并声明当前语言的页面标题。
 *
 * 【为什么这些事必须在 effect 里，不能在渲染里】layout.tsx 是 server component，
 * 它渲染的 `lang="zh-CN"` 就是 SSR 的输出。客户端首帧必须产出同一个值，否则水合报错。
 * effect 在 commit 之后跑，React 不会拿它和服务端的输出做 diff —— 所以在这里改
 * document.documentElement 是安全的，在渲染里改 JSX 的 lang 则不是。
 *
 * dataset.locale 是给 CSS 用的开关：globals.css 里 `html[data-locale="en"]`
 * 换掉 --font-display 与几个字距变量。字体和字距不该是每个组件各自判断的事。
 */
import { useEffect } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { hydrateLocaleAtom, localeAtom } from "./locale-atom";
import { HTML_LANG } from "./locale";
import { MESSAGES } from "./messages";

export function LocaleGate() {
  const locale = useAtomValue(localeAtom);
  const hydrate = useSetAtom(hydrateLocaleAtom);

  // 挂载后恢复手动选择；没有保存选择时检测浏览器语言
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    document.documentElement.lang = HTML_LANG[locale];
    document.documentElement.dataset.locale = locale;
  }, [locale]);

  // React 将 title 放进 head，SSR 和客户端更新都由同一组件管理。
  // 不与 Next 的静态 metadata.title 并存，避免水合时覆盖掉客户端语言标题。
  return <title>{MESSAGES[locale].app.title}</title>;
}
