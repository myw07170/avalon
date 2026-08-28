"use client";

/**
 * 不渲染任何东西，只负责把语言状态同步到 <html> 上。
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

  // 只跑一次：把上次选的语言取回来
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    document.documentElement.lang = HTML_LANG[locale];
    document.documentElement.dataset.locale = locale;
    // metadata 是 server component 的静态对象，没有 locale 信号可用（见 layout.tsx），
    // 精确标题只能在这里补
    document.title = MESSAGES[locale].app.title;
  }, [locale]);

  return null;
}
