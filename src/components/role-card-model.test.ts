import { describe, expect, it } from "vitest";
import { zh } from "@/i18n/messages.zh";
import { ROLE_TEXT } from "@/i18n/roles";
import {
  ROLE_TEAM,
  composeRoles,
  countEvil,
  createConfig,
  createGame,
  createRng,
  makePlaceholderPersonas,
  toPlayerView,
  type GameState,
  type PlayerView,
  type Role,
} from "@/lib/game";
import { describeRole as describeRoleRaw } from "./role-card-model";

/*
 * 【这一行 shim 是刻意的】`describeX` 的第二个参数没有默认值——默认值是静默回退，
 * 会让某个漏改的调用点在英文模式下安静地渲染中文，而没有任何东西会报错。
 * 代价就是这里补一行。下面的断言仍然逐字断言中文，那才是真正在验文案。
 */
const describeRole = (view: PlayerView) => describeRoleRaw(view, zh);


// ---------------------------------------------------------------------------
// 夹具：不手搓 PlayerView，一律走真实的 createGame + toPlayerView
// ---------------------------------------------------------------------------

/**
 * 造一局。evil 省略时用该人数的推荐配置。
 *
 * 【不能省略成 []】composeRoles 不校验，7 人以上把自由位留空会拼出一个
 * 少人的角色表，createConfig 末尾的 validateConfig 才炸出来。
 */
function newGame(playerCount: number, seed: number, evil?: Role[]): GameState {
  return createGame({
    config: createConfig(playerCount, {
      seed,
      ...(evil ? { roles: composeRoles(playerCount, evil) } : {}),
    }),
    humanSeat: 0,
    personas: makePlaceholderPersonas(playerCount),
    rng: createRng(seed),
  });
}

/** 造一局，返回指定角色那个座位的视角。该局没有这个角色时返回 null */
function viewOf(
  role: Role,
  playerCount: number,
  seed: number,
  evil?: Role[],
): PlayerView | null {
  const state = newGame(playerCount, seed, evil);
  const player = state.players.find((p) => p.role === role);
  return player ? toPlayerView(state, player.id) : null;
}

/** 换种子直到抽到该角色的视角。发牌是洗过的，几个种子内必中 */
function findView(role: Role, playerCount: number, evil?: Role[]): PlayerView {
  const slots = evil ?? evilFor(role);
  for (let seed = 1; seed <= 200; seed += 1) {
    const view = viewOf(role, playerCount, seed, slots);
    if (view) return view;
  }
  throw new Error(`${playerCount} 人局（自由位 ${slots.join(",")}）里找不到 ${role}`);
}

/**
 * 能容纳该角色的一组自由位。
 *
 * 【没有一个配置能同时装下八个角色】10 人局是 4 个坏人名额，莫甘娜和刺客恒占两个，
 * 剩下 2 个自由位要在莫德雷德 / 奥伯伦 / 爪牙里三选二。所以按角色分别选局，
 * 不要指望一局跑完所有分支。
 */
function evilFor(role: Role): Role[] {
  return role === "MINION" ? ["OBERON", "MINION"] : TEN_EVIL;
}

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

/** 默认跑 10 人局：自由位最多，可选角色才进得来 */
const TEN_COUNT = 10;
const TEN_EVIL: Role[] = ["MORDRED", "OBERON"];

// ---------------------------------------------------------------------------

describe("八个角色都能画出来", () => {
  it("每个角色都拿得到自己的身份与阵营", () => {
    for (const role of ALL_ROLES) {
      const view = findView(role, TEN_COUNT);
      const brief = describeRole(view);

      expect(brief.label).toBe(ROLE_TEXT.zh[role].label);
      expect(brief.ability).toBe(ROLE_TEXT.zh[role].ability);
      expect(brief.team).toBe(ROLE_TEAM[role]);
      expect(brief.teamLabel).toBe(ROLE_TEAM[role] === "GOOD" ? "好人阵营" : "坏人阵营");
      expect(brief.lines.length).toBeGreaterThan(0);
      // 每个座位都要有标记，圆桌才画得全
      expect(brief.marks).toHaveLength(view.players.length);
    }
  });

  it("自己永远标成 self，绝不会被标成坏人", () => {
    for (const role of ALL_ROLES) {
      const view = findView(role, TEN_COUNT);
      const brief = describeRole(view);
      const self = brief.marks.find((m) => m.id === view.selfId);
      expect(self?.tone).toBe("self");
      expect(brief.marks.filter((m) => m.tone === "self")).toHaveLength(1);
    }
  });
});

