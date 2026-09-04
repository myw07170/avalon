import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readSupabasePublicConfig, readSupabaseSecretKey } from "./config";

export interface RouteSupabaseClient {
  supabase: SupabaseClient;
  responseHeaders: Headers;
}

export function createRouteSupabaseClient(request: Request): RouteSupabaseClient {
  const { url, publishableKey } = readSupabasePublicConfig();
  const responseHeaders = new Headers();

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get("Cookie") ?? "");
      },
      setAll(cookies) {
        for (const cookie of cookies) {
          responseHeaders.append(
            "Set-Cookie",
            serializeCookieHeader(cookie.name, cookie.value, cookie.options),
          );
        }
      },
    },
  });

  return { supabase, responseHeaders };
}

export function createSupabaseAdminClient(): SupabaseClient {
  const { url } = readSupabasePublicConfig();
  return createClient(url, readSupabaseSecretKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
