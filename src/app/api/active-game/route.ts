import { z } from "zod";
import { activeRoute } from "@/lib/supabase/active-route";
import { activeGameCommand, activeSummary, saveActiveGame } from "@/lib/supabase/active-games";

export const GET = (request: Request) => activeRoute(request, async user => ({ summary: await activeSummary(user) }));
export const PUT = (request: Request) => activeRoute(request, async user => saveActiveGame(user, await request.json()));
export const DELETE = (request: Request) => activeRoute(request, async user => {
  const input = z.object({ gameId: z.string().uuid(), takeover: z.literal(true) }).parse(await request.json());
  return activeGameCommand(user, "abandon", input);
});
