"use client";

/**
 * 组件读文案的唯一入口。
 *
 * 【为什么不做 Context / Provider】项目里一个 Jotai Provider 都没有，用的是默认 store。
 * localeAtom 因此是全局可读的 —— 组件用这个 hook，而 store/game.ts 那种非组件代码
 * 直接 `get(localeAtom)`。两边读的是同一个源，不存在"React 里一份、外面一份"。
 */
import { useAtomValue } from "jotai";
import { localeAtom } from "./locale-atom";
import { MESSAGES, type Messages } from "./messages";
import type { Locale } from "./locale";

export const useLocale = (): Locale => useAtomValue(localeAtom);

export const useMessages = (): Messages => MESSAGES[useAtomValue(localeAtom)];
