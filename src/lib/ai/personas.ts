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
 * 生成人设的 prompt。
 *
 * 三条约束直接抄自 wolfcha 的 `characterGenerator.fullPersonasPrompt`，它们都是踩出来的：
 * - 不写 high/low/aggressive 这类标签：标签会让模型演一个标签，而不是演一个人
 * - **不写字数区间**：与 rules.md §6 同源，中文模型对字数的感知很差
 * - 说话风格里不许有职业类比和行业术语：否则人设本身就会把"里程碑/分工"那套话带进牌桌，
 *   而那正是 PUBLIC_SPEECH_RULES 刚刚禁掉的东西
 */
function buildPersonaPrompt(count: number): string {
  return [
    `你在为一局阿瓦隆桌游生成 ${count} 位 AI 玩家的人设。他们是"来玩阿瓦隆的普通人"，不是剧本杀角色。`,
    "",
    "【目标】一桌真实玩家：有人大胆有人谨慎，有人记票型有人记语气，",
    "有人一两句带过、有人被追问就展开。彼此要明显不同，但每个人都得能正常参与讨论。",
    "",
    "【每个人要有】",
    "- name：中文名，2-3 个字，互不相同",
    "- traits：2-3 个性格词",
    "- speechStyle：说话的语气、节奏和句式习惯",
    "- mind.reasoningStyle：看局势时最先注意什么（票型、语气、上过几次车、位置关系……）",
    "- mind.speechLengthHabit：平时、被追问、被指认时话的长短怎么变",
    "- mind.pressureStyle：被点名或被怀疑时会怎么反应",
    "- mind.mistakePattern：他常犯的判断错误——**每个人都要有缺陷**，完美的人不像真人",
    "",
    "【硬约束】",
    "- 全部写成自然语言描述，不要写 high/low/aggressive/新手/高手 这类标签",
    "- **不要出现任何字数区间**（不要写「30-50 字」这种）",
    "- speechStyle 与 mind 里不许出现职业类比、行业术语、职场黑话——这是牌桌，不是周会",
    "- 不要写和阿瓦隆无关的身世剧情",
    "",
    "【输出格式】",
    "只输出一个 JSON 对象，不要解释文字，不要 markdown 代码块：",
    '{"personas":[{"name":"…","traits":["…"],"speechStyle":"…",' +
      '"mind":{"reasoningStyle":"…","speechLengthHabit":"…","pressureStyle":"…","mistakePattern":"…"}}]}',
    `personas 数组必须恰好 ${count} 个元素。`,
  ].join("\n");
}

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
  const { config, count, onNote } = options;
  const fallback = (reason: string): Persona[] => {
    onNote?.(`人设生成失败（${reason}），回退到占位人设`);
    return makePlaceholderPersonas(count);
  };

  let raw: string;
  try {
    raw = await callProvider(personaConfig(config), [
      { role: "user", content: buildPersonaPrompt(count) },
    ]);
  } catch (error) {
    return fallback(error instanceof Error ? error.message : "未知原因");
  }

  const parsed = responseSchema.safeParse(extractJson(raw));
  if (!parsed.success) {
    return fallback(`返回的 JSON 不合格式：${parsed.error.issues[0]?.message ?? "未知"}`);
  }

  const { personas } = parsed.data;
  if (personas.length < count) {
    return fallback(`只给了 ${personas.length} 份，需要 ${count} 份`);
  }
  // 多给了就截断——多出来的那几份只是浪费，不值得为它重试一次
  const picked = personas.slice(0, count);

  const names = new Set(picked.map((p) => p.name));
  if (names.size !== picked.length) {
    return fallback("有重名的人设");
  }

  onNote?.(`已生成 ${count} 份人设：${picked.map((p) => p.name).join("、")}`);
  return picked;
}
