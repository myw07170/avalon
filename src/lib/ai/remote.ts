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
import type { UserLlmConfig } from "./user-config";
import type {
  AiClient,
  AiDecisionKind,
  AiDecisionRequest,
  AiDecisionResult,
} from "../game/types";

/** 与 client.ts 里同名类型的用意一致：只取实际用到的那一种调用形态 */
export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export interface RemoteAiClientOptions {
  /** 默认 /api/ai */
  endpoint?: string;
  /** 服务端创建的对局额度 session；只放 header，不进入 prompt schema */
  gameSessionId?: string | null;
  /** 用户本次会话自带的 LLM 配置；只随 /api/ai 请求体走，不写 header */
  userLlmConfig?: UserLlmConfig | null;
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
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.gameSessionId) headers["X-Game-Session-Id"] = options.gameSessionId;

  return {
    async decide<K extends AiDecisionKind>(
      req: AiDecisionRequest<K>,
    ): Promise<AiDecisionResult<K>> {
      const fetchFn = options.fetchFn ?? (globalThis.fetch as FetchFn);

      let response: Response;
      try {
        response = await fetchFn(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({
            ...req,
            ...(options.userLlmConfig ? { userLlmConfig: options.userLlmConfig } : {}),
          }),
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
  "AUTH_REQUIRED",
  "GAME_SESSION_REQUIRED",
  "QUOTA_EXHAUSTED",
  "AI_CALL_LIMIT",
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
