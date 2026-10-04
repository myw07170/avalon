import { activeRoute } from "@/lib/supabase/active-route";
import { activeGameCommand, handleSchema } from "@/lib/supabase/active-games";
export const PUT = (request: Request) => activeRoute(request, async user => activeGameCommand(user, "heartbeat", handleSchema.parse(await request.json())));
export const DELETE = (request: Request) => activeRoute(request, async user => activeGameCommand(user, "release", handleSchema.parse(await request.json())));
// sendBeacon on pagehide; it is an optimization, never the only durability path.
export const POST = DELETE;
