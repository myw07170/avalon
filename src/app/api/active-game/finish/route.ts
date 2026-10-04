import { activeRoute } from "@/lib/supabase/active-route";
import { finishActiveGame } from "@/lib/supabase/active-games";
export const POST = (request: Request) => activeRoute(request, async user => finishActiveGame(user, await request.json()));