describe("梅林", () => {
  it("标出的全是坏人，数量等于坏人总数减莫德雷德", () => {
    const view = findView("MERLIN", TEN_COUNT, TEN_EVIL);
    const brief = describeRole(view);
    const marked = brief.marks.filter((m) => m.tone === "evil");

    expect(marked.length).toBe(countEvil(view.roleComposition) - 1); // 本局有莫德雷德
    expect(brief.marks.some((m) => m.tone === "unsure")).toBe(false);
    expect(brief.lines.every((line) => line.endsWith("是坏人。"))).toBe(true);
  });

  it("看得到奥伯伦，看不到莫德雷德", () => {
    const state = newGame(TEN_COUNT, 1, TEN_EVIL);
    const merlin = state.players.find((p) => p.role === "MERLIN");
    const oberon = state.players.find((p) => p.role === "OBERON");
    const mordred = state.players.find((p) => p.role === "MORDRED");
    expect(merlin && oberon && mordred).toBeTruthy();

    const brief = describeRole(toPlayerView(state, merlin!.id));
    const evilIds = brief.marks.filter((m) => m.tone === "evil").map((m) => m.id);
    expect(evilIds).toContain(oberon!.id);
    expect(evilIds).not.toContain(mordred!.id);
  });

  it("有莫德雷德就说他在场", () => {
    const brief = describeRole(findView("MERLIN", 10, TEN_EVIL));
    expect(brief.hiddenEvilHint).toBe("本局有 4 个坏人，你只看到 3 个——莫德雷德在场。");
  });

  it("没有莫德雷德就说全看到了", () => {
    // 5 人局没有自由位，坏人恒为莫甘娜 + 刺客，梅林两个都看得到
    const brief = describeRole(findView("MERLIN", 5, []));
    expect(brief.hiddenEvilHint).toBe("本局的 2 个坏人你全看到了，没有莫德雷德。");
  });

  it("这个推断只给梅林", () => {
    for (const role of ALL_ROLES) {
      if (role === "MERLIN") continue;
      const brief = describeRole(findView(role, TEN_COUNT));
      expect(brief.hiddenEvilHint).toBeNull();
    }
  });
});

describe("派西维尔", () => {
  it("恰好一条描述、两个座位，且两个座位一视同仁", () => {
    const view = findView("PERCIVAL", TEN_COUNT, TEN_EVIL);
    const brief = describeRole(view);
    const unsure = brief.marks.filter((m) => m.tone === "unsure");

    expect(brief.lines).toHaveLength(1);
    expect(unsure).toHaveLength(2);
    // 【最要紧的一条】两个 tone 必须完全相同，任何区分都会把答案泄回去
    expect(unsure[0]?.tone).toBe(unsure[1]?.tone);
    expect(brief.marks.some((m) => m.tone === "evil")).toBe(false);
  });

  it("描述里两个座位的措辞对称，谁都没有被暗示成梅林", () => {
    const view = findView("PERCIVAL", TEN_COUNT, TEN_EVIL);
    const item = view.knowledge[0];
    if (item?.kind !== "MERLIN_OR_MORGANA") throw new Error("派西维尔的知识形态不对");
    const [a, b] = item.playerIds;
    const line = describeRole(view).lines[0] ?? "";

    expect(line).toContain(`${a} 号`);
    expect(line).toContain(`${b} 号`);
    expect(line).toContain("分不清谁是谁");
    expect(line).not.toMatch(/可能|更像|大概|应该是/);
  });

  it("多个种子下都没有额外加工过升序", () => {
    // 引擎保证 playerIds 升序，这本身不含信息；要确认我们没在上面再叠一层
    for (let seed = 1; seed <= 40; seed += 1) {
      const view = viewOf("PERCIVAL", 10, seed, TEN_EVIL);
      if (!view) continue;
      const item = view.knowledge[0];
      if (item?.kind !== "MERLIN_OR_MORGANA") throw new Error("派西维尔的知识形态不对");
      const [a, b] = item.playerIds;
      expect(a).toBeLessThan(b);
      expect(describeRole(view).lines[0]).toContain(`${a} 号`);
    }
  });
});

