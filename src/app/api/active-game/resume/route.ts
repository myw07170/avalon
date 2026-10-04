import { activeRoute } from "@/lib/supabase/active-route";
import { resumeActiveGame } from "@/lib/supabase/active-games";
export const POST = (request: Request) => activeRoute(request, async user => resumeActiveGame(user, await request.json()));
