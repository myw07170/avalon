/**
 * AiClient 的假实现：随机合法动作 + 模板发言。
 *
 * 先做这个再做 client.ts。它让整条调度链路能在零 token 成本下调完，
 * 开发期默认就跑它（LLM_PROVIDER=mock）。
 *
 * 阶段 4 实现，见 docs/todos.md。
 */
import type {
  AiClient,
  AiDecisionKind,
  AiDecisionRequest,
  AiDecisionResult,
  RngFn,
} from "../game/types";

export function createMockAiClient(_rng: RngFn): AiClient {
  return {
    decide<K extends AiDecisionKind>(
      _req: AiDecisionRequest<K>,
    ): Promise<AiDecisionResult<K>> {
      throw new Error("TODO 阶段 4：createMockAiClient 未实现");
    },
  };
}
