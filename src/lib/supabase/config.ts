export const isClientAuthRequired =
  process.env.NEXT_PUBLIC_REQUIRE_AUTH === "true";

export function isAuthRequired(): boolean {
  return process.env.NEXT_PUBLIC_REQUIRE_AUTH === "true";
}

export function readSupabasePublicConfig(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error("缺少 NEXT_PUBLIC_SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }

  return { url, publishableKey };
}

export function readSupabaseSecretKey(): string {
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey) {
    throw new Error("缺少 SUPABASE_SECRET_KEY");
  }
  return secretKey;
}
