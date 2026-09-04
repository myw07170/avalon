"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readSupabasePublicConfig } from "./config";
import { supabaseCookieOptions } from "./cookies";

let browserClient: SupabaseClient | null = null;

export function createSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;
  const { url, publishableKey } = readSupabasePublicConfig();
  browserClient = createBrowserClient(url, publishableKey, {
    cookieOptions: supabaseCookieOptions,
  });
  return browserClient;
}
