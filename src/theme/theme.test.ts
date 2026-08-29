/**
 * 两套主题的对齐，用源码断言钉死——做法与 components/leak.test.ts 一样：
 * 读自己的 CSS，查的是**结构**，不是某一次渲染出来的颜色。
 *
 * 这三条查的全是"改错了不会报错、只会静默不生效"的那类事故。CSS 没有类型
 * 系统，漏一个变量、或者把 @theme 改回 @theme inline，构建照样绿、页面照样
 * 渲染，只是浅色主题从此是个摆设。除了在这里钉住，没有别的地方拦得住。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 【必须先剥注释】这个文件头顶和 globals.css 里都写着"绝对不能写成 @theme
 * inline"——那正是这条规矩被记下来的地方。不剥的话，把规矩写在注释里反而
 * 会让断言炸，于是下一个人的修法是删掉解释。leak.test.ts 踩过同一个坑，
 * 那里的原话是：**断言不该逼人删掉解释。**
 */
const CSS = readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

/** 取一个块的正文。`@theme {` / `html[data-theme="light"] {` 都只出现一次 */
function blockBody(header: string): string {
  const start = CSS.indexOf(header);
  expect(start, `找不到 ${header}`).toBeGreaterThanOrEqual(0);
  const open = CSS.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < CSS.length; i++) {
    if (CSS[i] === "{") depth++;
    else if (CSS[i] === "}" && --depth === 0) return CSS.slice(open + 1, i);
  }
  throw new Error(`${header} 的花括号没有闭合`);
}

/** 块里声明的 --color-* 名字。注释里出现的不算——它们没有跟着冒号 */
function colorTokens(body: string): string[] {
  // flatMap 而不是 map：noUncheckedIndexedAccess 下 m[1] 的类型带 undefined，
  // 而正则里那个分组必然匹配到——用 ! 断言等于把这条信息扔掉
  return [...body.matchAll(/(--color-[a-z0-9-]+)\s*:/g)]
    .flatMap((m) => (m[1] === undefined ? [] : [m[1]]))
    .sort();
}

describe("主题 token 的两套取值必须对齐", () => {
  it("@theme 不能写成 @theme inline", () => {
    // 加上 inline，Tailwind 会把字面值内联进每一条 utility
    // （.bg-ink{background-color:#0e1418} 而不是 var(--color-ink)），
    // 于是 html[data-theme="light"] 下的覆盖一点作用都没有。
    // 页面照常渲染，只是永远是深色——本次改动唯一一个不报错的失败模式。
    // 同一个机制也管着 html[data-locale="en"] 换 --font-display。
    expect(CSS).not.toMatch(/@theme\s+inline/);
    expect(CSS).toMatch(/@theme\s*\{/);
  });

  it("夹具本身别悄悄扫空了", () => {
    // 这条防的是"上面两个 indexOf 改坏了导致下面那条在空集合上全绿"
    expect(colorTokens(blockBody("@theme"))).not.toHaveLength(0);
  });

  it("深色声明的每一个颜色 token，浅色都给了一份", () => {
    // 漏一个的症状：浅色页面上某一处突然是深色，而且只在某个阶段才看得见。
    // 多一个的症状：浅色下有个 token 深色下根本没定义，utility 直接失效。
    // 两个方向都要拦，所以比的是集合相等而不是包含。
    expect(colorTokens(blockBody('html[data-theme="light"]'))).toEqual(
      colorTokens(blockBody("@theme")),
    );
  });
});
