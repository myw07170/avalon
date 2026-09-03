/**
 * AiClient 的真实实现。
 *
 * 【只在服务端运行】本文件持有 apiKey，浏览器侧走 remote.ts 经
 * src/app/api/ai/route.ts 转发，API key 绝不进浏览器包。
 *
 * 【重试也在服务端】一次 HTTP 请求内跑完 N 次模型调用，而不是让浏览器来回 N 趟。
 *
 * 【只有"模型说了胡话"才兜底】校验失败重试 maxRetries 次，用尽则在 legalActions 里
 * 随机兜底并标记 fallback: true。配置错误与网络错误一律**抛**，理由有两条：
 * 1. `fallback` 率是判断 prompt 好不好的唯一指标（阶段 4 完成标准的"超过 5%"），
 *    把 401 也算进去这条判据就废了；
 * 2. key 配错时静默兜底会跑出整局随机 AI，而你完全看不出来。
 *
 * 【协议】只做 OpenAI 兼容的 /chat/completions：deepseek / qwen / openai
 * 以及任何兼容网关都说这一套。别的协议请走兼容层，不要在这里长出第二套分支。
 */
import { createMockAiClient } from "./mock";
import { buildPrompt } from "./prompt";
import { PROMPT_COPY } from "./prompt-copy";
import { safeParseAiPayload } from "./schema";
import { AiError } from "./errors";
import type {
  AiClient,
  AiDecisionKind,
  AiDecisionRequest,
  AiDecisionResult,
  RngFn,
} from "../game/types";

/**
 * 只取我们实际用到的这一种调用形态，不用 `typeof fetch`。
 * 全局 fetch 的重载签名很宽，测试里造一个假的要写一堆用不上的分支。
 */
export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export interface LlmProviderConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  /** 单次调用超时。Next 的 BFF 指南明确要求给外部调用设超时 */
  timeoutMs?: number;
  /**
   * 输出上限。undefined → **请求里根本不发这个字段**（保持 provider 默认）。
   *
   * 这是控制单次调用耗时最直接的一根杠杆：本项目的 prompt 要求发言 2-5 句，
   * 实测模型普遍写 6-10 句，超出的部分既没人读也在真金白银地拖时间。
   * 切太狠的症状是 JSON 被截断 → schema 校验失败 → 重试，**fallback 率会立刻反映**，
   * 所以调这个值时盯着那个数字，不要盯感觉。
   */
  maxTokens?: number;
  /**
   * 采样温度。undefined → DEFAULT_TEMPERATURE；**null → 请求里根本不发这个字段**。
   *
   * null 不是"温度为 0"，是"这一项交给模型自己定"。OpenAI 的 gpt-5 系列
   * （含 nano / mini）只接受默认值，显式发 0.8 会被 400 顶回来：
   * `Unsupported value: 'temperature' does not support 0.8 with this model`。
   */
  temperature?: number | null;
  /**
   * 原样并进请求体的额外字段，覆盖同名项。**这是唯一一个 provider 专属参数的出口**。
   *
   * 存在的理由与"别的协议请走兼容网关"同源：与其为每家模型长一个分支，不如开一个
   * 通用口子。典型用途是 `{"reasoning_effort":"minimal"}`——gpt-5-nano 默认每次调用
   * 要烧 1600+ reasoning token、12s，加上这一项后 1.5s（实测）。
   *
   * `model` / `messages` 不许覆盖：改这两个等于换了个问题去问，排查起来极其费劲。
   */
  extraBody?: Record<string, unknown>;
  /** 注入点：测试全程不发网络。默认 globalThis.fetch */
  fetchFn?: FetchFn;
  /** 注入点：兜底选动作用的随机源。默认 Math.random */
  rng?: RngFn;
}

/**
 * provider → 默认 baseUrl。`LLM_BASE_URL` 覆盖它。
 * 认不出的 provider 直接抛，不猜——猜错的表现是一串 404，比报错难查得多。
 */
const PROVIDER_BASE_URLS: Record<string, string> = {
  deepseek: "https://api.deepseek.com/v1",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  openai: "https://api.openai.com/v1",
};

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;

/** 社交推理需要一点变化，别让一桌 AI 说出一模一样的话 */
const DEFAULT_TEMPERATURE = 0.8;

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------

function requireEnv(name: string, hint: string): string {
  const value = process.env[name];
  if (!value) {
    throw new AiError(`缺少环境变量 ${name}：${hint}`, "CONFIG_MISSING", { name });
  }
  return value;
}

