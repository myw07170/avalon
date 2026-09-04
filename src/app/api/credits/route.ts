import type { AiErrorCode } from "@/lib/ai/errors";
import { AuthError, requireAuthenticatedUser } from "@/lib/supabase/auth";
import { QuotaError, readUserCredits } from "@/lib/supabase/quota";

export const maxDuration = 10;

const fail = (status: number, code: AiErrorCode, error: string, headers?: Headers): Response =>
  Response.json({ code, error }, { status, headers });

export async function GET(request: Request): Promise<Response> {
  let auth;
  try {
    auth = await requireAuthenticatedUser(request);
    const credits = await readUserCredits(auth.userId);
    return Response.json(credits, { headers: auth.responseHeaders });
  } catch (error) {
    if (error instanceof AuthError) {
      return fail(401, "AUTH_REQUIRED", "请先登录后再查看额度");
    }
    if (error instanceof QuotaError) {
      return fail(503, error.code, error.message, auth?.responseHeaders);
    }
    console.error("[api/credits] 读取额度失败：", error);
    return fail(503, "CONFIG_MISSING", "无法读取账号额度", auth?.responseHeaders);
  }
}
