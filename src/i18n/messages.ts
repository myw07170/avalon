/**
 * 目录索引。需要"按 locale 取一份文案"的地方从这里拿。
 *
 * 【两份都静态 import，不做动态加载】两份加起来是几十 KB 的字符串，
 * 而换来的是切语言零延迟、零 loading 态、零 Suspense 边界。
 * 参考项目 wolfcha 的两份 JSON 各 110KB 都还是静态引的。
 */
import { en } from "./messages.en";
import { zh, type Messages } from "./messages.zh";
import { DEFAULT_LOCALE, type Locale } from "./locale";

export type { Messages };

export const MESSAGES: Record<Locale, Messages> = { zh, en };

/**
 * 【存在的意义是那个 `??`】`MESSAGES[locale]` 在类型上不可能是 undefined，
 * 但 locale 有从 localStorage / 请求体这类不可信来源来的路径。
 * 兜底到 DEFAULT_LOCALE 好过整屏 undefined。
 */
export const messagesFor = (locale: Locale): Messages =>
  MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
