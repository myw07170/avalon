/**
 * LLM 输出的 zod schema —— AI 层的入口闸门。模型返回的任何东西都必须先过这里。
 *
 * 【边界】schema 只管**形状**，不管**合法性**。
 * "队伍是不是 3 个人"、"好人能不能投失败"、"刺杀目标是不是合法座位号"，
 * 全部由 legal.ts 的 assertLegal 判定，本文件一条都不重复——
 * 同一条规则写两遍必然分叉，而分叉的那一份一定是 schema 这份（它离 rules.md 最远）。
 *
 * 【未知字段静默剥离】用 z.object 的默认行为，不用 z.strictObject。
 * 模型爱顺手多返回一个 confidence / notes，为此判整次输出失败再重试是纯浪费。
 *
 * 【与 types.ts 的绑定】每个 schema 都挂 `satisfies z.ZodType<...>`。
 * 将来给 AiTeamProposal 加字段却忘了改 schema，pnpm typecheck 会当场炸——
 * 这层保护不要删，AI 层的类型漂移是没有运行时症状的。
 */
import { z } from "zod";
import type {
  AiAssassination,
  AiDecisionKind,
  AiDecisionPayload,
  AiDecisionRequest,
  AiMissionCard,
  AiSpeech,
  AiTeamProposal,
  AiVote,
  GameAction,
  Persona,
  PlayerView,
} from "../game/types";

/** 座位号。范围合不合法（有没有这个座位）归 assertLegal 管 */
export const playerIdSchema = z.number().int().nonnegative();

export const aiSpeechSchema = z.object({
  reasoning: z.string(),
  // 空发言是坏数据不是策略：引擎不校验文本内容，但一句话都不说没法进发言流
  content: z.string().trim().min(1),
  /**
   * score 刻意不卡 0-1：它只喂阶段 6 的怀疑度热力图，
   * 为一个装饰性字段触发整次重试不划算。0-1 的约定写在 prompt 里，由 UI 归一化。
   */
  suspicions: z
    .array(z.object({ playerId: playerIdSchema, score: z.number() }))
    .optional(),
}) satisfies z.ZodType<AiSpeech>;

export const aiTeamProposalSchema = z.object({
  reasoning: z.string(),
  // 人数对不对、有没有重复、座位存不存在，全归 assertLegal
  team: z.array(playerIdSchema).min(1),
  statement: z.string().trim().min(1),
}) satisfies z.ZodType<AiTeamProposal>;

export const aiVoteSchema = z.object({
  reasoning: z.string(),
  approve: z.boolean(),
}) satisfies z.ZodType<AiVote>;

export const aiMissionCardSchema = z.object({
  reasoning: z.string(),
  // 好人交上来 false 由 assertLegal 抛 GOOD_CANNOT_FAIL，不在这里拦
  success: z.boolean(),
}) satisfies z.ZodType<AiMissionCard>;

export const aiAssassinationSchema = z.object({
  reasoning: z.string(),
  targetId: playerIdSchema,
}) satisfies z.ZodType<AiAssassination>;

/**
 * 决策种类 → schema。
 *
 * 写成一张表而不是 switch，理由与 legal.ts 的 PHASE_ACTIONS 同源：
 * 散成各处的 if，迟早出现"AiDecisionKind 里有这一项，却没有对应 schema"的分叉。
 * 类型标注让漏写一个 kind 变成编译错误。
 */
export const AI_SCHEMAS: {
  readonly [K in AiDecisionKind]: z.ZodType<AiDecisionPayload[K]>;
} = {
  TEAM_PROPOSAL: aiTeamProposalSchema,
  SPEECH: aiSpeechSchema,
  VOTE: aiVoteSchema,
  MISSION_CARD: aiMissionCardSchema,
  ASSASSINATION: aiAssassinationSchema,
};

/** 校验失败直接抛 ZodError。调用方确信输入正确时用它（如 mock 的输出自检） */
export function parseAiPayload<K extends AiDecisionKind>(
  kind: K,
  raw: unknown,
): AiDecisionPayload[K] {
  return AI_SCHEMAS[kind].parse(raw);
}

