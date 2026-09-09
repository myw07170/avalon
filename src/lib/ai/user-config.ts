import { z } from "zod";

export const USER_LLM_PROVIDERS = ["deepseek", "qwen", "openai", "custom"] as const;

export type UserLlmProvider = (typeof USER_LLM_PROVIDERS)[number];

export const USER_LLM_PROVIDER_BASE_URLS: Record<
  Exclude<UserLlmProvider, "custom">,
  string
> = {
  deepseek: "https://api.deepseek.com/v1",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  openai: "https://api.openai.com/v1",
};

const RESERVED_BODY_KEYS = ["model", "messages"] as const;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export const userLlmConfigSchema = z
  .object({
    provider: z.enum(USER_LLM_PROVIDERS),
    apiKey: z.string().trim().min(1),
    model: z.string().trim().min(1),
    baseUrl: z.string().trim().min(1).optional(),
    temperature: z.number().min(0).max(2).nullable().optional(),
    maxTokens: z.number().int().positive().optional(),
    extraBody: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((config, ctx) => {
    if (config.provider === "custom" && !config.baseUrl) {
      ctx.addIssue({
        code: "custom",
        path: ["baseUrl"],
        message: "custom provider requires baseUrl",
      });
    }
    if (config.baseUrl && !isHttpUrl(config.baseUrl)) {
      ctx.addIssue({
        code: "custom",
        path: ["baseUrl"],
        message: "baseUrl must be an http(s) URL",
      });
    }

    const extraBody = config.extraBody ?? {};
    const reserved = RESERVED_BODY_KEYS.filter((key) => key in extraBody);
    if (reserved.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["extraBody"],
        message: `extraBody cannot override ${reserved.join(", ")}`,
      });
    }
  });

export type UserLlmConfig = z.infer<typeof userLlmConfigSchema>;
