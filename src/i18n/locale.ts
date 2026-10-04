/**
 * 语言这一维的全部原语。整个 src/i18n/ 里只有这个文件不依赖任何东西。
 *
 * 【为什么没有 middleware / URL 前缀 / cookie】参考项目 wolfcha 用的是
 * `middleware.ts` + `next.config.ts` 的 rewrites + 一个 `x-wolfcha-pathname`
 * 请求头，把 `/zh` 前缀在服务端还原出来。那套机制买到的是可分享的语言链接和
 * SEO 的 alternates —— 本项目只有 `/` 一个路由、是单机对局、不需要被搜到，
 * 这两样都用不上，而三个文件的耦合是实打实的。所以：纯客户端切换。
 */

export const LOCALES = ["zh", "en"] as const;

export type Locale = (typeof LOCALES)[number];

/**
 * SSR 与客户端首帧的固定初值。挂载后才恢复手动选择或检测浏览器语言，
 * 避免水合不一致；浏览器没有匹配语言时的回退值由 resolveBrowserLocale 决定。
 */
export const DEFAULT_LOCALE: Locale = "zh";

/** `<html lang>` 用的 BCP 47 标签。短码只用于存储与目录索引 */
export const HTML_LANG: Record<Locale, string> = {
  zh: "zh-CN",
  en: "en",
};

export const STORAGE_KEY = "avalon.locale";

export const isLocale = (value: unknown): value is Locale =>
  typeof value === "string" && (LOCALES as readonly string[]).includes(value);

/** 按浏览器偏好顺序匹配语言主标签；没有支持的语言时使用英文。 */
export function resolveBrowserLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const primary = language.trim().toLowerCase().split("-")[0];
    if (isLocale(primary)) return primary;
  }
  return "en";
}
