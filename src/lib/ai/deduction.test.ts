import { describe, expect, it } from "vitest";
import { createConfig } from "../game/config";
import { createRng } from "../game/rng";
import { createGame, makePlaceholderPersonas } from "../game/setup";
import {
  ROLE_TEAM,
  type GameState,
  type PlayerId,
  type ProposalRecord,
  type PublicMissionRecord,
  type Role,
} from "../game/types";
import { simulateGame } from "../sim/random";
import {
  deduceFromMissions,
  findDeductionMisses,
  type Deduction,
  type DeductionInput,
} from "./deduction";

const ALL_COUNTS = [5, 6, 7, 8, 9, 10];

const FIVE: Role[] = ["MERLIN", "PERCIVAL", "LOYAL_SERVANT", "MORGANA", "ASSASSIN"];

function mission(
  missionIndex: number,
  team: PlayerId[],
  failCount: number,
  succeeded = failCount === 0,
): PublicMissionRecord {
  return { missionIndex, attempt: 0, team, leaderId: team[0] ?? 0, failCount, succeeded };
}

/** 默认 5 人局：2 个坏人、座位 0-4 */
function input(
  missions: PublicMissionRecord[],
  evilCount = 2,
  seatCount = 5,
): DeductionInput {
  return {
    missions,
    evilCount,
    seats: Array.from({ length: seatCount }, (_, i) => i),
  };
}

const kinds = (items: Deduction[]): string[] => items.map((d) => d.kind);

// ---------------------------------------------------------------------------
// 单条任务的推论
// ---------------------------------------------------------------------------

