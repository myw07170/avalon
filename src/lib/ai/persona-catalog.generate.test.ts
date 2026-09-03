import { describe, expect, it } from "vitest";
import { loadEnvLocal } from "./env-local";
import { readProviderConfig } from "./client";
import { generateAndWritePersonaCatalog } from "./persona-catalog-generator";

const requested = process.env.PERSONA_CATALOG_GENERATE === "1";
const shadowed = loadEnvLocal();

describe.skipIf(!requested)("手动生成人设库", () => {
  it(
    "一次调用生成、校验并保存 30 个双语人设",
    async () => {
      if (shadowed.length > 0) {
        throw new Error(`以下变量被进程环境覆盖：${shadowed.join("、")}`);
      }
      const catalog = await generateAndWritePersonaCatalog(
        readProviderConfig(),
        "src/data/persona-catalog.json",
        process.env.PERSONA_CATALOG_FORCE === "1",
      );
      process.stdout.write(`\n已保存 ${catalog.personas.length} 个双语人设。\n`);
      expect(catalog.personas).toHaveLength(30);
    },
    180_000,
  );
});
