"use client";

/**
 * 主题切换。与 LocaleSwitcher 并排，形状也照抄它——只有两套主题，所以是一颗
 * 来回切的按钮，不是下拉菜单。
 *
 * 【按钮上画的是"切过去之后"的主题】深色时显示太阳，浅色时显示月亮。这与
 * LocaleSwitcher 上写目标语言是同一条约定：写当前状态的话，用户完全猜不出
 * 点了会发生什么。
 *
 * 【两个字形都渲染，由 CSS 藏掉一个】"现在是哪套主题"是纯客户端状态，让 JSX
 * 去读它，SSR 与客户端首帧就必然不一致。规则在 globals.css 末尾，文件那里
 * 写了完整理由。
 *
 * 【aria-label 是中性的「切换主题」，不是「切换到浅色」】同上：一个指向目标的
 * 标签就得依赖当前主题，于是水合问题原样回来。方向已经由按钮上的字形说明了，
 * 屏幕阅读器这边不必再赌一次。这是与 LocaleSwitcher 唯一不同的地方。
 */
import { useLayoutEffect } from "react";
import { useMessages } from "@/i18n/useMessages";
import {
  DEFAULT_THEME,
  STORAGE_KEY,
  THEME_ATTR,
  THEME_COLOR,
  isTheme,
  type Theme,
} from "./theme";

/** 当前主题的唯一真相是 <html> 上那个属性——脚本、CSS、这里读的都是它 */
function currentTheme(): Theme {
  const value = document.documentElement.getAttribute(THEME_ATTR);
  return isTheme(value) ? value : DEFAULT_THEME;
}

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute(THEME_ATTR, theme);
  // metadata 是 server component 的静态对象，读不到客户端状态（与 layout.tsx
  // 里 title 的处境完全一样），所以浏览器 chrome 的颜色只能在这里补
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLOR[theme]);
}

export function ThemeSwitcher() {
  const msg = useMessages();

  /**
   * 【为什么是 useLayoutEffect，而且必须存在】开发模式下 Strict Mode 会把组件
   * 重挂一次，而那一次 React 会把 <html> 重置成只剩 JSX 里声明过的属性——
   * <head> 里那段脚本设的 data-theme 会被抹掉，页面于是跳回深色。生产环境
   * 这里是 no-op。Next 16 的 preventing-flash-before-hydration 指南专门记了这条。
   *
   * 用 layout 而不是 effect：它跑在绘制之前，补属性的动作不会自己变成一帧闪烁。
   */
  useLayoutEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Safari 无痕模式下 localStorage 的读写都会抛。读不到就用 <html> 上现有的值
    }
    applyTheme(isTheme(saved) ? saved : currentTheme());
  }, []);

  const toggle = () => {
    const next: Theme = currentTheme() === "light" ? "dark" : "light";
    applyTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 存不上就是下次进来还得再切一次。不值得为它拦住这次交互
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={msg.app.toggleTheme}
      className="fixed right-16 top-3 z-50 min-h-11 min-w-11 rounded-lg border border-ink-line bg-ink-raised px-3 text-xs text-muted transition-colors hover:border-muted hover:text-vellum"
    >
      {/* U+FE0E 强制文本呈现——不加的话某些平台会把 ☀ 画成彩色 emoji */}
      <span aria-hidden data-theme-glyph="dark">
        {"\u2600\uFE0E"}
      </span>
      <span aria-hidden data-theme-glyph="light">
        {"\u263E\uFE0E"}
      </span>
    </button>
  );
}
