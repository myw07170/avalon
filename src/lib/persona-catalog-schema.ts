import { z } from "zod";
import type { Locale } from "@/i18n/locale";
import type { Persona } from "@/lib/game";

export const PERSONA_CATALOG_SIZE = 30;

export const personaSchema = z.object({
  name: z.string().trim().min(1),
  traits: z.array(z.string().trim().min(1)).min(1),
  speechStyle: z.string().trim().min(1),
  mind: z.object({
    reasoningStyle: z.string().trim().min(1),
    speechLengthHabit: z.string().trim().min(1),
    pressureStyle: z.string().trim().min(1),
    mistakePattern: z.string().trim().min(1),
  }),
}) satisfies z.ZodType<Persona>;

export const generatedPersonaPairSchema = z.object({
  zh: personaSchema,
  en: personaSchema,
});

export const personaCatalogEntrySchema = generatedPersonaPairSchema.extend({
  id: z.string().regex(/^persona-\d{2}$/),
});

export type PersonaCatalogEntry = z.infer<typeof personaCatalogEntrySchema>;

const normalized = (value: string): string => value.trim().toLocaleLowerCase();

function profileFingerprint(persona: Persona): string {
  return [
    ...persona.traits,
    persona.speechStyle,
    persona.mind?.reasoningStyle ?? "",
    persona.mind?.speechLengthHabit ?? "",
    persona.mind?.pressureStyle ?? "",
    persona.mind?.mistakePattern ?? "",
  ]
    .map(normalized)
    .join("\u0000");
}

function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values.map(normalized)) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

export const personaCatalogFileSchema = z
  .object({
    version: z.literal(1),
    personas: z.array(personaCatalogEntrySchema).length(PERSONA_CATALOG_SIZE),
  })
  .superRefine((catalog, ctx) => {
    const duplicateIds = duplicateValues(catalog.personas.map((entry) => entry.id));
    if (duplicateIds.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["personas"],
        message: `人设 id 重复：${duplicateIds.join("、")}`,
      });
    }

    for (const locale of ["zh", "en"] satisfies readonly Locale[]) {
      const duplicateNames = duplicateValues(
        catalog.personas.map((entry) => entry[locale].name),
      );
      if (duplicateNames.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["personas"],
          message: `${locale} 人设姓名重复：${duplicateNames.join("、")}`,
        });
      }

      const duplicateProfiles = duplicateValues(
        catalog.personas.map((entry) => profileFingerprint(entry[locale])),
      );
      if (duplicateProfiles.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["personas"],
          message: `${locale} 人设画像重复`,
        });
      }
    }

    catalog.personas.forEach((entry, index) => {
      const expected = `persona-${String(index + 1).padStart(2, "0")}`;
      if (entry.id !== expected) {
        ctx.addIssue({
          code: "custom",
          path: ["personas", index, "id"],
          message: `人设 id 应为 ${expected}`,
        });
      }
      if (/\p{Script=Han}/u.test(JSON.stringify(entry.en))) {
        ctx.addIssue({
          code: "custom",
          path: ["personas", index, "en"],
          message: "英文人设不能包含汉字",
        });
      }
    });
  });

export type PersonaCatalogFile = z.infer<typeof personaCatalogFileSchema>;

