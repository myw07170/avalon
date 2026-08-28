/**
 * 角色文案表。
 *
 * 这组断言原来在 `lib/game/types.test.ts` 里（"每个角色都有非空的中文名和能力描述"），
 * 随 label / ability 一起从引擎搬过来。搬过来之后它多覆盖了一件事：
 * **每种语言都要有一份**，而不只是中文那份非空。
 */
import { describe, expect, it } from "vitest";
import { ROLE_META } from "@/lib/game/types";
import { LOCALES } from "./locale";
import { ROLE_TEXT } from "./roles";

describe("角色文案", () => {
  it("每种语言都有一份，且覆盖 ROLE_META 的同一组角色", () => {
    expect(Object.keys(ROLE_TEXT).sort()).toEqual([...LOCALES].sort());
    for (const locale of LOCALES) {
      expect(Object.keys(ROLE_TEXT[locale]).sort()).toEqual(
        Object.keys(ROLE_META).sort(),
      );
    }
  });

  it("名字和能力描述都非空——prompt 直接取用，空字符串会静默地毁掉一整段", () => {
    for (const locale of LOCALES) {
      for (const [role, text] of Object.entries(ROLE_TEXT[locale])) {
        expect(text.label.trim(), `${locale}.${role}.label`).not.toBe("");
        expect(text.ability.trim(), `${locale}.${role}.ability`).not.toBe("");
      }
    }
  });

  it("同一种语言里角色名互不相同", () => {
    // 两个角色重名的话，transcript.ts 的自曝检测和玩家的阅读都会当场糊掉，
    // 而这种错在类型上完全合法
    for (const locale of LOCALES) {
      const labels = Object.values(ROLE_TEXT[locale]).map((t) => t.label);
      expect(new Set(labels).size, `${locale} 有重名的角色`).toBe(labels.length);
    }
  });
});
