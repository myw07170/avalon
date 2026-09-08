import type { AiErrorCode } from "@/lib/ai/errors";
import { AuthError, requireAuthenticatedUser } from "@/lib/supabase/auth";
import { QuotaError, startGameSession } from "@/lib/supabase/quota";
import { listGameReviewSummaries, ReviewError } from "@/lib/supabase/reviews";

export const maxDuration = 10;

const fail = (status: number, code: AiErrorCode, error: string, headers?: Headers): Response =>
  Response.json({ code, error }, { status, headers });

export async function POST(request: Request): Promise<Response> {
  let auth;
  try {
    auth = await requireAuthenticatedUser(request);
    const gameSessionId = await startGameSession(auth.userId);
    return Response.json({ gameSessionId }, { headers: auth.responseHeaders });
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(401, "AUTH_REQUIRED", "请先登录后再开始远程模型局");
    }
    if (error instanceof QuotaError) {
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
      return fail(503, "CONFIG_MISSING", error.message, auth?.responseHeaders);
    }
    console.error("[api/game-sessions] 读取历史对局失败：", error);
    return fail(503, "CONFIG_MISSING", "无法读取历史对局", auth?.responseHeaders);
  }
}
