import type { AiErrorCode } from "@/lib/ai/errors";
import { AuthError, requireAuthenticatedUser } from "@/lib/supabase/auth";
import { QuotaError, startGameSession } from "@/lib/supabase/quota";
import { listGameReviewSummaries, ReviewError } from "@/lib/supabase/reviews";
import type { LlmSource } from "@/lib/supabase/quota";
import { activeRoute } from "@/lib/supabase/active-route";
import { startActiveGame } from "@/lib/supabase/active-games";

export const maxDuration = 10;

const fail = (status: number, code: AiErrorCode, error: string, headers?: Headers): Response =>
  Response.json({ code, error }, { status, headers });

async function readLlmSource(request: Request): Promise<LlmSource> {
  const raw = await request.text().catch(() => "");
  if (!raw.trim()) return "platform";

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new QuotaError("CONFIG_MISSING", "请求体不是合法 JSON");
  }

  if (typeof body !== "object" || body === null || !("llmSource" in body)) {
    return "platform";
  }
  const llmSource = (body as { llmSource?: unknown }).llmSource;
  if (llmSource === "platform" || llmSource === "user") return llmSource;
  throw new QuotaError("CONFIG_MISSING", "llmSource 必须是 platform 或 user");
}

export async function POST(request: Request): Promise<Response> {
  const candidate: unknown = await request.clone().json().catch(() => null);
  if (candidate && typeof candidate === "object" && "snapshot" in candidate) {
    return activeRoute(request, user => startActiveGame(user, candidate));
  }
  let auth;
  try {
    auth = await requireAuthenticatedUser(request);
    const gameSessionId = await startGameSession(auth.userId, await readLlmSource(request));
    return Response.json({ gameSessionId }, { headers: auth.responseHeaders });
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(401, "AUTH_REQUIRED", "请先登录后再开始远程模型局");
    }
    if (error instanceof QuotaError) {
      if (error.message.includes("llmSource") || error.message.includes("JSON")) {
        return fail(400, "BAD_REQUEST", error.message, auth?.responseHeaders);
      }
      if (error.code === "QUOTA_EXHAUSTED") {
        return fail(402, error.code, "当前账号没有可用对局额度", auth?.responseHeaders);
      }
      if (error.code === "CONFIG_MISSING") {
        return fail(503, error.code, error.message, auth?.responseHeaders);
      }
      return fail(403, error.code, error.message, auth?.responseHeaders);
    }
    console.error("[api/game-sessions] 开局失败：", error);
    return fail(503, "CONFIG_MISSING", "无法创建远程模型对局", auth?.responseHeaders);
  }
}

export async function GET(request: Request): Promise<Response> {
  let auth;
  try {
    auth = await requireAuthenticatedUser(request);
    const summaries = await listGameReviewSummaries(auth.userId);
    return Response.json({ reviews: summaries }, { headers: auth.responseHeaders });
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(401, "AUTH_REQUIRED", "请先登录后再查看历史对局");
    }
    if (error instanceof ReviewError) {
      if (error.code === "SCHEMA_MISSING") {
        console.warn("[api/game-sessions] 复盘历史表结构未就绪：", error.message);
        return Response.json({ reviews: [] }, { headers: auth?.responseHeaders });
      }
      return fail(503, "CONFIG_MISSING", error.message, auth?.responseHeaders);
    }
    console.error("[api/game-sessions] 读取历史对局失败：", error);
    return fail(503, "CONFIG_MISSING", "无法读取历史对局", auth?.responseHeaders);
  }
}
