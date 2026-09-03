import { describe, expect, it } from "vitest";
import {
  createConfig,
  createGame,
  createRng,
  makePlaceholderPersonas,
} from "@/lib/game";
import {
  PERSONA_CATALOG,
  assignPersonas,
  filterPersonaCatalog,
} from "./persona-catalog";
import { personaCatalogFileSchema } from "./persona-catalog-schema";

describe("静态人设库", () => {
  it("包含 30 个稳定 ID 与完整的双语画像", () => {
    expect(PERSONA_CATALOG).toHaveLength(30);
    expect(PERSONA_CATALOG.map((entry) => entry.id)).toEqual(
      Array.from({ length: 30 }, (_, index) =>
        `persona-${String(index + 1).padStart(2, "0")}`,
      ),
    );
    expect(() =>
      personaCatalogFileSchema.parse({ version: 1, personas: PERSONA_CATALOG }),
    ).not.toThrow();
  });

  it("两种语言姓名唯一，英文内容不含汉字，画像不重复", () => {
    for (const locale of ["zh", "en"] as const) {
      const names = PERSONA_CATALOG.map((entry) => entry[locale].name);
      expect(new Set(names).size).toBe(30);

      const profiles = PERSONA_CATALOG.map((entry) =>
        JSON.stringify({ ...entry[locale], name: undefined }),
      );
      expect(new Set(profiles).size).toBe(30);
    }
    expect(PERSONA_CATALOG.every((entry) => !/\p{Script=Han}/u.test(JSON.stringify(entry.en))))
      .toBe(true);
  });

  it("可按姓名、性格、说话风格和主要推理倾向搜索", () => {
    const entry = PERSONA_CATALOG[0];
    expect(entry).toBeDefined();
    if (!entry) return;

    const probes = [
      entry.zh.name,
      entry.zh.traits[0],
      entry.zh.speechStyle,
      entry.zh.mind?.reasoningStyle,
    ];
    for (const probe of probes) {
      expect(filterPersonaCatalog(PERSONA_CATALOG, "zh", probe ?? "")).toContain(entry);
    }
  });
});

describe("assignPersonas", () => {
  it("保留逐座位手选，其余座位无重复补齐", () => {
    const personas = assignPersonas({
      playerCount: 7,
      humanSeat: 0,
      selections: { 1: "persona-03", 4: "persona-08" },
      locale: "zh",
      seed: 2026,
    });

    expect(personas).toHaveLength(6);
    expect(personas[0]?.name).toBe(PERSONA_CATALOG[2]?.zh.name);
    expect(personas[3]?.name).toBe(PERSONA_CATALOG[7]?.zh.name);
    expect(new Set(personas.map((persona) => persona.name)).size).toBe(6);
  });

  it("全部随机时，同一 seed 确定、不同 seed 可产生不同结果", () => {
    const options = {
      playerCount: 10,
      humanSeat: null,
      selections: {},
      locale: "en" as const,
    };
    const first = assignPersonas({ ...options, seed: 42 }).map((persona) => persona.name);
    const again = assignPersonas({ ...options, seed: 42 }).map((persona) => persona.name);
    const other = assignPersonas({ ...options, seed: 43 }).map((persona) => persona.name);

    expect(first).toEqual(again);
    expect(first).not.toEqual(other);
    expect(new Set(first).size).toBe(10);
  });

  it("按开局语言解析同一稳定 ID", () => {
    const common = {
      playerCount: 5,
      humanSeat: 0,
      selections: { 1: "persona-01" },
      seed: 7,
    };
    expect(assignPersonas({ ...common, locale: "zh" })[0]?.name).toBe(
      PERSONA_CATALOG[0]?.zh.name,
    );
    expect(assignPersonas({ ...common, locale: "en" })[0]?.name).toBe(
      PERSONA_CATALOG[0]?.en.name,
    );
  });

  it("拒绝未知 ID、重复选择、非 AI 座位和非法人数", () => {
    const base = { playerCount: 5, humanSeat: 0, locale: "zh" as const, seed: 1 };
    expect(() => assignPersonas({ ...base, selections: { 1: "missing" } })).toThrow();
    expect(() =>
      assignPersonas({
        ...base,
        selections: { 1: "persona-01", 2: "persona-01" },
      }),
    ).toThrow();
    expect(() => assignPersonas({ ...base, selections: { 0: "persona-01" } })).toThrow();
    expect(() => assignPersonas({ ...base, playerCount: 11 })).toThrow();
  });

  it("人设随机不会推进或扰动引擎的发牌 RNG", () => {
    const config = createConfig(7, { seed: 9988 });
    const before = createGame({
      config,
      humanSeat: 0,
      personas: makePlaceholderPersonas(6),
      rng: createRng(config.seed),
    });

    assignPersonas({
      playerCount: 7,
      humanSeat: 0,
      selections: { 1: "persona-02" },
      locale: "zh",
      seed: config.seed,
    });

    const after = createGame({
      config,
      humanSeat: 0,
      personas: makePlaceholderPersonas(6),
      rng: createRng(config.seed),
    });
    expect(after.players.map((player) => player.role)).toEqual(
      before.players.map((player) => player.role),
    );
    expect(after.currentLeaderId).toBe(before.currentLeaderId);
  });
});
