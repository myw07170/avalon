import { ZodError } from "zod";
import { AuthError, requireAuthenticatedUser } from "./auth";
import { ActiveGameError } from "./active-games";
import { InvalidActiveGameSnapshot } from "@/lib/active-game";

export async function activeRoute(request: Request, action: (userId: string) => Promise<unknown>): Promise<Response> {
  let headers: Headers | undefined;
  try {
    const auth = await requireAuthenticatedUser(request);
    headers = auth.responseHeaders;
    headers.set("Cache-Control", "private, no-store");
    return Response.json(await action(auth.userId), { headers });
  } catch (error) {
    const code = error instanceof AuthError ? "AUTH_REQUIRED" : error instanceof ActiveGameError ? error.code : error instanceof ZodError || error instanceof SyntaxError || error instanceof InvalidActiveGameSnapshot ? "INVALID_SAVE" : "SAVE_UNAVAILABLE";
    const status = error instanceof AuthError ? 401 : error instanceof ActiveGameError ? error.status : code === "INVALID_SAVE" ? 400 : 503;
    return Response.json({ code }, { status, headers });
  }
}
