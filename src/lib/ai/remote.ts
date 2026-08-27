/**
 * 浏览器侧的 AiClient：把决策请求 POST 给 /api/ai，拿回结果。
 *
 * 【这个文件一行都不 import client.ts】那会把服务端代码和 provider 配置
 * 拖进浏览器包。它只认识一个 URL，不认识任何 key。
 *
 * 【不做兜底】网络不通就抛（见 client.ts 顶部的说明）：随机兜底只服务于
 * "模型说了胡话"这一种情况，把网络故障也算进 fallback 率，那个指标就废了。
 */
import { AiError } from "./errors";
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
        // route handler 的错误响应形如 { error: "..." }，取出来当消息，
        // 取不到就退回状态码——服务端已经保证这段文本里不含 key
        const message = await readErrorMessage(response);
        throw new AiError(`${endpoint} 返回 HTTP ${response.status}：${message}`, "PROVIDER_UNAVAILABLE", {
          endpoint,
          status: response.status,
        });
      }

      return (await response.json()) as AiDecisionResult<K>;
    },
  };
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null) {
      const error = (body as { error?: unknown }).error;
      if (typeof error === "string") return error;
    }
  } catch {
    // 响应体不是 JSON。没什么可说的，交给上面的状态码
  }
  return "无错误详情";
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
  options: FetchPersonasOptions = {},
): Promise<PersonaFetchResult> {
  const endpoint = options.endpoint ?? "/api/personas";
  const fetchFn = options.fetchFn ?? (globalThis.fetch as FetchFn);

  let response: Response;
  try {
    response = await fetchFn(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (cause) {
    return {
      personas: null,
      notes: [`请求人设失败：${cause instanceof Error ? cause.message : "未知原因"}`],
    };
  }

  if (!response.ok) {
    // 服务端已经保证这段文本里不含 key（见 api/personas/route.ts 的 503 分支）
    return {
      personas: null,
      notes: [`生成人设失败（HTTP ${response.status}）：${await readErrorMessage(response)}`],
    };
  }

  try {
    const body = (await response.json()) as PersonaFetchResult;
    return { personas: body.personas ?? null, notes: body.notes ?? [] };
  } catch {
    return { personas: null, notes: ["人设接口返回的不是合法 JSON"] };
  }
}
