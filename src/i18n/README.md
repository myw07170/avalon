# src/i18n

UI 文案目录、语言状态、以及 UI 与 prompt 共用的角色名。

## 初始语言

SSR 与客户端首帧使用固定中文初值，挂载后优先恢复 `avalon.locale` 中的有效手动选择。
没有保存选择、值无效或存储不可用时，按 `navigator.languages` 的偏好顺序匹配中文或英文；
列表为空则使用 `navigator.language`。区域变体统一映射到 `zh` / `en`，均不匹配时使用英文。
自动检测不会写入存储，只有手动切换才保存。英文用户首次加载可能短暂看到中文。
界面语言、页面标题与 `<html lang>` / `data-locale` 一起更新；开局时锁定对局语言，恢复对局沿用存档语言。

## 唯一的硬规则：依赖只出不进

`src/i18n/` 只 import：

- `@/lib/game/types` 的**类型**：`Role` / `Phase` / `WinReason` 这类枚举当 `Record<K, string>` 的键，
  以及 `ConfigIssueCode`、`ActionProblem`、`EngineErrorCode` 这三个"某件事为什么不允许"的结构化答案
- `@/lib/ai/errors` 的 `AiErrorCode`（同上，只是错误分类的另一半）
- `jotai`（只在四个 `"use client"` 文件里）

**不 import** `@/store/*`、`@/components/*`、以及任何一层的运行期值。

理由不是洁癖：`lib/ai/prompt.ts`、`lib/game/config.ts`、`store/game.ts` 三层都要 import 这里。
只要这里反向依赖了其中任何一层，就是一个循环。上面那几个都是纯类型，
`import type` 在运行期不留任何东西。

## 引擎不产出人类语言

`ConfigIssue`、`ActionProblem`、`EngineError`、`AiError` 都只给 **code + 参数**，
句子在这里拼。这不是分层洁癖，是因为**同一条错误在切换语言时必须跟着变**——
存一句拼好的话，那句话就冻在写它时的语言上了。

例外是 `EngineError.message` 与 `AiError.message`：它们是拿内部状态拼的诊断
（"视角里没有自己的座位 99"、"缺少环境变量 LLM_PROVIDER"），**不翻译**，
只进 `console.error`。玩家看到的是按 code 写的一句人话。

## 为什么不在 `src/components/` 下

`components/leak.test.ts` 用 `readdirSync` 扫该目录下所有 `.tsx?`，
目录文件会挤进被扫集合和那条 `> 10 files` 的哨兵计数。
而且 `components/README.md` 开头写的是"组件的数据来源只有 store/game.ts 导出的那些 atom"——
一份文案目录根本没有数据源，不属于那份契约。

## 文件

| 文件 | 是什么 |
| --- | --- |
| `locale.ts` | `Locale` / `LOCALES` / `DEFAULT_LOCALE` / `HTML_LANG` / `STORAGE_KEY` / `isLocale` / `resolveBrowserLocale`。不依赖任何东西 |
| `plural.ts` | `plural(n, one, other)`。英文单复数，四行 |
| `roles.ts` | `ROLE_TEXT`。**UI 与 prompt 语料共用**，两边都 import 它 |
| `messages.zh.ts` | 中文目录，**母版**。`Messages` 类型从它推导 |
| `messages.en.ts` | 英文目录，声明成 `: Messages`——漏译是 tsc 错误 |
| `messages.ts` | `MESSAGES` / `messagesFor(locale)` |
| `locale-atom.ts` | `localeAtom` / `hydrateLocaleAtom` / `setLocaleAtom` |
| `useMessages.ts` | 组件读文案的入口 |
| `LocaleGate.tsx` | 水合 + 写 `<html lang>` / `data-locale`，渲染本地化 `<title>` |
| `LocaleSwitcher.tsx` | 右上角的切换按钮 |
| `catalog.test.ts` | 键对齐 + **en 目录里不许有汉字** |

## 怎么加一条文案

1. 加到 `messages.zh.ts`。带参数的写成函数，别写 `"第 {n} 轮"` 这种 ICU 字符串——
   函数的参数个数与类型有 `tsc` 检查，字符串里的占位符没有。
2. `pnpm typecheck` 会告诉你 `messages.en.ts` 少了什么。
3. `pnpm test` 会告诉你英文那条里还有没有汉字。

**不要给 `msg` 参数设默认值。** 默认值是静默回退：某个漏改的调用点会在英文模式下
安静地渲染中文，而没有任何东西会报错。
