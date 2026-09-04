import { NextResponse } from "next/server";
import { createRouteSupabaseClient } from "@/lib/supabase/route";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  const redirectTo = new URL(next, url.origin);

  if (!code) return NextResponse.redirect(new URL("/", url.origin));

  const { supabase, responseHeaders } = createRouteSupabaseClient(request);
  await supabase.auth.exchangeCodeForSession(code);

  return NextResponse.redirect(redirectTo, { headers: responseHeaders });
}
