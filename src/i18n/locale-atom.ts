"use client";

/**
 * 当前语言。
 *
 * 【手写而不是用 jotai/utils 的 atomWithStorage】那个 atom 的初值读取与 onMount
 * 相对 React 水合的时序是版本敏感的，而这里要的性质非常具体：**服务端与客户端
 * 首帧必须产出同一个值**。二十行显式代码换掉一个需要每次升级都重新验证的假设。
 *
 * 【localeAtom 的初值恒为 DEFAULT_LOCALE，不读 localStorage】localStorage 在
 * 服务端不存在。在初值里读它 = 首帧客户端与 SSR 不一致 = 控制台一片红 + 整棵树重渲染。
 * 上次的选择由 hydrateLocaleAtom 在 effect 里补上。
 *
 * 代价：en 用户刷新后会闪一帧中文。这是"纯客户端切换、不用 cookie / 不用 URL 前缀"
 * 这个决定的直接后果，不是 bug —— 唯一能消掉它的办法是把语言信息带到服务端，
 * 而那需要 cookie 或 URL 前缀，即被否掉的那套 middleware 机制。
 */
import { atom } from "jotai";
import { DEFAULT_LOCALE, STORAGE_KEY, isLocale, type Locale } from "./locale";

export const localeAtom = atom<Locale>(DEFAULT_LOCALE);

/** 从 localStorage 取回上次的选择。只由 LocaleGate 在 mount 后调一次 */
export const hydrateLocaleAtom = atom(null, (get, set) => {
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Safari 无痕模式下 localStorage 的读写都会抛。读不到就用默认语言，不该拦住渲染
  }
  if (isLocale(saved) && saved !== get(localeAtom)) set(localeAtom, saved);
});

export const setLocaleAtom = atom(null, (_get, set, next: Locale) => {
  set(localeAtom, next);
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // 存不上就是下次进来还得再选一次。不值得为它拦住这次交互
  }
});
