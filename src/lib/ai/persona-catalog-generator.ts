/** 开发期一次性生成人设库。游戏运行时绝不能 import 本文件。 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import {
  PERSONA_CATALOG_SIZE,
  generatedPersonaPairSchema,
  personaCatalogFileSchema,
  type PersonaCatalogFile,
} from "@/lib/persona-catalog-schema";
import { callProvider, extractJson, type LlmProviderConfig } from "./client";

const generatedCatalogSchema = z.object({
  personas: z.array(generatedPersonaPairSchema).length(PERSONA_CATALOG_SIZE),
});

export const PERSONA_CATALOG_PROMPT = [
  `Create exactly ${PERSONA_CATALOG_SIZE} distinct AI player personas for the social-deduction board game Avalon.`,
  `There must be ${PERSONA_CATALOG_SIZE} array elements TOTAL, not ${PERSONA_CATALOG_SIZE} per language. Each array element contains both locales for one logical person. Count the array elements before responding.`,
  "They are ordinary people at a card table, not fantasy characters and not murder-mystery-script roles.",
  "Every persona must be able to discuss normally, but the whole table must differ clearly in temperament, speaking rhythm, what they notice first, how they react under pressure, and how they make mistakes.",
  "Do not assign Avalon roles. Do not include backstories, occupations, professional analogies, industry jargon, labels such as high/low/aggressive/beginner/expert, or numeric word-count ranges.",
  "Every person must have a believable flaw. Do not reuse a name or copy a behavioral profile.",
  "For each logical person, provide semantically equivalent zh and en versions. zh uses a unique 2-3 character Chinese name and natural Chinese. en uses a unique natural English name and English only, with no Chinese characters.",
  "Each locale must contain name, 2-3 traits, speechStyle, and mind with reasoningStyle, speechLengthHabit, pressureStyle, and mistakePattern.",
  "Output one JSON object only, without markdown or explanation, in this shape:",
  '{"personas":[{"zh":{"name":"…","traits":["…"],"speechStyle":"…","mind":{"reasoningStyle":"…","speechLengthHabit":"…","pressureStyle":"…","mistakePattern":"…"}},"en":{"name":"...","traits":["..."],"speechStyle":"...","mind":{"reasoningStyle":"...","speechLengthHabit":"...","pressureStyle":"...","mistakePattern":"..."}}}]}',
  `The personas array must contain exactly ${PERSONA_CATALOG_SIZE} elements. Do not stop after the example element.`,
].join("\n");

export async function generatePersonaCatalog(
  config: LlmProviderConfig,
): Promise<PersonaCatalogFile> {
  // 人设库远长于单次对局决策，不能继承 LLM_MAX_TOKENS；额外请求体也不能绕过。
  const extraBody = config.extraBody ? { ...config.extraBody } : undefined;
  if (extraBody) delete extraBody.max_tokens;
  const raw = await callProvider({ ...config, maxTokens: undefined, extraBody }, [
    { role: "user", content: PERSONA_CATALOG_PROMPT },
  ]);
  const parsed = generatedCatalogSchema.safeParse(extractJson(raw));
  if (!parsed.success) {
    throw new Error(`人设库输出不合格式：${parsed.error.issues[0]?.message ?? "未知原因"}`);
  }

  return personaCatalogFileSchema.parse({
    version: 1,
    personas: parsed.data.personas.map((persona, index) => ({
      id: `persona-${String(index + 1).padStart(2, "0")}`,
      ...persona,
    })),
  });
}

export function ensurePersonaCatalogWritable(outputPath: string, force: boolean): void {
  if (existsSync(outputPath) && !force) {
    throw new Error(`人设库已存在：${outputPath}。如需覆盖，请显式传 --force。`);
  }
}

export function writePersonaCatalog(
  outputPath: string,
  catalog: PersonaCatalogFile,
  force: boolean,
): void {
  ensurePersonaCatalogWritable(outputPath, force);
  const checked = personaCatalogFileSchema.parse(catalog);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(checked, null, 2)}\n`, "utf8");
}

/** 安全的手动命令入口：先拒绝覆盖，再发唯一一次请求，最后才落盘。 */
export async function generateAndWritePersonaCatalog(
  config: LlmProviderConfig,
  outputPath: string,
  force: boolean,
): Promise<PersonaCatalogFile> {
  ensurePersonaCatalogWritable(outputPath, force);
  const catalog = await generatePersonaCatalog(config);
  writePersonaCatalog(outputPath, catalog, force);
  return catalog;
}
