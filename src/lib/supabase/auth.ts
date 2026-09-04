import { createRouteSupabaseClient } from "./route";

export interface AuthenticatedUser {
  userId: string;
  email: string | null;
  responseHeaders: Headers;
}

export class AuthError extends Error {
  constructor(message = "AUTH_REQUIRED") {
    super(message);
    this.name = "AuthError";
  }
}

export async function requireAuthenticatedUser(request: Request): Promise<AuthenticatedUser> {
  const { supabase, responseHeaders } = createRouteSupabaseClient(request);
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims.sub) {
    throw new AuthError(error?.message);
  }

  const email = data.claims.email;

  return {
    userId: data.claims.sub,
    email: typeof email === "string" ? email : null,
    responseHeaders,
  };
}
