/**
 * /api/personas —— 开局时生成一桌人设。
 *
 * 【存在的理由和 /api/ai 完全一样】别让 LLM 的 API key 进浏览器。
 * 它同样不记录任何东西：转发一次请求、返回一次结果（docs/architecture.md §2）。
 *
 * 【maxDuration 比 /api/ai 短一半，这不是笔误】那边取 60 是因为一次请求内
 * 可能跑 3 次模型调用（校验失败要带着反馈重问）；人设只有一次调用，没有重试。
 *
 * 【必须自己先读一遍配置】generatePersonas 把配置错误也吞成了占位回退
 * （personas.ts 的 fallback），那是它相对 client.ts 的刻意差别——人设是锦上添花，
 * 不是开局的必要条件。但"没配 key"应该让人看见，所以 503 那一支要在这里判，
 * 不能等它回退完再猜。
 */
import { readProviderConfig } from "@/lib/ai/client";
import { AiError } from "@/lib/ai/errors";
import { generatePersonas } from "@/lib/ai/personas";
import { personaRequestSchema } from "@/lib/ai/schema";

export const maxDuration = 30;

const fail = (status: number, error: string): Response =>
  Response.json({ error }, { status });

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "请求体不是合法 JSON");
  }

  const parsed = personaRequestSchema.safeParse(body);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(根)"}: ${issue.message}`)
      .join("; ");
    return fail(400, `请求体不合法：${detail}`);
  }

  let config;
  try {
    config = readProviderConfig();
  } catch (error) {
    if (error instanceof AiError) {
      // 服务端没配好。消息里只有变量名，没有任何密钥
      console.error("[api/personas] 配置错误：", error.message);
      return fail(503, error.message);
    }
    throw error;
  }

  // notes 是 rules.md §6「回退必须打点说明」的落点：悄悄换成占位人设，
  // 会让人对着一桌说话雷同的 AI 找半天 prompt 的毛病。所以它要一路传到界面上
  const notes: string[] = [];
  const personas = await generatePersonas({
    config,
    count: parsed.data.count,
    onNote: (note) => void notes.push(note),
  });

  // 这里没有 502 分支：generatePersonas 不抛，上游挂了它会回退占位人设，
  // 原因在 notes 里。对调用方来说"拿到了一桌能用的人设"永远成立
  return Response.json({ personas, notes });
}
