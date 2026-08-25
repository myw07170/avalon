/**
 * AiClient 的真实实现。
 *
 * 【只在服务端运行】请求经 src/app/api/ai/route.ts 转发，API key 绝不进浏览器包。
 * 校验失败重试 maxRetries 次，用尽则在 legalActions 里随机兜底并标记 fallback: true。
 *
 * 阶段 4 实现，见 docs/todos.md。
 */
import type {
  AiClient,
  AiDecisionKind,
  AiDecisionRequest,
  AiDecisionResult,
} from "../game/types";

export interface LlmProviderConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export function createAiClient(_config: LlmProviderConfig): AiClient {
  return {
    decide<K extends AiDecisionKind>(
      _req: AiDecisionRequest<K>,
    ): Promise<AiDecisionResult<K>> {
      throw new Error("TODO 阶段 4：createAiClient 未实现");
    },
  };
}
