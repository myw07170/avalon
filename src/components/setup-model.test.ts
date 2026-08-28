import { describe, expect, it } from "vitest";
import { createConfig, getEvilOptions, validateConfig } from "@/lib/game";
import {
  DEFAULT_PLAYER_COUNT,
  defaultDraft,
  finalizeConfig,
  presetOptionIndex,
  previewSetup,
  tallyRoles,
  withEvilOption,
  withHumanSeat,
  withSeat,
  withSpectator,
  withPlayerCount,
  type SetupDraft,
} from "./setup-model";

const COUNTS = [5, 6, 7, 8, 9, 10] as const;

describe("previewSetup", () => {
  it("5、6 人局没有自由位，且给的是空组合而不是空选项表", () => {
    for (const count of [5, 6]) {
      const preview = previewSetup(defaultDraft(count));
      expect(preview.freeEvilSlots).toBe(0);
      // getEvilOptions 返回 [[]]，长度是 1 不是 0——UI 靠 freeEvilSlots 判断
      expect(preview.evilOptions).toEqual([[]]);
      expect(preview.selectedEvil).toEqual([]);
      expect(preview.canStart).toBe(true);
    }
  });

  it("自由位数量与阵营分配对得上规则表", () => {
    const expected = {
      5: { slots: 0, good: 3, evil: 2 },
      6: { slots: 0, good: 4, evil: 2 },
      7: { slots: 1, good: 4, evil: 3 },
      8: { slots: 1, good: 5, evil: 3 },
      9: { slots: 1, good: 6, evil: 3 },
      10: { slots: 2, good: 6, evil: 4 },
    } as const;

    for (const count of COUNTS) {
      const preview = previewSetup(defaultDraft(count));
      expect(preview.freeEvilSlots).toBe(expected[count].slots);
      expect(preview.split).toEqual({
        good: expected[count].good,
        evil: expected[count].evil,
      });
      expect(preview.roles).toHaveLength(count);
      expect(preview.selectedEvil).toHaveLength(expected[count].slots);
    }
  });

  it("10 人局的选项是成对的，没有「只选莫德雷德」这种半配置", () => {
    const preview = previewSetup(defaultDraft(10));
    expect(preview.evilOptions).toEqual([
      ["MORDRED", "OBERON"],
      ["MORDRED", "MINION"],
      ["OBERON", "MINION"],
      ["MINION", "MINION"],
    ]);
    for (const option of preview.evilOptions) expect(option).toHaveLength(2);
  });

  it("每个人数的每一种选项都能开局", () => {
    for (const count of COUNTS) {
      getEvilOptions(count).forEach((_, index) => {
        const draft = withEvilOption(defaultDraft(count), index);
        const preview = previewSetup(draft);
        expect(preview.errors).toEqual([]);
        expect(preview.canStart).toBe(true);
      });
    }
  });

  it("任务表带上第四轮的双失败要求", () => {
    expect(previewSetup(defaultDraft(7)).missions.map((m) => m.teamSize)).toEqual([
      2, 3, 3, 4, 4,
    ]);
    expect(
      previewSetup(defaultDraft(7)).missions.map((m) => m.failsRequired),
    ).toEqual([1, 1, 1, 2, 1]);
    // 5 人局第四轮只要 1 张
    expect(
      previewSetup(defaultDraft(5)).missions.map((m) => m.failsRequired),
    ).toEqual([1, 1, 1, 1, 1]);
  });

  it("莫德雷德在 7 人局只给 warning，不拦开局", () => {
    const mordredIndex = getEvilOptions(7).findIndex((o) => o[0] === "MORDRED");
    const preview = previewSetup(withEvilOption(defaultDraft(7), mordredIndex));

    expect(preview.errors).toEqual([]);
    expect(preview.canStart).toBe(true);
    expect(preview.warnings).toHaveLength(1);
    expect(preview.warnings[0]?.code).toBe("BELOW_RECOMMENDED_COUNT");
    // 【断言 params 而不是句子】引擎不再产出人类语言，句子在 src/i18n 里拼。
    // 这里要验的本来就是"这条提示指的是莫德雷德"，params.role 说得比措辞更准
    expect(preview.warnings[0]?.params.role).toBe("MORDRED");
  });

  it("9 人局用莫德雷德没有提示", () => {
    const preview = previewSetup(defaultDraft(9));
    expect(preview.selectedEvil).toEqual(["MORDRED"]);
    expect(preview.warnings).toEqual([]);
  });

  it("人数越界只回一条错误，且不抛", () => {
    for (const count of [4, 11, 5.5]) {
      const preview = previewSetup({
        playerCount: count,
        humanSeat: 0,
        evilOptionIndex: 0,
      });
      expect(preview.errors).toHaveLength(1);
      expect(preview.errors[0]?.code).toBe("PLAYER_COUNT_UNSUPPORTED");
      expect(preview.canStart).toBe(false);
      // 渲染期不能抛：抛了就是白屏
      expect(preview.roles).toEqual([]);
      expect(preview.evilOptions).toEqual([]);
    }
  });
});

