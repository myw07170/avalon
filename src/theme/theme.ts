/**
 * 主题这一维的全部原语。照 `src/i18n/locale.ts` 的形状：整个 src/theme/ 里
 * 只有这个文件不依赖任何东西。
 *
 * 【不能加 "use client"】`app/layout.tsx` 是 server component，它要从这里
 * 取那段内联脚本。加了 "use client" 会让 layout 整个被拖下水。
 *
 * 【没有 jotai atom，这是刻意的】语言要换掉满屏的文字，所以必须是 React 状态；
 * 主题只换样式，而样式已经由 <html data-theme> + globals.css 全权处理了，
 * React 这一侧没有任何消费者。造一个只写不读的 atom 正是 docs/todos.md
 * 风险表里点名过四次的那个毛病。所以切换按钮就是直接读写 DOM 属性。
 */

export const THEMES = ["dark", "light"] as const;

export type Theme = (typeof THEMES)[number];

/**
 * 【默认恒为 light，且不做 prefers-color-scheme 探测】没有保存主题时始终
 * 使用浅色；有保存主题时在首次绘制前恢复。要改默认主题，只改这里这一处。
 */
export const DEFAULT_THEME: Theme = "light";

export const STORAGE_KEY = "avalon.theme";

/** `<html>` 上那个开关的属性名。globals.css 的选择器读的是同一个 */
export const THEME_ATTR = "data-theme";

export const isTheme = (value: unknown): value is Theme =>
  typeof value === "string" && (THEMES as readonly string[]).includes(value);

/** 浏览器 chrome 的颜色。两套主题各一个，与 globals.css 里的 --color-ink 同值 */
export const THEME_COLOR: Record<Theme, string> = {
  dark: "#0e1418",
  light: "#f3ede1",
};

/**
 * 放进 `<head>` 的阻塞脚本。**在浏览器解析 HTML 时同步执行，早于首次绘制**，
 * 所以浅色用户刷新时看不到任何一帧深色底。
 *
 * 【为什么不能像 LocaleGate 那样在 effect 里补】effect 跑在水合之后、绘制之后。
 * 语言那边接受了这一帧闪烁（换的是文字），主题这边不行：整屏底色从近黑翻成
 * 纸白，每次刷新闪一下是硬伤。做法出自 Next 16 的
 * `docs/01-app/02-guides/preventing-flash-before-hydration.md`。
 *
 * 【字符串从常量拼出来，不手写】key 与属性名在这里和运行期代码里各出现一次，
 * 手写就是两处能各自漂移。try/catch 兜的是 Safari 无痕模式——那里读
 * localStorage 会直接抛，不能让它拦住整页渲染。
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)});if(${JSON.stringify(
  THEMES,
)}.indexOf(t)>=0)document.documentElement.setAttribute(${JSON.stringify(
  THEME_ATTR,
)},t)}catch(e){}})()`;
