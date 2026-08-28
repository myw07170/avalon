/**
 * prompt 语料的索引。
 *
 * 【为什么 prompt 不进 `src/i18n` 的目录】见 `prompt-copy.zh.ts` 的文件头，
 * 以及 docs/todos.md §6.3 —— 这是一条明确的"不照抄 wolfcha"。
 *
 * 【角色名是唯一跨过去的东西】`ROLE_TEXT` 在 `src/i18n/roles.ts`，UI 与这里共用。
 * 让玩家在身份卡上读到 "Merlin"、而 AI 嘴里说 "Merlyn"，是这套设计唯一真正
 * 需要防的分叉。
 */
import type { Locale } from "@/i18n/locale";
import { enPrompt } from "./prompt-copy.en";
import { zhPrompt, type PromptCopy } from "./prompt-copy.zh";

export type { PromptCopy, SectionKey } from "./prompt-copy.zh";

export const PROMPT_COPY: Record<Locale, PromptCopy> = {
  zh: zhPrompt,
  en: enPrompt,
};
