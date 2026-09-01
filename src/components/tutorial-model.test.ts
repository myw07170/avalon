import { describe, expect, it } from "vitest";
import { zh } from "@/i18n/messages.zh";
import type { Role } from "@/lib/game";
import { describeRole } from "./role-card-model";
import { buildTutorialRoleViews, TUTORIAL_ROLE_ORDER } from "./tutorial-model";

describe("新手教程的示例视角", () => {
  const views = buildTutorialRoleViews();

  it("八个角色都有一份真实 PlayerView", () => {
    expect(Object.keys(views)).toEqual(TUTORIAL_ROLE_ORDER);

    for (const role of TUTORIAL_ROLE_ORDER) {
      expect(views[role].selfRole).toBe(role);
      expect(views[role].players).toHaveLength(10);
      expect(() => describeRole(views[role], zh)).not.toThrow();
    }
  });

  it("派西维尔看到的两座完全同权", () => {
    const unsure = describeRole(views.PERCIVAL, zh).marks.filter(
      (mark) => mark.tone === "unsure",
    );

    expect(unsure).toHaveLength(2);
    expect(new Set(unsure.map((mark) => mark.tone))).toEqual(new Set(["unsure"]));
  });

  it("梅林看得到奥伯伦，但看不到莫德雷德", () => {
    const evilIds = new Set(
      describeRole(views.MERLIN, zh).marks
        .filter((mark) => mark.tone === "evil")
        .map((mark) => mark.id),
    );

    expect(evilIds.has(views.OBERON.selfId)).toBe(true);
    expect(evilIds.has(views.MORDRED.selfId)).toBe(false);
  });

  it.each(["MORGANA", "ASSASSIN", "MORDRED"] as Role[])(
    "%s 认识普通坏人，但看不到奥伯伦",
    (role) => {
      const brief = describeRole(views[role], zh);
      const evilIds = new Set(
        brief.marks.filter((mark) => mark.tone === "evil").map((mark) => mark.id),
      );

      expect(evilIds.size).toBeGreaterThan(0);
      expect(evilIds.has(views.OBERON.selfId)).toBe(false);
    },
  );

  it("奥伯伦没有任何队友信息", () => {
    const brief = describeRole(views.OBERON, zh);

    expect(views.OBERON.knowledge).toEqual([]);
    expect(brief.hasKnownSeats).toBe(false);
    expect(brief.marks.filter((mark) => mark.tone === "evil")).toEqual([]);
  });

  it("第二桌补齐爪牙视角", () => {
    const brief = describeRole(views.MINION, zh);

    expect(brief.hasKnownSeats).toBe(true);
    expect(brief.marks.some((mark) => mark.tone === "evil")).toBe(true);
  });
});
