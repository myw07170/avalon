import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
 * 而 AssassinationModal 底部那根 sticky 操作条要靠 `viewport-fit: "cover"`
 * 让 env(safe-area-inset-bottom) 有非零值——不然 iPhone 上那颗按钮压在
 * home indicator 底下点不着。
 *
 * **不设 maximumScale / userScalable**：禁掉双指缩放对视力不好的人是硬伤，
 * 而这一屏本来就没有会被误触放大的输入框。
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0e1418",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* overflow-x-hidden 是最后一道保险：任何一个组件算错宽度都不该让整页能横着拖 */}
      <body className="flex min-h-full flex-col overflow-x-hidden bg-ink font-sans text-vellum">
        {children}
      </body>
    </html>
  );
}
