/**
 * 开局时用 LLM 生成一桌人设。
 *
 * 【为什么值得单独花一次调用】首两局真实对局里五个 AI 说的话几乎一模一样，
 * 一半原因在这里：它们拿到的是 `makePlaceholderPersonas` 造的同一份占位人设
 * （traits 全是 "占位"）。形容词式的人设改变不了模型关注什么，
 * "最先看票型"和"最先看谁说话急"才会（见 types.ts 的 PersonaMind）。
 *
 * 【一次调用出齐全部人设】不是每人一次。一次出齐才谈得上"互相错开"——
 * 分人生成必然撞名、撞风格，还贵 n 倍。
 *
 * 【失败就回退占位人设，不让整局跑不起来】人设是锦上添花，不是开局的必要条件。
 * 这与 client.ts 的错误边界同源：只有"模型说了胡话"才兜底，配置错误照样往上抛——
 * 但这里连配置错误也只降级不中断，因为它发生在牌局之外。
 *
 * 【本模块只跑在服务端】它读 LlmProviderConfig（带 apiKey）。浏览器经
 * src/app/api/personas/route.ts 转发，与 remote.ts / api/ai 同样的理由。
 */
import { z } from "zod";
import { makePlaceholderPersonas } from "../game/setup";
import type { Persona } from "../game/types";
import { callProvider, extractJson, type LlmProviderConfig } from "./client";
import { PROMPT_COPY } from "./prompt-copy";

const personaSchema = z.object({
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

const responseSchema = z.object({ personas: z.array(personaSchema).min(1) });

/**
 * 这一次调用**不发 max_tokens**，是全项目唯一的例外。
 *
 * `LLM_MAX_TOKENS` 是为对局中的单次决策定的（一个布尔值加一句 reasoning，700 绰绰有余）。
 * 人设是一次出齐全桌：10 份 × 每份 4 个 mind 字段，700 token 必然截断 →
 * JSON 解析失败 → 回退占位人设。而"一桌占位人设"恰恰是这个模块要修的那个症状，
 * 让一个提速开关把它悄悄退回去，是最难查的一类坑。
 *
 * 超时（timeoutMs）照旧受约束——那道闸防的是卡死，与输出长度无关。
 */
function personaConfig(config: LlmProviderConfig): LlmProviderConfig {
  return { ...config, maxTokens: undefined };
}

export interface GeneratePersonasOptions {
  config: LlmProviderConfig;
  count: number;
  /**
   * 人设用哪种语言写。
   *
   * 【英文那份 prompt 里明写了要西方名字】不在这里按 locale 分支——
   * 人设生成是纯 prompt 工程，加一个 if 只会让"名字为什么是中文的"
   * 这件事散到两个文件里。照抄 wolfcha 的做法：约束写进 prompt。
   */
  locale: "zh" | "en";
  /** 每条决策记一行，与 real-game.test.ts 的打点同源。不传就不打点 */
  onNote?: (note: string) => void;
}

/**
 * 生成 `count` 份人设。任何一步出问题都回退到占位人设并通过 onNote 说明原因——
 * **不静默**：悄悄换成占位人设会让你对着一桌说话雷同的 AI 找半天 prompt 的毛病。
 */
export async function generatePersonas(
  options: GeneratePersonasOptions,
): Promise<Persona[]> {
  const { config, count, locale, onNote } = options;
  const c = PROMPT_COPY[locale].personaGen;
  const fallback = (reason: string): Persona[] => {
    onNote?.(c.noteFallback(reason));
    return makePlaceholderPersonas(count);
  };

  let raw: string;
  try {
    raw = await callProvider(personaConfig(config), [
      { role: "user", content: c.prompt(count) },
    ]);
  } catch (error) {
    return fallback(error instanceof Error ? error.message : c.unknownReason);
  }

  const parsed = responseSchema.safeParse(extractJson(raw));
  if (!parsed.success) {
    return fallback(c.badJson(parsed.error.issues[0]?.message ?? c.unknownDetail));
  }

  const { personas } = parsed.data;
  if (personas.length < count) {
    return fallback(c.tooFew(personas.length, count));
  }
  // 多给了就截断——多出来的那几份只是浪费，不值得为它重试一次
  const picked = personas.slice(0, count);

  const names = new Set(picked.map((p) => p.name));
  if (names.size !== picked.length) {
    return fallback(c.duplicateNames);
  }

  onNote?.(c.noteGenerated(count, picked.map((p) => p.name)));
  return picked;
}