describe("失败票数是坏人数的下界", () => {
  it("3 人队 2 张失败票：至少 2 个坏人，任挑 2 人必带坏人", () => {
    const items = deduceFromMissions(input([mission(0, [1, 2, 3], 2)]));

    expect(items[0]).toEqual({
      kind: "MIN_EVIL",
      missionIndex: 0,
      team: [1, 2, 3],
      atLeast: 2,
      // 队伍里好人最多 1 个，所以任取 2 人必然至少带上 1 个坏人
      pickSize: 2,
    });
  });

  it("0 张失败票的任务推不出任何东西——坏人可以投成功票洗白", () => {
    expect(deduceFromMissions(input([mission(0, [0, 1, 2], 0)]))).toEqual([]);
  });

  /**
   * 7 人以上第 4 轮要 2 张失败票才算失败。1 张时任务成功，
   * 但那张票依然证明车上有一个坏人——判据必须是 failCount，不能是 succeeded。
   */
  it("任务成功但有 1 张失败票，照样推出至少 1 个坏人", () => {
    const items = deduceFromMissions(input([mission(3, [0, 1, 2, 3], 1, true)], 3, 7));

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "MIN_EVIL", atLeast: 1 });
  });

  it("整队都交失败票 → 这些人确定是坏人", () => {
    const items = deduceFromMissions(input([mission(0, [1, 3], 2)]));

    expect(items[0]).toEqual({ kind: "ALL_EVIL", missionIndex: 0, playerIds: [1, 3] });
    // ALL_EVIL 已经是最强结论，不再重复给一条 MIN_EVIL
    expect(kinds(items)).not.toContain("MIN_EVIL");
  });

  it("没有任何任务记录时返回空数组，不给占位对象", () => {
    expect(deduceFromMissions(input([]))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 清白推论
// ---------------------------------------------------------------------------

describe("坏人名额被占满 → 其余人清白", () => {
  it("5 人局 2 个坏人，一支队伍就占满了 → 车下的人全是好人", () => {
    const items = deduceFromMissions(input([mission(0, [1, 2, 3], 2)]));

    expect(items.at(-1)).toEqual({ kind: "CLEARED", playerIds: [0, 4] });
  });

  it("占不满就不给清白结论", () => {
    // 5 人局 2 个坏人，1 张失败票只说明车上有 1 个，车下仍可能藏着另一个
    expect(
      kinds(deduceFromMissions(input([mission(0, [1, 2, 3], 1)]))),
    ).not.toContain("CLEARED");
  });

  it("多条清白结论合并成并集，且按座位升序", () => {
    const items = deduceFromMissions(
      input([mission(0, [1, 2, 3], 2), mission(1, [2, 3, 4], 2)]),
    );

    // 第 1 条排除 0 与 4，第 2 条排除 0 与 1，两条各自成立 → 并集
    expect(items.find((d) => d.kind === "CLEARED")).toEqual({
      kind: "CLEARED",
      playerIds: [0, 1, 4],
    });
  });
});

// ---------------------------------------------------------------------------
// 纯函数
// ---------------------------------------------------------------------------

describe("纯函数", () => {
  it("不改动传入的记录，同输入同结果", () => {
    const req = input([mission(0, [3, 1, 2], 2)]);
    const before = JSON.stringify(req);

    expect(deduceFromMissions(req)).toEqual(deduceFromMissions(req));
    expect(JSON.stringify(req)).toBe(before);
  });

  it("队伍按座位升序输出，抹掉原始顺序", () => {
    expect(deduceFromMissions(input([mission(0, [3, 1, 2], 2)]))[0]).toMatchObject({
      team: [1, 2, 3],
    });
  });
});

// ---------------------------------------------------------------------------
// 踩雷
// ---------------------------------------------------------------------------

function proposal(
  missionIndex: number,
  leaderId: PlayerId,
  team: PlayerId[],
  approved = true,
  attempt = 0,
): ProposalRecord {
  return { missionIndex, attempt, leaderId, team, votes: {}, approved, forced: false };
}

/** 一个只填了踩雷判定用得着的字段的终局状态 */
function finished(
  missionHistory: PublicMissionRecord[],
  proposalHistory: ProposalRecord[],
  roles: Role[] = FIVE,
): GameState {
  const base = createGame({
    config: createConfig(roles.length, { roles }),
    humanSeat: null,
    personas: makePlaceholderPersonas(roles.length),
    rng: createRng(3),
  });
  return {
    ...base,
    players: base.players.map((p, id) => ({ ...p, role: roles[id] ?? p.role })),
    missionHistory: missionHistory.map((m) => ({ ...m, cards: [] })),
    proposalHistory,
  };
}

describe("踩雷：该推出来的时候有没有推出来", () => {
  /** real-game-84804 的原局面：第 2 轮 0、1、4 出 2 张失败票，第 3 轮照样带 0、1 */
  const failedSecond = [mission(0, [0, 1], 0), mission(1, [0, 1, 4], 2)];

  it("已知那 3 人里至少 2 个坏人，再提名其中 2 人就是踩雷", () => {
    const misses = findDeductionMisses(finished(failedSecond, [proposal(2, 1, [0, 1])]));

    expect(misses).toHaveLength(1);
    expect(misses[0]).toMatchObject({
      missionIndex: 2,
      leaderId: 1,
      team: [0, 1],
      overlap: [0, 1],
    });
    expect(misses[0]?.basis).toMatchObject({ kind: "MIN_EVIL", atLeast: 2 });
  });

  it("避开那三人就不算踩雷", () => {
    expect(
      findDeductionMisses(finished(failedSecond, [proposal(2, 1, [2, 3])])),
    ).toEqual([]);
  });

  it("只碰一个人不算踩雷——那一个仍可能是车上唯一的好人", () => {
    expect(
      findDeductionMisses(finished(failedSecond, [proposal(2, 1, [0, 3])])),
    ).toEqual([]);
  });

  /**
   * 本函数最容易写错的一点：拿终局的全量任务记录去判过去的提议，
   * 等于用未来责备过去，数字会虚高。
   */
  it("只用当时已知的结论：本轮自己的任务结果不能用来判本轮的提议", () => {
    // 第 2 轮的失败是这次提议执行完才知道的，判它自己不算踩雷
    expect(
      findDeductionMisses(finished(failedSecond, [proposal(1, 4, [0, 1, 4])])),
    ).toEqual([]);
  });

  it("整队皆坏时，碰一个人就算踩雷", () => {
    const misses = findDeductionMisses(
      finished([mission(0, [1, 3], 2)], [proposal(1, 0, [0, 1, 2])]),
    );

    expect(misses).toHaveLength(1);
    expect(misses[0]).toMatchObject({ overlap: [1] });
    expect(misses[0]?.basis).toMatchObject({ kind: "ALL_EVIL" });
  });

  it("标注队长真实阵营——坏人踩雷很可能是故意的，不能和好人的失误混在一起", () => {
    // FIVE 的座位：0 梅林、1 派西维尔、2 忠臣、3 莫甘娜、4 刺客
    const byGood = findDeductionMisses(finished(failedSecond, [proposal(2, 1, [0, 1])]));
    const byEvil = findDeductionMisses(finished(failedSecond, [proposal(2, 3, [0, 1])]));

    expect(byGood[0]?.leaderIsEvil).toBe(false);
    expect(byEvil[0]?.leaderIsEvil).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// soundness：每一条结论都必须是真的
// ---------------------------------------------------------------------------

/**
 * 本组最有价值的用例。
 *
 * 推错一条，复盘指标就会把正确的走法记成踩雷，而且看不出任何异常。
 * 所以拿真实对局的真实身份把每条结论逐条验一遍：
 * 借 sim/random.ts 的 onStep 在每个中间状态上各算一次。
 *
 * 谁是坏人在这里从 ROLE_TEAM 独立算，不复用 deduction.ts 里的任何东西——
 * 复用了就不是独立检验了（同 random.test.ts 把规则独立算一遍那条）。
 */
describe("soundness：拿真实身份验每一条结论", () => {
  it("MIN_EVIL / ALL_EVIL / CLEARED 在真实对局里条条成立", () => {
    let checked = 0;
    let sawMinEvil = false;
    let sawCleared = false;

    const verify = (state: GameState): void => {
      const evil = new Set(
        state.players.filter((p) => ROLE_TEAM[p.role] === "EVIL").map((p) => p.id),
      );
      const evilAmong = (ids: readonly PlayerId[]): number =>
        ids.filter((id) => evil.has(id)).length;

      const items = deduceFromMissions({
        missions: state.missionHistory,
        evilCount: evil.size,
        seats: state.players.map((p) => p.id),
      });

      for (const item of items) {
        checked += 1;
        switch (item.kind) {
          case "MIN_EVIL":
            sawMinEvil = true;
            expect(evilAmong(item.team)).toBeGreaterThanOrEqual(item.atLeast);
            // pickSize 的含义：任取这么多人必然至少带上 1 个坏人，
            // 等价于队伍里的好人不足 pickSize 个
            expect(item.team.length - evilAmong(item.team)).toBeLessThan(item.pickSize);
            break;
          case "ALL_EVIL":
            expect(evilAmong(item.playerIds)).toBe(item.playerIds.length);
            break;
          case "CLEARED":
            sawCleared = true;
            expect(evilAmong(item.playerIds)).toBe(0);
            break;
        }
      }
    };

    for (let seed = 0; seed < 120; seed += 1) {
      const playerCount = ALL_COUNTS[seed % ALL_COUNTS.length] as number;
      simulateGame(playerCount, seed, { onStep: verify });
    }

    // 断言确实验到了东西：一条都没产出时上面的循环会静静地全过
    expect(checked).toBeGreaterThan(100);
    expect(sawMinEvil).toBe(true);
    expect(sawCleared).toBe(true);
  });
});
