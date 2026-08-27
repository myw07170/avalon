/**
 * 组件层的信息隔离，用源码断言钉死。
 *
 * 【为什么不是"打开 DevTools 看一眼 props"】那只能证明"我看的那一刻没漏"。
 * 泄漏是结构问题：只要有一个组件够得着全知状态，它迟早会在某个分支上漏出来。
 * 所以这里查的是**能不能够得着**，而不是**这一次漏没漏**。
 *
 * 项目里已有两处同样的做法：remote.ts 不许 import client.ts、
 * orchestrator.ts 不许读 LLM_* 环境变量，都是靠读自己的源码钉住的。
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const COMPONENTS_DIR = new URL("./", import.meta.url);
const STORE = new URL("../store/game.ts", import.meta.url);

/**
 * 去掉注释。
 *
 * 【必须去】这些文件的注释里到处写着"不读 gameStateAtom"——那正是这条规矩
 * 被记下来的地方。不剥注释的话，把规矩写在注释里反而会让断言炸，
 * 于是下一个人的修法是删注释。**断言不该逼人删掉解释。**
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** components/ 下所有源码文件（已剥注释），测试自己不算 */
function sourceFiles(): Array<{ name: string; text: string }> {
  return readdirSync(COMPONENTS_DIR)
    .filter((name) => /\.tsx?$/.test(name) && !name.includes(".test."))
    .map((name) => ({
      name,
      text: stripComments(readFileSync(new URL(name, COMPONENTS_DIR), "utf8")),
    }));
}

describe("组件够不着全知状态", () => {
  it("扫到的文件数是合理的——夹具本身别悄悄扫空了", () => {
    // 这条防的是"glob 写错导致下面几条在空集合上全绿"
    expect(sourceFiles().length).toBeGreaterThan(10);
  });

  it("没有任何组件 import gameStateAtom", () => {
    // gameStateAtom 是全知视角，也是组件层唯一一扇能拿到他人 role 的门。
    // 需要的东西如果只在 GameState 上，正确做法是让 store 从 PlayerView 重推一份
    // 派生 atom（teamConstraintAtom 就是这么来的），而不是把全知状态漏到组件层
    const offenders = sourceFiles()
      .filter((file) => file.text.includes("gameStateAtom"))
      .map((file) => file.name);

    expect(offenders).toEqual([]);
  });

  it("没有任何组件认识 GameState 这个类型", () => {
    // atom 那道闸是运行期的，这一条是类型层的同一件事：一个组件只要能把某个值
    // 标注成 GameState，它就已经够得着全部 role 了。组件的类型词汇表里
    // 只该有 PlayerView。
    //
    // 【不查裸的 `.role`】SetupScreen 渲染的是**本局角色构成**（开局公开信息，
    // 只有数量没有座位），setup-model 的 tallyRoles 也一样。为它们开白名单
    // 只会把这条断言变成噪音，而 GameState 这一条既精确又堵死同一扇门
    const offenders = sourceFiles()
      .filter((file) => /\bGameState\b/.test(file.text))
      .map((file) => file.name);

    expect(offenders).toEqual([]);
  });
});

describe("store 的三个私有 atom 没有被导出", () => {
  const text = readFileSync(STORE, "utf8");

  /**
   * 三样东西各堵着一类 bug（store/game.ts 文件头列着）：
   * decisionsAtom 是 AI 心证，对局中读到即开天眼；
   * pendingTurnAtom 带着 promise 的 resolve，拿到就能绕过 validateHumanAction；
   * abortAtom 是中止句柄，组件不该能单方面掐断循环。
   */
  it.each(["decisionsAtom", "pendingTurnAtom", "abortAtom"])("%s 是私有的", (name) => {
    expect(text).toContain(`const ${name} = atom`);
    expect(text).not.toContain(`export const ${name}`);
  });

  it("能拿到 AI 心证的公开入口只有 reviewDecisionsAtom", () => {
    // 它自己带闸：view.reveal 为 null 时恒返回空数组
    expect(text).toContain("export const reviewDecisionsAtom");
    expect(text).toMatch(/reveal == null\) return EMPTY_DECISIONS/);
  });
});
