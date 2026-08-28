/**
 * 文案目录的两道闸。
 *
 * 【`tsc` 已经保证了键对齐，这里为什么还要测】`en: Messages` 卡的是**结构**，
 * 卡不到值：一条 `(n) => \`Mission ${n} 轮\`` 在类型上完全合法，在键上也看不出问题，
 * 但它就是漏译。所以第二条测试要**真的把每个函数调一遍**，看返回的字符串里有没有汉字。
 *
 * 这两条加起来，让"新增一条文案时忘了翻"这件事从"上线后被用户发现"
 * 变成"typecheck 或 test 当场红"。
 */
import { describe, expect, it } from "vitest";
import { LOCALES } from "./locale";
import { MESSAGES } from "./messages";
import { en } from "./messages.en";
import { zh } from "./messages.zh";

/** CJK 统一表意文字 + 全角标点。够抓住任何一句漏掉的中文 */
const CJK = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/;

/**
 * 带参数的文案是函数。挨个试这几组实参，第一组不抛的就用它的返回值。
 *
 * 【那个大对象是 configIssue / actionProblem 用的】它们吃的是结构化参数
 * （`{ role, min, max, n }` 这类），数字和字符串都喂不进去。字段给全一点，
 * 免得某条文案取到 undefined 之后正好绕开了模板里的汉字。
 */
const PARAM_PROBE = {
  got: "PROPOSE_TEAM",
  allowed: ["PROPOSE_TEAM", "SPEAK"],
  seat: 3,
  need: 3,
  n: 2,
  min: 1,
  max: 2,
  playerCount: 7,
  roleCount: 7,
  good: 4,
  evil: 3,
  expectedGood: 4,
  expectedEvil: 3,
  recommended: 9,
  role: "MERLIN",
};

const PROBES: readonly unknown[] = [3, "Probe", ["Probe", "Probe"], PARAM_PROBE];

/** PROBES 的 arity 次笛卡尔积。arity 上限 4 —— 再多说明这条文案该拆了 */
function argCombinations(arity: number): unknown[][] {
  if (arity <= 0) return [[]];
  if (arity > 4) return [Array.from({ length: arity }, () => PROBES[0])];
  return argCombinations(arity - 1).flatMap((rest) =>
    PROBES.map((probe) => [...rest, probe]),
  );
}

/**
 * 把一个叶子渲染成字符串。函数调不通时返回 null——
 * 那不是漏译，是这份探针够不着的形状，单独报出来让人加探针。
 *
 * 【所有跑得通的组合都串起来，不是取第一个】文案里有三元分支
 * （`p.min === p.max ? 单数句 : 区间句`）。只取第一个能跑通的结果，
 * 另一支就永远没被看过——而漏译完全可能只在那一支里。
 */
function renderLeaf(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value !== "function") return String(value);

  const outs: string[] = [];
  for (const args of argCombinations((value as { length: number }).length)) {
    try {
      const out = (value as (...a: unknown[]) => unknown)(...args);
      if (typeof out === "string") outs.push(out);
    } catch {
      // 这组探针形状不对，换一组
    }
  }
  return outs.length > 0 ? outs.join(" ⏐ ") : null;
}

function walkLeaves(
  node: unknown,
  visit: (path: string, value: unknown) => void,
  path = "",
): void {
  if (node !== null && typeof node === "object" && !Array.isArray(node)) {
    for (const [key, child] of Object.entries(node)) {
      walkLeaves(child, visit, path ? `${path}.${key}` : key);
    }
    return;
  }
  visit(path, node);
}

function pathsOf(catalog: unknown): string[] {
  const paths: string[] = [];
  walkLeaves(catalog, (path) => paths.push(path));
  return paths.sort();
}

describe("文案目录", () => {
  it("扫到的文案条数是合理的——遍历本身别悄悄扫空了", () => {
    // 这条防的是"walkLeaves 写错导致下面三条在空集合上全绿"。
    // 与 components/leak.test.ts 那条文件数哨兵同源
    expect(pathsOf(zh).length).toBeGreaterThan(4);
  });

  it("每个 Locale 都有一份目录", () => {
    expect(Object.keys(MESSAGES).sort()).toEqual([...LOCALES].sort());
  });

  it("zh 与 en 的键路径完全一致", () => {
    // 类型层已经卡过一遍。这一条防的是"某个值从字符串变成了对象"这类
    // 类型看得见、但 typeof zh 推导出来之后就分不清的形变
    expect(pathsOf(en)).toEqual(pathsOf(zh));
  });

  it("en 目录里一个汉字都没有——漏译的唯一症状", () => {
    const offenders: string[] = [];
    walkLeaves(en, (path, value) => {
      const text = renderLeaf(value);
      if (text !== null && CJK.test(text)) offenders.push(`${path} → ${text}`);
    });
    expect(offenders).toEqual([]);
  });

  it("每条文案都渲染得出来——探针够不着的形状要当场知道", () => {
    // 这条不是在测文案，是在测上面那条 CJK 断言没有因为"函数调不通"而空过
    const unrenderable: string[] = [];
    for (const [locale, catalog] of Object.entries(MESSAGES)) {
      walkLeaves(catalog, (path, value) => {
        if (renderLeaf(value) === null) unrenderable.push(`${locale}.${path}`);
      });
    }
    expect(unrenderable).toEqual([]);
  });
});
