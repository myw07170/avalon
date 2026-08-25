import { describe, expect, it } from "vitest";
import { composeRoles, createConfig, getEvilOptions } from "./config";
import { createRng } from "./rng";
import { createGame, makePlaceholderPersonas } from "./setup";
import { getKnownIdentities } from "./visibility";
import {
  EngineError,
  ROLE_TEAM,
  type Knowledge,
  type Player,
  type PlayerId,
  type Role,
} from "./types";

const ALL_COUNTS = [5, 6, 7, 8, 9, 10];

/** 手工排座位。座位号即下标，用于需要精确控制"谁坐几号"的断言 */
const seat = (roles: Role[]): Player[] =>
  roles.map((role, id) => ({
    id,
    name: `P${id}`,
    role,
    isHuman: false,
    persona: { name: `P${id}`, traits: [], speechStyle: "" },
  }));

const build = (playerCount: number, seed: number, roles?: Role[]): Player[] =>
  createGame({
    config: createConfig(playerCount, roles ? { roles } : undefined),
    humanSeat: null,
    personas: makePlaceholderPersonas(playerCount),
    rng: createRng(seed),
  }).players;

const idOf = (players: Player[], role: Role): PlayerId =>
  players.find((p) => p.role === role)!.id;

/** knowledge 里出现的全部座位号，不区分 kind */
const seatsIn = (knowledge: Knowledge[]): PlayerId[] =>
  knowledge.flatMap((k) => (k.kind === "IS_EVIL" ? [k.playerId] : [...k.playerIds]));

const evilSeats = (knowledge: Knowledge[]): PlayerId[] =>
  knowledge.filter((k) => k.kind === "IS_EVIL").map((k) => k.playerId);

/**
 * 10 人局的完整配置，坏人四种角色齐全——莫德雷德和奥伯伦同时在场，
 * 是唯一能把两个陷阱一次全暴露出来的排布。
 */
const TEN: Role[] = [
  "MERLIN", // 0
  "MORGANA", // 1
  "LOYAL_SERVANT", // 2
  "PERCIVAL", // 3
  "MORDRED", // 4
  "LOYAL_SERVANT", // 5
  "OBERON", // 6
  "ASSASSIN", // 7
  "LOYAL_SERVANT", // 8
  "LOYAL_SERVANT", // 9
];

describe("梅林", () => {
  it("看得到莫甘娜、刺客、爪牙、奥伯伦", () => {
    const players = seat([
      "MERLIN",
      "MORGANA",
      "ASSASSIN",
      "MINION",
      "OBERON",
      "PERCIVAL",
    ]);
    expect(evilSeats(getKnownIdentities(0, players))).toEqual([1, 2, 3, 4]);
  });

  it("knowledge 不含莫德雷德的座位号", () => {
    const knowledge = getKnownIdentities(0, seat(TEN));
    expect(seatsIn(knowledge)).not.toContain(4);
    expect(evilSeats(knowledge)).toEqual([1, 6, 7]);
  });

  it("看得到奥伯伦（rules.md §3.1：奥伯伦只对坏人队友隐身）", () => {
    expect(evilSeats(getKnownIdentities(0, seat(TEN)))).toContain(6);
  });

  it("只产出 IS_EVIL，不产出 MERLIN_OR_MORGANA", () => {
    expect(getKnownIdentities(0, seat(TEN)).every((k) => k.kind === "IS_EVIL")).toBe(true);
  });

  it("看不到自己，也看不到任何好人", () => {
    const players = seat(TEN);
    const seats = seatsIn(getKnownIdentities(0, players));
    expect(seats).not.toContain(0);
    for (const s of seats) expect(ROLE_TEAM[players[s]!.role]).toBe("EVIL");
  });
});

