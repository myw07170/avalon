/**
 * 浏览器侧的 AiClient：把决策请求 POST 给 /api/ai，拿回结果。
 *
 * 【这个文件一行都不 import client.ts】那会把服务端代码和 provider 配置
 * 拖进浏览器包。它只认识一个 URL，不认识任何 key。
 *
 * 【不做兜底】网络不通就抛（见 client.ts 顶部的说明）：随机兜底只服务于
 * "模型说了胡话"这一种情况，把网络故障也算进 fallback 率，那个指标就废了。
 */
import { AiError, type AiErrorCode } from "./errors";
import { PROMPT_COPY } from "./prompt-copy";
import type {
  AiClient,
  AiDecisionKind,
  AiDecisionRequest,
  AiDecisionResult,
  Persona,
} from "../game/types";

/** 与 client.ts 里同名类型的用意一致：只取实际用到的那一种调用形态 */
export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export interface RemoteAiClientOptions {
  /** 默认 /api/ai */
  endpoint?: string;
  /** 注入点：测试里不发真网络 */
  fetchFn?: FetchFn;
  /**
   * 整局的中止句柄。**不挂它的话「重开」是假的**：orchestrator 只在每步开头
   * 检查 signal，在途的那次请求仍在跑，服务端也仍在向 provider 要结果——
   * 玩家以为停了，钱还在烧。
   *
   * 挂在 client 上而不是加进 AiClient.decide 的签名：mock 不需要它，
   * 而那个接口是 mock 与真实实现的共同契约，不该为一方的实现细节变形。
   */
  signal?: AbortSignal;
}

export function createRemoteAiClient(options: RemoteAiClientOptions = {}): AiClient {
  const endpoint = options.endpoint ?? "/api/ai";

  return {
    async decide<K extends AiDecisionKind>(
      req: AiDecisionRequest<K>,
    ): Promise<AiDecisionResult<K>> {
      const fetchFn = options.fetchFn ?? (globalThis.fetch as FetchFn);

      let response: Response;
      try {
        response = await fetchFn(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req),
          // 没配 signal 时整个字段不出现，而不是发个 undefined
          ...(options.signal ? { signal: options.signal } : {}),
        });
      } catch (cause) {
        throw new AiError(
          `请求 ${endpoint} 失败：${cause instanceof Error ? cause.message : "未知原因"}`,
          "PROVIDER_UNAVAILABLE",
          { endpoint },
        );
      }

      if (!response.ok) {
        // route handler 的错误响应形如 { code, error }。
        // 【code 要原样带上】玩家看到的那句话按它在 src/i18n 里查——退回
        // PROVIDER_UNAVAILABLE 的话，"服务端没配 key" 会被说成 "上游暂时不可用"，
        // 而这两件事该做的处置完全不同。error 只进 console，不显示给玩家
        const { code, detail } = await readError(response);
        throw new AiError(`${endpoint} 返回 HTTP ${response.status}：${detail}`, code, {
          endpoint,
          status: response.status,
        });
      }

      return (await response.json()) as AiDecisionResult<K>;
    },
  };
}

const AI_ERROR_CODES: readonly AiErrorCode[] = [
  "CONFIG_MISSING",
  "PROVIDER_REJECTED",
  "PROVIDER_UNAVAILABLE",
  "BAD_REQUEST",
];

/**
 * 从错误响应里取出 { code, detail }。
 *
 * 【code 要校验，不能直接信】这是一段跨 HTTP 边界的输入。虽然两端都是我们自己的
 * 代码，但版本可以不一致（缓存住的旧页面打新服务端），认不出的值退回
 * PROVIDER_UNAVAILABLE ——那是"再试试"，是最不会误导人的一档。
 */
async function readError(
  response: Response,
): Promise<{ code: AiErrorCode; detail: string }> {
  let code: AiErrorCode = "PROVIDER_UNAVAILABLE";
  let detail = "无错误详情";

  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null) {
      const raw = body as { code?: unknown; error?: unknown };
      if (
        typeof raw.code === "string" &&
        (AI_ERROR_CODES as readonly string[]).includes(raw.code)
      ) {
        code = raw.code as AiErrorCode;
      }
      if (typeof raw.error === "string") detail = raw.error;
    }
  } catch {
    // 响应体不是 JSON。没什么可说的，交给上面的状态码
  }

  return { code, detail };
}

// ---------------------------------------------------------------------------
// 人设
// ---------------------------------------------------------------------------

export interface PersonaFetchResult {
  /** 拿不到就是 null，调用方回退 makePlaceholderPersonas */
  personas: Persona[] | null;
  /** 服务端的打点，或这一趟失败的原因。要显示给玩家看，不能吞 */
  notes: string[];
}

export interface FetchPersonasOptions {
  /** 默认 /api/personas */
  endpoint?: string;
  fetchFn?: FetchFn;
  signal?: AbortSignal;
}

/**
 * 开局前取一桌人设。
 *
 * 【这个函数不抛】与 decide 正好相反。理由在 personas.ts 的文件头：
 * 人设是锦上添花，不是开局的必要条件——为它中断开局是本末倒置。
 * 失败的原因走 notes 交给界面，**绝不静默**（rules.md §6）。
 */
export async function fetchPersonas(
  count: number,
  locale: "zh" | "en",
  options: FetchPersonasOptions = {},
): Promise<PersonaFetchResult> {
  const endpoint = options.endpoint ?? "/api/personas";
  const fetchFn = options.fetchFn ?? (globalThis.fetch as FetchFn);

  let response: Response;
  try {
    response = await fetchFn(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count, locale }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (cause) {
    return {
      personas: null,
      notes: [
        PROMPT_COPY[locale].personaGen.noteFallback(
          cause instanceof Error ? cause.message : PROMPT_COPY[locale].personaGen.unknownReason,
        ),
      ],
    };
  }

  if (!response.ok) {
    // 服务端已经保证这段文本里不含 key（见 api/personas/route.ts 的 503 分支）
    return {
      personas: null,
      notes: [
        PROMPT_COPY[locale].personaGen.noteFallback(
          `HTTP ${response.status}: ${(await readError(response)).detail}`,
        ),
      ],
    };
  }

  try {
    const body = (await response.json()) as PersonaFetchResult;
    return { personas: body.personas ?? null, notes: body.notes ?? [] };
  } catch {
    return {
      personas: null,
      notes: [PROMPT_COPY[locale].personaGen.noteFallback(PROMPT_COPY[locale].personaGen.badJson(""))],
    };
  }
}
