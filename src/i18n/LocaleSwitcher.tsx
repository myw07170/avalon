"use client";

/**
 * 语言切换。只有两种语言，所以是一个来回切的按钮而不是下拉菜单 ——
 * 下拉要多一层展开、一次点击、以及点击外部关闭和 Escape 的处理，
 * 换来的是在两个选项之间做选择。等有第三种语言时再换成菜单。
 *
 * 【按钮上写的是"切过去之后"的语言】写当前语言的话，中文用户看到"中"，
 * 完全猜不出点了会发生什么。写"EN"则是一个明确的承诺。
 */
import { useAtomValue, useSetAtom } from "jotai";
import { localeAtom, setLocaleAtom } from "./locale-atom";
import { MESSAGES } from "./messages";
import type { Locale } from "./locale";

export function LocaleSwitcher() {
  const locale = useAtomValue(localeAtom);
  const setLocale = useSetAtom(setLocaleAtom);
  const next: Locale = locale === "zh" ? "en" : "zh";

  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      aria-label={MESSAGES[next].app.switchTo}
      className="fixed right-3 top-3 z-50 min-h-11 min-w-11 rounded-lg border border-ink-line bg-ink-raised px-3 text-xs text-muted transition-colors hover:border-muted hover:text-vellum"
    >
      {MESSAGES[next].app.localeShort}
    </button>
  );
}