describe("派西维尔", () => {
  it("恰好拿到一条 MERLIN_OR_MORGANA", () => {
    const knowledge = getKnownIdentities(3, seat(TEN));
    expect(knowledge).toHaveLength(1);
    expect(knowledge[0]!.kind).toBe("MERLIN_OR_MORGANA");
  });

  it("梅林座位号 > 莫甘娜座位号时，playerIds[0] 是莫甘娜", () => {
    // 梅林 3 号、莫甘娜 1 号。若实现写成 [merlinId, morganaId]，这里就是 [3, 1]
    const players = seat(["LOYAL_SERVANT", "MORGANA", "PERCIVAL", "MERLIN", "ASSASSIN"]);
    expect(getKnownIdentities(2, players)).toEqual([
      { kind: "MERLIN_OR_MORGANA", playerIds: [1, 3] },
    ]);
  });

  it("梅林座位号 < 莫甘娜座位号时，结果同样升序", () => {
    const players = seat(["LOYAL_SERVANT", "MERLIN", "PERCIVAL", "MORGANA", "ASSASSIN"]);
    expect(getKnownIdentities(2, players)).toEqual([
      { kind: "MERLIN_OR_MORGANA", playerIds: [1, 3] },
    ]);
  });

  it("两人恰好是梅林和莫甘娜各一个", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const players = build(10, seed);
      const percival = idOf(players, "PERCIVAL");
      const seats = seatsIn(getKnownIdentities(percival, players));
      expect(new Set(seats.map((s) => players[s]!.role))).toEqual(
        new Set<Role>(["MERLIN", "MORGANA"]),
      );
    }
  });

  it("跑很多局，两种座位排布都出现过，且每局都是升序", () => {
    let merlinFirst = 0;
    let morganaFirst = 0;
    for (let seed = 0; seed < 200; seed += 1) {
      const players = build(10, seed);
      const entry = getKnownIdentities(idOf(players, "PERCIVAL"), players)[0]!;
      if (entry.kind !== "MERLIN_OR_MORGANA") {
        throw new Error("派西维尔的 knowledge 形状不对");
      }
      const [a, b] = entry.playerIds;
      expect(a, `seed=${seed} 的 playerIds 未升序`).toBeLessThan(b);
      if (players[a]!.role === "MERLIN") merlinFirst += 1;
      else morganaFirst += 1;
    }
    // 两种情况都要出现过，否则上面的升序断言可能只是碰巧成立
    expect(merlinFirst).toBeGreaterThan(0);
    expect(morganaFirst).toBeGreaterThan(0);
  });
});

describe("奥伯伦的双向盲区", () => {
  it("方向一：其他坏人的 knowledge 不含奥伯伦", () => {
    const players = seat(TEN);
    for (const viewer of [1, 4, 7]) {
      expect(
        seatsIn(getKnownIdentities(viewer, players)),
        `座位 ${viewer}（${players[viewer]!.role}）看到了奥伯伦`,
      ).not.toContain(6);
    }
  });

  it("方向二：奥伯伦的 knowledge 为空", () => {
    // 与方向一分开写：只实现一个方向是本项目最常见的错，两条必须能各自独立失败
    expect(getKnownIdentities(6, seat(TEN))).toEqual([]);
  });

  it("方向二补充：奥伯伦看不到任何一个坏人队友", () => {
    const players = seat(TEN);
    const seats = seatsIn(getKnownIdentities(6, players));
    for (const evil of [1, 4, 7]) expect(seats).not.toContain(evil);
  });

  it("奥伯伦在场不影响其他坏人互相认识", () => {
    const players = seat(TEN);
    expect(evilSeats(getKnownIdentities(1, players))).toEqual([4, 7]);
    expect(evilSeats(getKnownIdentities(4, players))).toEqual([1, 7]);
    expect(evilSeats(getKnownIdentities(7, players))).toEqual([1, 4]);
  });
});

describe("其他坏人", () => {
  it("莫甘娜/刺客/莫德雷德/爪牙互相看得到", () => {
    const players = seat([
      "MORGANA",
      "ASSASSIN",
      "MORDRED",
      "MINION",
      "MERLIN",
      "PERCIVAL",
    ]);
    for (const viewer of [0, 1, 2, 3]) {
      expect(evilSeats(getKnownIdentities(viewer, players))).toEqual(
        [0, 1, 2, 3].filter((id) => id !== viewer),
      );
    }
  });

  it("knowledge 不含自己", () => {
    const players = seat(TEN);
    for (const viewer of [1, 4, 6, 7]) {
      expect(seatsIn(getKnownIdentities(viewer, players))).not.toContain(viewer);
    }
  });

  it("看不到任何好人", () => {
    const players = seat(TEN);
    for (const viewer of [1, 4, 7]) {
      for (const s of seatsIn(getKnownIdentities(viewer, players))) {
        expect(ROLE_TEAM[players[s]!.role]).toBe("EVIL");
      }
    }
  });
});

