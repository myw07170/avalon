import { describe, expect, it } from "vitest";
import { ROLE_META, ROLE_TEAM, createPending, type Role } from "./types";

/**
 * 阶段 0 的冒烟测试。
 *
 * 不是占位用的假测试：ROLE_TEAM 与 ROLE_META 是两张手写的表，
 * 加角色时漏改一张不会有任何编译错误，但会让 prompt 里的阵营和引擎判定对不上。
 * 这组断言把两张表钉在一起。
 */

const ALL_ROLES: Role[] = [
  "MERLIN",
  "PERCIVAL",
  "LOYAL_SERVANT",
  "MORGANA",
  "ASSASSIN",
  "MORDRED",
  "OBERON",
  "MINION",
];

describe("角色元数据", () => {
  it("ROLE_TEAM 与 ROLE_META 覆盖同一组角色", () => {
    expect(Object.keys(ROLE_TEAM).sort()).toEqual(Object.keys(ROLE_META).sort());
    expect(Object.keys(ROLE_TEAM).sort()).toEqual([...ALL_ROLES].sort());
  });

  it("两张表的阵营归属一致", () => {
    for (const role of ALL_ROLES) {
      expect(ROLE_META[role].team, `${role} 的阵营在两张表里不一致`).toBe(
        ROLE_TEAM[role],
      );
    }
  });

  it("好人 3 个、坏人 5 个，与 rules.md §3.1 的角色清单一致", () => {
    const good = ALL_ROLES.filter((r) => ROLE_TEAM[r] === "GOOD");
    const evil = ALL_ROLES.filter((r) => ROLE_TEAM[r] === "EVIL");
    expect(good).toEqual(["MERLIN", "PERCIVAL", "LOYAL_SERVANT"]);
    expect(evil).toEqual(["MORGANA", "ASSASSIN", "MORDRED", "OBERON", "MINION"]);
  });

  it("每个角色都有非空的中文名和能力描述，prompt 直接取用", () => {
    for (const role of ALL_ROLES) {
      expect(ROLE_META[role].label.length).toBeGreaterThan(0);
      expect(ROLE_META[role].ability.length).toBeGreaterThan(0);
    }
  });
});

describe("createPending", () => {
  it("每次返回全新对象，不共享引用", () => {
    const a = createPending();
    const b = createPending();
    expect(a).not.toBe(b);
    expect(a.votes).not.toBe(b.votes);
    expect(a.cards).not.toBe(b.cards);
  });

  it("初始状态是空的", () => {
    expect(createPending()).toEqual({
      acknowledged: [],
      votes: {},
      cards: [],
      speakingOrder: [],
      speakerIndex: 0,
      assassinOpinions: [],
    });
  });
});
