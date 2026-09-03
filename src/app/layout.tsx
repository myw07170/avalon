import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DEFAULT_THEME, THEME_COLOR, THEME_INIT_SCRIPT } from "@/theme/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * 【双语字面量，不做 generateMetadata】generateMetadata 在服务端跑，而语言是
 * 纯客户端状态（localStorage），服务端没有任何信号能读到它。要造一个信号
 * 就得上 cookie 或 /en 前缀，也就是被明确否掉的那套 middleware 机制。
 *
 * 所以这里给一份两种语言都认得的标题；精确到当前语言的那份由
 * `src/i18n/LocaleGate.tsx` 在 effect 里写 `document.title`。
 */
export const metadata: Metadata = {
  title: "阿瓦隆 Avalon",
  description: "一个人，一桌会说话的 AI。 · One player, a table of talking AIs.",
};

/**
 * 【显式声明，不吃 Next 的默认值】默认只有 width/initial-scale，
 * 而 ActionPanel 在窄屏上会撑出滚动区域，`viewport-fit: "cover"` 让
 * env(safe-area-inset-bottom) 有非零值——不然 iPhone 上底部按钮压在
 * home indicator 底下点不着。
 *
 * **不设 maximumScale / userScalable**：禁掉双指缩放对视力不好的人是硬伤，
 * 而这一屏本来就没有会被误触放大的输入框。
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  /*
   * 【只给深色那一份，浅色由 ThemeSwitcher 在 effect 里改这条 meta】viewport 与
   * metadata 一样是 server component 的静态对象，读不到 localStorage 里的主题
   * （和 title 的处境完全一样，见上）。数组 + media 那种写法绑的是
   * prefers-color-scheme，而这里的主题是用户点出来的，不是系统给的。
   *
   * 晚一帧变的是浏览器自己那条状态栏，不是页面内容——不值得为它去动
   * Next 的 metadata 管线。页面本身的零闪烁由 <head> 里那段脚本负责。
   */
  themeColor: THEME_COLOR[DEFAULT_THEME],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    /*
     * 【lang 写死 zh-CN，由 LocaleGate 在 effect 里改】SSR 与客户端首帧必须
     * 产出同一个值，否则水合报错。effect 在 commit 之后跑，React 不会拿它
     * 和服务端的输出做 diff，所以在那里改 document.documentElement 是安全的。
     */
    <html
      lang="zh-CN"
      data-theme={DEFAULT_THEME}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/*
         * 【阻塞脚本，位置就得在这里】它在浏览器解析 HTML 时同步执行，早于首次
         * 绘制，所以浅色用户刷新时看不到任何一帧深色底。放进 effect 就晚了——
         * effect 跑在水合之后、绘制之后。语言那边接受了这一帧闪烁（换的是文字），
         * 整屏底色翻转不行。
         *
         * <html> 上的 suppressHydrationWarning 是配套的：这段脚本会在 React
         * 水合之前改掉 data-theme，不加的话 React 会把它当成不一致而报错。
         *
         * 脚本正文在 @/theme/theme，由 STORAGE_KEY 拼出来——不在这里手写字符串。
         */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      {/* overflow-x-hidden 是最后一道保险：任何一个组件算错宽度都不该让整页能横着拖 */}
      <body className="flex min-h-full flex-col overflow-x-hidden bg-ink font-sans text-vellum">
        {children}
      </body>
    </html>
  );
}
