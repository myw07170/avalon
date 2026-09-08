import type { AiErrorCode } from "@/lib/ai/errors";
import { isSavedReviewSnapshot } from "@/lib/reviews";
import { AuthError, requireAuthenticatedUser } from "@/lib/supabase/auth";
import { readGameReview, ReviewError, saveGameReview } from "@/lib/supabase/reviews";

export const maxDuration = 10;

const fail = (status: number, code: AiErrorCode, error: string, headers?: Headers): Response =>
  Response.json({ code, error }, { status, headers });

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  let auth;
  try {
    auth = await requireAuthenticatedUser(request);
    const { id } = await context.params;
    const review = await readGameReview(auth.userId, id);
    return Response.json({ review }, { headers: auth.responseHeaders });
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(401, "AUTH_REQUIRED", "请先登录后再查看复盘");
    }
    if (error instanceof ReviewError) {
      return fail(
        error.code === "NOT_FOUND" ? 404 : 503,
        "CONFIG_MISSING",
        error.message,
        auth?.responseHeaders,
      );
    }
    console.error("[api/game-sessions/review] 读取复盘失败：", error);
    return fail(503, "CONFIG_MISSING", "无法读取复盘", auth?.responseHeaders);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  let auth;
  try {
    auth = await requireAuthenticatedUser(request);
    const { id } = await context.params;
    const body: unknown = await request.json().catch(() => null);
    const snapshot =
      typeof body === "object" && body !== null && "review" in body
        ? (body as { review: unknown }).review
        : null;

    if (!isSavedReviewSnapshot(snapshot)) {
      return fail(400, "BAD_REQUEST", "复盘快照不合法", auth.responseHeaders);
    }

    const saved = await saveGameReview({
      userId: auth.userId,
      sessionId: id,
      snapshot,
    });
    return Response.json(saved, { headers: auth.responseHeaders });
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(401, "AUTH_REQUIRED", "请先登录后再保存复盘");
    }
    if (error instanceof ReviewError) {
      return fail(
        error.code === "NOT_FOUND" ? 404 : 503,
        "CONFIG_MISSING",
        error.message,
        auth?.responseHeaders,
      );
    }
    console.error("[api/game-sessions/review] 保存复盘失败：", error);
    return fail(503, "CONFIG_MISSING", "无法保存复盘", auth?.responseHeaders);
  }
}
