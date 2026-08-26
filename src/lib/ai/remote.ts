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
} from "../game/types";

/** 与 client.ts 里同名类型的用意一致：只取实际用到的那一种调用形态 */
export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export interface RemoteAiClientOptions {
  /** 默认 /api/ai */
  endpoint?: string;
  /** 注入点：测试里不发真网络 */
  fetchFn?: FetchFn;
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
