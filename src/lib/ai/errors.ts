/**
 * AI 层的错误类型。
 *
 * 【为什么不复用 EngineError】mock.ts / prompt.ts 里抛 `EngineError("INTERNAL")` 是对的——
 * 那些确实是引擎不变量被打破，调用方看到就该去改代码。但"对面 429 了"、"key 没配"
 * 不是引擎的 bug。混成一个类型，调用方就分不清该改代码还是该改配置。
 *
 * 【这些错误都会往上抛，不会被兜底吞掉】随机兜底只服务于一种情况：模型说了胡话。
 * 配置错误静默兜底的后果是整局跑出随机 AI 而你完全看不出来——见 docs/todos.md 阶段 4。
 */
export class AiError extends Error {
  constructor(
    message: string,
    readonly code:
      /** 没配 key、provider 不认识、baseUrl 缺失。改配置才能好 */
      | "CONFIG_MISSING"
      /** provider 返回 4xx（鉴权失败、模型名不存在、余额不足）。重试没有意义 */
      | "PROVIDER_REJECTED"
      /** 429 / 5xx / 网络不通 / 超时。重试过了仍然不行 */
      | "PROVIDER_UNAVAILABLE"
      /** 传进来的 AiDecisionRequest 形状不对。只可能来自 HTTP 边界的外部输入 */
      | "BAD_REQUEST",
    readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AiError";
  }
}