/**
 * 从环境变量读一份 provider 配置。给 route handler 用。
 *
 * `LLM_PROVIDER=mock` 也在这里拦掉：mock 模式根本不该走网络，
 * 走到这里说明调用方（orchestrator）选错了 client——要报得响亮，不要悄悄返回一个假结果。
 */
export function readProviderConfig(): LlmProviderConfig {
  const provider = requireEnv("LLM_PROVIDER", "填 deepseek / qwen / openai 之一");
  if (provider === "mock") {
    throw new AiError(
      "LLM_PROVIDER=mock：mock 模式不该走网络，调用方应该直接用 createMockAiClient",
      "CONFIG_MISSING",
      { provider },
    );
  }

  const apiKey = requireEnv("LLM_API_KEY", "在 .env.local 里填 provider 的 API key");
  const model = requireEnv("LLM_MODEL", "填模型名，如 deepseek-chat");
  const temperature = readTemperature();
  const timeoutMs = readTimeoutMs();
  const maxTokens = readMaxTokens();
  const extraBody = readExtraBody();
  const baseUrl = process.env.LLM_BASE_URL || PROVIDER_BASE_URLS[provider];
  if (!baseUrl) {
    throw new AiError(
      `不认识的 provider「${provider}」，请显式配置 LLM_BASE_URL`,
      "CONFIG_MISSING",
      { provider, known: Object.keys(PROVIDER_BASE_URLS) },
    );
  }

  return { provider, apiKey, baseUrl, model, temperature, timeoutMs, maxTokens, extraBody };
}

/** 不许被 LLM_EXTRA_BODY 覆盖的字段：改了它们等于换了个问题去问 */
const RESERVED_BODY_KEYS = ["model", "messages"];

/** LLM_EXTRA_BODY：一段 JSON 对象，原样并进请求体。留空则什么都不加 */
function readExtraBody(): Record<string, unknown> | undefined {
  const raw = process.env.LLM_EXTRA_BODY?.trim();
  if (!raw) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AiError(
      `LLM_EXTRA_BODY 不是合法 JSON：${raw}`,
      "CONFIG_MISSING",
      { raw },
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new AiError(`LLM_EXTRA_BODY 必须是一个 JSON 对象，收到「${raw}」`, "CONFIG_MISSING", {
      raw,
    });
  }

  const reserved = RESERVED_BODY_KEYS.filter((key) => key in parsed);
  if (reserved.length > 0) {
    throw new AiError(
      `LLM_EXTRA_BODY 不能覆盖 ${reserved.join("、")}：模型名请用 LLM_MODEL，提示词由 prompt.ts 生成`,
      "CONFIG_MISSING",
      { reserved },
    );
  }
  return parsed as Record<string, unknown>;
}

/**
 * LLM_TIMEOUT_MS：单次调用超时，留空取 30s。
 *
 * 【推理模型要调大】gpt-5 系列在吐 JSON 之前会先烧一大段 reasoning token，
 * 30s 经常不够；超时算 PROVIDER_UNAVAILABLE，会重试，于是一次决策白等 90s。
 * 【走 /api/ai 时它受 route.ts 的 maxDuration=60 压制】那条路上把它调过 60s 没有意义，
 * 真正需要长超时的是 real-game.test.ts 那种直接在 Node 里跑整局的场景。
 */
function readTimeoutMs(): number {
  const raw = process.env.LLM_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AiError(
      `LLM_TIMEOUT_MS 必须是正整数毫秒，收到「${raw}」`,
      "CONFIG_MISSING",
      { raw },
    );
  }
  return parsed;
}

/**
 * LLM_MAX_TOKENS：单次调用的输出上限，**留空则整个字段都不发**。
 *
 * 与 LLM_TIMEOUT_MS 同形状（正整数或抛错），但缺省语义相反：超时必须有个值，
 * 而输出上限没配就该交给 provider 的默认，凭空塞一个数字只会让人莫名其妙地被截断。
 */
function readMaxTokens(): number | undefined {
  const raw = process.env.LLM_MAX_TOKENS?.trim();
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AiError(
      `LLM_MAX_TOKENS 必须是正整数，收到「${raw}」`,
      "CONFIG_MISSING",
      { raw },
    );
  }
  return parsed;
}

/**
 * LLM_TEMPERATURE：留空取默认 0.8；写 `default` 表示**不发送这个字段**；其余按数字解析。
 *
 * 之所以要有这个开关而不是按模型名去猜：模型名和"支不支持自定义温度"没有可靠对应关系，
 * 猜错的表现是开局一串 400。与 LLM_BASE_URL 认不出 provider 时的处理同源——宁可让人显式写。
 */