describe("坏人阵营", () => {
  const CONSPIRACY: Role[] = ["MORGANA", "ASSASSIN", "MORDRED", "MINION"];

  // 两组局才盖得住四个同谋：10 人局只有 2 个自由位，
  // 莫德雷德和爪牙进不了同一局（奥伯伦要占一个位置才验得了"看不到他"）
  it.each([
    ["奥伯伦 + 爪牙", ["OBERON", "MINION"] as Role[]],
    ["莫德雷德 + 奥伯伦", ["MORDRED", "OBERON"] as Role[]],
  ])("互相看到，但都看不到奥伯伦（%s）", (_label, evil) => {
    const state = newGame(TEN_COUNT, 1, evil);
    const oberon = state.players.find((p) => p.role === "OBERON");
    expect(oberon).toBeTruthy();

    let checked = 0;
    for (const role of CONSPIRACY) {
      const viewer = state.players.find((p) => p.role === role);
      if (!viewer) continue;
      const brief = describeRole(toPlayerView(state, viewer.id));
      const evilIds = brief.marks.filter((m) => m.tone === "evil").map((m) => m.id);

      expect(evilIds).not.toContain(oberon!.id);
      expect(evilIds).not.toContain(viewer.id);
      expect(evilIds.length).toBeGreaterThan(0);
      checked += 1;
    }
    expect(checked).toBeGreaterThanOrEqual(3);
  });

  it("看到的都是「是坏人」，没有二选一", () => {
    for (const role of CONSPIRACY) {
      const brief = describeRole(findView(role, TEN_COUNT));
      expect(brief.marks.some((m) => m.tone === "unsure")).toBe(false);
      expect(brief.lines.every((line) => line.endsWith("是坏人。"))).toBe(true);
    }
  });
});

describe("什么都看不到的两个角色", () => {
  it("忠臣和奥伯伦不画环，给的是那句「只能靠推理」", () => {
    for (const role of ["LOYAL_SERVANT", "OBERON"] as Role[]) {
      const brief = describeRole(findView(role, TEN_COUNT));

      expect(brief.hasKnownSeats).toBe(false);
      expect(brief.lines).toEqual(["你没有任何额外的身份信息，只能靠推理。"]);
      expect(brief.marks.every((m) => m.tone === "plain" || m.tone === "self")).toBe(true);
    }
  });

  it("有信息的角色 hasKnownSeats 为真", () => {
    const informed: Role[] = [
      "MERLIN",
      "PERCIVAL",
      "MORGANA",
      "ASSASSIN",
      "MORDRED",
      "MINION",
    ];
    for (const role of informed) {
      expect(describeRole(findView(role, TEN_COUNT)).hasKnownSeats).toBe(true);
    }
  });
});

describe("座位名", () => {
  it("座位号带上名字", () => {
    const view = findView("MERLIN", TEN_COUNT, TEN_EVIL);
    const line = describeRole(view).lines[0] ?? "";
    const id = Number(line.match(/^(\d+) 号/)?.[1]);
    const name = view.players.find((p) => p.id === id)?.name;

    expect(Number.isInteger(id)).toBe(true);
    expect(line).toContain(`${id} 号（${name}）`);
  });

  it("每个人数下都不抛错", () => {
    for (const count of [5, 6, 7, 8, 9, 10]) {
      const view = viewOf("MERLIN", count, 1);
      expect(view).not.toBeNull();
      expect(() => describeRole(view!)).not.toThrow();
    }
  });
});