/**
 * 不抛版本。client.ts 的重试循环要拿到 error 文本塞回下一轮 prompt，
 * 告诉模型上次哪里不合格——所以这里返回字符串而不是 ZodError 对象。
 */
export function safeParseAiPayload<K extends AiDecisionKind>(
  kind: K,
  raw: unknown,
):
  | { success: true; data: AiDecisionPayload[K] }
  | { success: false; error: string } {
  const result = AI_SCHEMAS[kind].safeParse(raw);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    error: result.error.issues
      .map((issue) => `${issue.path.join(".") || "(根)"}: ${issue.message}`)
      .join("; "),
  };
}

// ---------------------------------------------------------------------------
// HTTP 边界
// ---------------------------------------------------------------------------

/**
 * 从 AI_SCHEMAS 派生，不手抄第二遍。
 * schema.test.ts 里"每个 AiDecisionKind 都有对应 schema"那条已经钉住了它的键集合，
 * 所以这里的 as 不会悄悄和 AiDecisionKind 分叉。
 */
export const aiDecisionKindSchema = z.enum(
  Object.keys(AI_SCHEMAS) as [AiDecisionKind, ...AiDecisionKind[]],
);

/**
 * 语言。取值与 `src/i18n/locale.ts` 的 LOCALES 一致。
 *
 * 【这里手写一份而不是 import LOCALES】schema.ts 在服务端跑，
 * 而 `src/i18n/locale.ts` 虽然是纯常量、import 它并不会出问题，
 * 但 zod 的 enum 需要的是字面量元组——写在这里，加语言时 `AiDecisionRequest.locale`
 * 那个联合类型会先在 tsc 上报错，跑不到运行期。
 */
const localeSchema = z.enum(["zh", "en"]);

/** 只校验"是个对象"，类型由泛型参数给。见下面 aiDecisionRequestSchema 的说明 */
const objectLike = <T>(what: string): z.ZodType<T> =>
  z.custom<T>((value) => typeof value === "object" && value !== null, {
    error: `${what} 必须是一个对象`,
  });

/**
 * /api/ai 收到的请求体。
 *
 * 【刻意是浅的】`PlayerView` 有二十多个字段，在这里手抄一份 zod schema 必然与
 * types.ts 分叉，而分叉的那份一定是这份。view 畸形的唯一后果是 prompt 变难看，
 * 真正的闸门是阶段 7 的鉴权与扣费——那时这个接口才会对陌生人开放。
 *
 * 用 z.custom 而不是 z.looseObject：后者的输出类型是 `{}`，
 * route 就得写一个 `as unknown as AiDecisionRequest` 的断言才能往下传。
 * 注意也**不能**用 z.object({})——它会把 view 的所有字段剥光，这是个很安静的坑。
 *
 * 【新增字段必须写在这里】`z.object` 会**静默剥掉**没声明的键。
 * `locale` 就是最容易栽在这上面的那一个：漏了它，服务端会拿到
 * `locale: undefined`，英文模式下每一条 prompt 仍是中文，而且不报任何错。
 * route.test.ts 里有一条专门盯着它。
 */
export const aiDecisionRequestSchema = z.object({
  kind: aiDecisionKindSchema,
  view: objectLike<PlayerView>("view"),
  persona: objectLike<Persona>("persona"),
  // 空数组意味着"这个人根本没有可做的动作"，那是调用方算错了阶段
  legalActions: z.array(objectLike<GameAction>("legalActions 的元素")).min(1),
  maxRetries: z.number().int().nonnegative(),
  /**
   * 【这个 default 是协议边界上的兼容，不是内部回退】浏览器里缓存着的旧页面
   * 不会带 locale，为它 400 掉一整局不值得。内部代码路径上 locale 是必填的，
   * 缺了是编译错误——两件事不矛盾：默认值只在**不可信输入**这一侧存在。
   */
  locale: localeSchema.default("zh"),
}) satisfies z.ZodType<AiDecisionRequest<AiDecisionKind>>;