function readTemperature(): number | null {
  const raw = process.env.LLM_TEMPERATURE?.trim();
  if (!raw) return DEFAULT_TEMPERATURE;
  if (raw === "default") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 2) {
    throw new AiError(
      `LLM_TEMPERATURE 必须是 0-2 之间的数字，或写 default 表示不发送这个字段，收到「${raw}」`,
      "CONFIG_MISSING",
      { raw },
    );
  }
  return parsed;
}

/** 服务端认定的重试上限。请求里带的值只能比它小，不能比它大 */
export function readMaxRetries(): number {
  const raw = process.env.LLM_MAX_RETRIES;
  if (!raw) return DEFAULT_MAX_RETRIES;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new AiError(
      `LLM_MAX_RETRIES 必须是非负整数，收到「${raw}」`,
      "CONFIG_MISSING",
      { raw },
    );
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// 模型输出的清洗
// ---------------------------------------------------------------------------

/**
 * DeepSeek-R1 这类推理模型会把思考过程混进正文。只剥 markdown 围栏是不够的——
 * 这一条是照 wolfcha 的 src/lib/llm-json.ts 踩过的坑抄来的。
 */
const REASONING_TAGS = ["think", "thinking", "analysis", "reasoning", "thought"].join("|");

function stripReasoning(text: string): string {
  return text
    .replace(
      new RegExp(`<\\s*(${REASONING_TAGS})\\b[^>]*>[\\s\\S]*?<\\s*/\\s*\\1\\s*>`, "gi"),
      "",
    )
    .replace(new RegExp(`<\\s*/?\\s*(${REASONING_TAGS})\\b[^>]*>`, "gi"), "")
    .trim();
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```[a-zA-Z0-9_-]*\s*/, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

/**
 * 从模型的原文里抠出 JSON 对象。抠不出来返回 undefined
 * （`JSON.parse` 永远不会返回 undefined，所以它是个无歧义的失败标记）。
 *
 * 刻意不引入 ai-json-fixer 那类"激进修复"依赖：清洗不动就走重试，
 * 那本来就是设计好的补救手段，多一个依赖换不来什么。
 */
export function extractJson(raw: string): unknown {
  const cleaned = stripFences(stripReasoning(raw));
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return undefined;
  // 尾随逗号是模型最常见的一种手滑，顺手去掉
  const candidate = cleaned.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1");
  try {
    return JSON.parse(candidate);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// provider 调用
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * 发一次请求，拿回模型的原文。
 *
 * 错误分成两类，这个区分决定了上层要不要重试：
 * - 4xx（429 除外）→ PROVIDER_REJECTED，改配置才能好，重试纯属浪费
 * - 429 / 5xx / 网络不通 / 超时 → PROVIDER_UNAVAILABLE，可以重试
 *
 * 抛出的消息里绝不带 apiKey，也不原样回传 provider 的响应体。
 */
/** 开发期静态目录生成器也用这条链路，所以导出。它不认识对局，只负责发送 messages */
export async function callProvider(
  config: LlmProviderConfig,
  messages: ChatMessage[],
): Promise<string> {
  const fetchFn = config.fetchFn ?? (globalThis.fetch as FetchFn);
  const url = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const temperature = config.temperature === undefined ? DEFAULT_TEMPERATURE : config.temperature;

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        // null 时整个字段都不出现，而不是发个 null——provider 会把 null 当非法值
        ...(temperature === null ? {} : { temperature }),
        // OpenAI 的 json_object 模式要求 messages 里出现 "JSON" 字样。
        // prompt.ts 的【输出格式】段写的"只输出一个 JSON 对象"正好满足，别改没了
        response_format: { type: "json_object" },
        // 同 temperature：没配就整个字段不出现，而不是发个 undefined
        ...(config.maxTokens === undefined ? {} : { max_tokens: config.maxTokens }),
        // 放在最后：不支持 json_object 的模型得能把它换掉。
        // model / messages 在 readExtraBody 里已经拦住了
        ...config.extraBody,
      }),
      signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (cause) {
    throw new AiError(
      `调用 ${config.provider} 失败：${cause instanceof Error ? cause.message : "未知原因"}`,
      "PROVIDER_UNAVAILABLE",
      { provider: config.provider },
    );
  }

  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    const hint = await readErrorSlugs(response);
    throw new AiError(
      `${config.provider} 返回 HTTP ${response.status}` +
        (hint.code === undefined ? "" : `（${hint.code}${hint.param ? ` / ${hint.param}` : ""}）`),
      retryable ? "PROVIDER_UNAVAILABLE" : "PROVIDER_REJECTED",
      { provider: config.provider, status: response.status, ...hint },
    );
  }

  const body: unknown = await response.json();
  const content = readContent(body);
  if (content === undefined) {
    throw new AiError(
      `${config.provider} 的响应里没有 choices[0].message.content`,
      "PROVIDER_UNAVAILABLE",
      { provider: config.provider },
    );
  }
  return content;
}

/**
 * 从错误响应里只捞 `error.code` / `error.param` 这两个短枚举串。
 *
 * 【为什么值得多读一次响应体】"HTTP 400"本身没有任何线索，而 `unsupported_value` /
 * `temperature` 一眼就能定位；401 同理，`invalid_api_key` 说明 key 是错的而不是没配。
 *
 * 【为什么只捞这两个，不捞 error.message】message 是自由文本，可能带上组织名、
 * 配额数字之类的账号信息。这里用白名单式的正则卡死形状：不像枚举串的一律丢掉，
 * 于是"不原样回传 provider 的响应体"这条仍然成立。
 */
const ERROR_SLUG = /^[a-z0-9_.-]{1,64}$/i;

async function readErrorSlugs(
  response: Response,
): Promise<{ code?: string; param?: string }> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {}; // 上游返回的不是 JSON，没什么可捞的
  }
  if (typeof body !== "object" || body === null) return {};
  const error = (body as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return {};

  const slug = (key: string): string | undefined => {
    const value = (error as Record<string, unknown>)[key];
    return typeof value === "string" && ERROR_SLUG.test(value) ? value : undefined;
  };
  return { code: slug("code"), param: slug("param") };
}

/** 只取一个字段，不给整个响应写 schema——那是 provider 的事，我们只要正文 */
function readContent(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return undefined;
  const message = (choices[0] as { message?: unknown } | undefined)?.message;
  if (typeof message !== "object" || message === null) return undefined;
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content : undefined;
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

/**
 * 用尽重试后的随机兜底。
 *
 * 直接借 mock 的 payload：它已经保证"只从 legalActions 里选"，
 * 所以**好人的兜底票永远不会是失败票**——这条引擎级硬约束不需要在这里再实现一遍。
 * 只把 fallback 改成 true、debug 换成这一趟真实的记录。
 */
async function fallbackResult<K extends AiDecisionKind>(
  req: AiDecisionRequest<K>,
  rng: RngFn,
  debug: { prompt: string; raw: string; attempts: number },
): Promise<AiDecisionResult<K>> {
  const { payload } = await createMockAiClient(rng).decide(req);
  return { payload, fallback: true, debug };
}

export function createAiClient(config: LlmProviderConfig): AiClient {
  const rng = config.rng ?? Math.random;

  return {
    async decide<K extends AiDecisionKind>(
      req: AiDecisionRequest<K>,
    ): Promise<AiDecisionResult<K>> {
      const prompt = buildPrompt(req);
      const copy = PROMPT_COPY[req.locale];
      const messages: ChatMessage[] = [{ role: "user", content: prompt }];
      const maxAttempts = req.maxRetries + 1;

      let raw = "";
      let attempts = 0;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        attempts += 1;

        try {
          raw = await callProvider(config, messages);
        } catch (error) {
          // 配置类错误重试多少次都是同一个结果，立刻抛
          if (error instanceof AiError && error.code === "PROVIDER_REJECTED") throw error;
          if (attempt === maxAttempts - 1) throw error;
          // 网络类错误原样重发，messages 不动
          continue;
        }

        const parsed = extractJson(raw);
        const result =
          parsed === undefined
            ? { success: false as const, error: copy.noJsonObject }
            : safeParseAiPayload(req.kind, parsed);

        if (result.success) {
          return { payload: result.data, fallback: false, debug: { prompt, raw, attempts } };
        }

        // 带着反馈重问，而不是原样再发一遍。
        // safeParseAiPayload 返回字符串而不是 ZodError，当初就是为这一步准备的
        messages.push({ role: "assistant", content: raw });
        messages.push({
          role: "user",
          // 【这句话是注回模型的，所以它属 prompt 语料不属 UI 文案】
          // 段名用 ref 回指而不是写死——写死的话英文 prompt 会指向一个不存在的段
          content: copy.retryFeedback(result.error, copy.ref(copy.titles.output)),
        });
      }

      return fallbackResult(req, rng, { prompt, raw, attempts });
    },
  };
}