describe("忠臣", () => {
  it("knowledge 为空", () => {
    for (const viewer of [2, 5, 8, 9]) {
      expect(getKnownIdentities(viewer, seat(TEN))).toEqual([]);
    }
  });
});

describe("跨全部配置的性质", () => {
  /** 按 players 独立算一遍期望条数，不复用实现里的集合常量 */
  const expectedCount = (viewer: Player, players: Player[]): number => {
    switch (viewer.role) {
      case "MERLIN":
        return players.filter(
          (p) => ROLE_TEAM[p.role] === "EVIL" && p.role !== "MORDRED",
        ).length;
      case "PERCIVAL":
        return 1;
      case "OBERON":
      case "LOYAL_SERVANT":
        return 0;
      default:
        return players.filter(
          (p) => p.id !== viewer.id && ROLE_TEAM[p.role] === "EVIL" && p.role !== "OBERON",
        ).length;
    }
  };

  it("每个人数的每一种自由位组合、每个座位都符合矩阵", () => {
    for (const n of ALL_COUNTS) {
      for (const option of getEvilOptions(n)) {
        const roles = composeRoles(n, option);
        for (let seed = 0; seed < 10; seed += 1) {
          const players = build(n, seed, roles);
          for (const viewer of players) {
            const label = `${n} 人局 [${option.join("+")}] seed=${seed} 座位 ${viewer.id}(${viewer.role})`;
            const knowledge = getKnownIdentities(viewer.id, players);

            expect(knowledge, `${label} 的 knowledge 条数不对`).toHaveLength(
              expectedCount(viewer, players),
            );

            const seats = seatsIn(knowledge);
            expect(seats, `${label} 看到了自己`).not.toContain(viewer.id);
            for (const s of seats) {
              expect(
                Number.isInteger(s) && s >= 0 && s < n,
                `${label} 出现非法座位号 ${s}`,
              ).toBe(true);
            }

            // 结果整体按 playerId 升序，抹掉任何残留的顺序信息
            const keys = knowledge.map((k) =>
              k.kind === "IS_EVIL" ? k.playerId : k.playerIds[0],
            );
            expect([...keys].sort((a, b) => a - b), `${label} 未按 playerId 排序`).toEqual(
              keys,
            );
          }
        }
      }
    }
  });

  it("好人里只有梅林和派西维尔有信息，且形状互不串", () => {
    for (const n of ALL_COUNTS) {
      for (let seed = 0; seed < 20; seed += 1) {
        const players = build(n, seed);
        for (const viewer of players) {
          const knowledge = getKnownIdentities(viewer.id, players);
          if (viewer.role === "PERCIVAL") {
            expect(knowledge.every((k) => k.kind === "MERLIN_OR_MORGANA")).toBe(true);
          } else {
            expect(
              knowledge.every((k) => k.kind === "IS_EVIL"),
              `${viewer.role} 不该拿到 MERLIN_OR_MORGANA`,
            ).toBe(true);
          }
          if (viewer.role === "LOYAL_SERVANT") expect(knowledge).toEqual([]);
        }
      }
    }
  });
});

describe("纯函数", () => {
  it("不修改传入的 players", () => {
    const players = seat(TEN);
    const snapshot = structuredClone(players);
    for (const p of players) getKnownIdentities(p.id, players);
    expect(players).toEqual(snapshot);
  });

  it("同一输入两次调用结果相同", () => {
    const players = build(9, 42);
    for (const p of players) {
      expect(getKnownIdentities(p.id, players)).toEqual(getKnownIdentities(p.id, players));
    }
  });

  it("座位顺序不影响每个人看到的内容", () => {
    const players = seat(TEN);
    const reordered = [...players].reverse();
    for (const p of players) {
      expect(getKnownIdentities(p.id, reordered)).toEqual(
        getKnownIdentities(p.id, players),
      );
    }
  });
});

describe("非法输入", () => {
  it("不存在的 viewerId 抛 EngineError", () => {
    for (const viewerId of [-1, 10, 1.5]) {
      expect(() => getKnownIdentities(viewerId, seat(TEN))).toThrow(EngineError);
    }
  });

  it("缺莫甘娜时，派西维尔的计算抛 EngineError", () => {
    const noMorgana = seat(["MERLIN", "PERCIVAL", "ASSASSIN", "MINION", "LOYAL_SERVANT"]);
    expect(() => getKnownIdentities(1, noMorgana)).toThrow(EngineError);
  });
});
