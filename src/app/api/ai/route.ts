/**
 * /api/ai —— AI 层唯一的服务端入口。
 *
 * 【存在的唯一理由是别让 API key 进浏览器】它不记录任何东西，转发一次请求、
 * 返回一次结果（docs/architecture.md §2）。所有游戏逻辑都在浏览器侧的引擎里。
 *
 * 【写法按 Next 16.3.2】用 Web 标准的 Request / Response，不用 NextRequest / NextResponse——
 * 这样这个 handler 就是个普通函数，vitest 里 `new Request(...)` 直接调，不需要起 Next。
 * 不要加 `export const runtime`：Edge runtime 在这一版已经废弃，'nodejs' 就是默认值。
 * POST 天然不缓存，也不需要额外声明。
 */
import { createAiClient, readMaxRetries, readProviderConfig } from "@/lib/ai/client";
import { AiError, type AiErrorCode } from "@/lib/ai/errors";
import { aiDecisionRequestSchema } from "@/lib/ai/schema";

/** 一次请求内可能跑到 3 次模型调用，平台默认的 10s 不够 */
export const maxDuration = 60;

/**
 * 错误响应。
 *
 * 【body 里同时给 code 和 error】code 是给界面用的——玩家看到的那句话按它在
 * `src/i18n` 里查，才跟得上语言。error 是运维细节（哪个环境变量、哪个状态码），
 * 由 remote.ts 原样交给 console，**不显示给玩家**。
 *
 * 两者都不含任何密钥：client.ts 那条「抛出的错误里不含 apiKey，也不含上游原始
 * 响应体」的断言罩着 message，这里只是把它转出去。
 */
const fail = (status: number, code: AiErrorCode, error: string): Response =>
  Response.json({ code, error }, { status });

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "BAD_REQUEST", "请求体不是合法 JSON");
  }

  const parsed = aiDecisionRequestSchema.safeParse(body);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(根)"}: ${issue.message}`)
      .join("; ");
    return fail(400, "BAD_REQUEST", `请求体不合法：${detail}`);
  }

  let config;
  let serverMaxRetries;
  try {
    config = readProviderConfig();
    serverMaxRetries = readMaxRetries();
  } catch (error) {
    if (error instanceof AiError) {
      // 服务端没配好。消息里只有变量名，没有任何密钥
      console.error("[api/ai] 配置错误：", error.message);
      return fail(503, error.code, error.message);
    }
    throw error;
  }

  const req = {
    ...parsed.data,
    // 请求来自浏览器，是不可信输入：不夹一下的话一个 maxRetries: 999 就能烧光预算
    maxRetries: Math.min(parsed.data.maxRetries, serverMaxRetries),
  };

  try {
    return Response.json(await createAiClient(config).decide(req));
  } catch (error) {
    if (error instanceof AiError) {
      // 详情（状态码、provider 名）留在服务端日志里。
      // 响应体只给一句话，不原样回传 provider 的响应体
      console.error("[api/ai] 上游失败：", error.code, error.message, error.context);
      return fail(502, error.code, `上游模型调用失败（${error.code}）`);
    }
    // 剩下的一律算 400。这个边界上只有两种输入：请求体和服务端环境变量，
    // 而后者的问题上面已经以 AiError 的形式拦掉了。所以走到这里基本都是
    // 请求体畸形到浅 schema 故意不管的程度——buildPrompt 会先炸在 view 上
    //（EngineError 是其中最常见的一种，畸形到取不到字段时则是 TypeError）。
    // 真是本地 bug 的话，下面这行日志留在服务端，不会被 400 盖掉
    console.error("[api/ai] 无法用这份请求做决策：", error);
    return fail(400, "BAD_REQUEST", "无法用这份请求做决策，请检查 view 与 legalActions");
  }
}