describe("presetOptionIndex", () => {
  it("选中的就是 rules.md §3.2 的推荐配置", () => {
    for (const count of COUNTS) {
      const draft = defaultDraft(count);
      expect(previewSetup(draft).roles).toEqual(createConfig(count).roles);
    }
  });

  it("推荐项落在选项表里的位置", () => {
    // 7 人推荐奥伯伦、8 人推荐爪牙、9 人推荐莫德雷德
    expect(getEvilOptions(7)[presetOptionIndex(7)]).toEqual(["OBERON"]);
    expect(getEvilOptions(8)[presetOptionIndex(8)]).toEqual(["MINION"]);
    expect(getEvilOptions(9)[presetOptionIndex(9)]).toEqual(["MORDRED"]);
  });

  it("人数非法时回 0 而不是抛", () => {
    expect(presetOptionIndex(4)).toBe(0);
    expect(presetOptionIndex(99)).toBe(0);
  });
});

describe("草稿变更", () => {
  it("换人数会重置座位和自由位——旧值在新人数下可能非法", () => {
    let draft: SetupDraft = defaultDraft(10);
    draft = withEvilOption(draft, 3); // 爪牙+爪牙，9 人局装不下
    draft = withHumanSeat(draft, 8); // 座位 8 在 6 人局越界
    expect(draft.evilOptionIndex).toBe(3);
    expect(draft.humanSeat).toBe(8);

    const next = withPlayerCount(draft, 6);
    expect(next.humanSeat).toBe(0);
    expect(next.evilOptionIndex).toBe(presetOptionIndex(6));
    expect(previewSetup(next).canStart).toBe(true);
  });

  it("人数没变就原样返回，不白白重置玩家的选择", () => {
    const draft = withHumanSeat(defaultDraft(7), 3);
    expect(withPlayerCount(draft, 7)).toBe(draft);
  });

  it("点已坐着的座位是起身，变成全 AI 观战局", () => {
    const seated = withHumanSeat(defaultDraft(7), 3);
    expect(seated.humanSeat).toBe(3);
    expect(withHumanSeat(seated, 3).humanSeat).toBeNull();
  });

  it("越界座位当作起身，不静默钳到边界", () => {
    expect(withHumanSeat(defaultDraft(7), 7).humanSeat).toBeNull();
    expect(withHumanSeat(defaultDraft(7), -1).humanSeat).toBeNull();
  });

  it("起身观战 / 坐回去，是那个动作说得出名字的入口", () => {
    const seated = withHumanSeat(defaultDraft(7), 3);

    const watching = withSpectator(seated);
    expect(watching.humanSeat).toBeNull();
    // 【坐回去固定 0 号】不记住上一次坐哪：多存一个字段就多一处会和 playerCount 对不上的地方
    expect(withSeat(watching).humanSeat).toBe(0);
  });

  it("已经是那个状态时原样返回，不制造无谓的重渲染", () => {
    const seated = withHumanSeat(defaultDraft(7), 3);
    const watching = withSpectator(seated);

    expect(withSeat(seated)).toBe(seated);
    expect(withSpectator(watching)).toBe(watching);
  });

  it("观战草稿照样开得了局——canStart 不看座位", () => {
    // 座位是"你玩不玩"，不是配置合不合法。SetupScreen 那边的按钮也因此不再拦它
    expect(previewSetup(withSpectator(defaultDraft(7))).canStart).toBe(true);
  });

  it("越界的自由位下标退回第一项", () => {
    expect(withEvilOption(defaultDraft(7), 99).evilOptionIndex).toBe(0);
    expect(withEvilOption(defaultDraft(7), -1).evilOptionIndex).toBe(0);
  });
});

describe("finalizeConfig", () => {
  it("种子由调用方给，不同种子给出不同配置", () => {
    const draft = defaultDraft(7);
    expect(finalizeConfig(draft, 123).seed).toBe(123);
    expect(finalizeConfig(draft, 456).seed).toBe(456);
  });

  it("产出的配置能过引擎的校验", () => {
    for (const count of COUNTS) {
      getEvilOptions(count).forEach((_, index) => {
        const draft = withEvilOption(defaultDraft(count), index);
        expect(() => validateConfig(finalizeConfig(draft, 1))).not.toThrow();
      });
    }
  });

  it("roles 跟着自由位的选择走", () => {
    const draft = withEvilOption(defaultDraft(10), 3); // 爪牙+爪牙
    const config = finalizeConfig(draft, 1);
    expect(config.roles.filter((r) => r === "MINION")).toHaveLength(2);
    expect(config.roles).not.toContain("MORDRED");
  });
});

describe("tallyRoles", () => {
  it("把重复角色折成计数，顺序不变", () => {
    expect(tallyRoles(previewSetup(defaultDraft(9)).roles)).toEqual([
      { role: "MERLIN", count: 1, team: "GOOD" },
      { role: "PERCIVAL", count: 1, team: "GOOD" },
      { role: "LOYAL_SERVANT", count: 4, team: "GOOD" },
      { role: "MORGANA", count: 1, team: "EVIL" },
      { role: "ASSASSIN", count: 1, team: "EVIL" },
      { role: "MORDRED", count: 1, team: "EVIL" },
    ]);
  });

  it("空列表给空结果", () => {
    expect(tallyRoles([])).toEqual([]);
  });

  it("折起来的总数等于人数", () => {
    for (const count of COUNTS) {
      const roles = previewSetup(defaultDraft(count)).roles;
      const total = tallyRoles(roles).reduce((sum, t) => sum + t.count, 0);
      expect(total).toBe(count);
    }
  });
});

describe("默认草稿", () => {
  it("默认 7 人：第一个有自由位的人数，一上来就看得见配置区在做什么", () => {
    expect(DEFAULT_PLAYER_COUNT).toBe(7);
    expect(previewSetup(defaultDraft()).freeEvilSlots).toBeGreaterThan(0);
    expect(defaultDraft().humanSeat).toBe(0);
  });
});
