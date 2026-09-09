# Vercel + Supabase Deployment

目标栈：

- GitHub private repository: `myw07170/avalon`
- Vercel Hobby
- Supabase Free
- Email + password auth with email confirmation
- One free remote-model game per account

## Supabase

1. Create a Supabase Free project.
2. In **Project Settings > API**, copy:
   - Project URL -> `NEXT_PUBLIC_SUPABASE_URL`
   - publishable key -> `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - secret key -> `SUPABASE_SECRET_KEY`
3. In **SQL Editor**, run every SQL file in [`supabase/migrations`](../supabase/migrations)
   in filename order. Do not stop after the first migration; later files add production
   schema used by released features such as replay history.
4. In **Authentication > Providers**, enable Email.
5. In **Authentication > Sign In / Providers**, enable email confirmation.
6. After the first Vercel deployment, set:
   - Site URL: the production Vercel URL
   - Redirect URLs: production URL, `https://<your-domain>/auth/callback`, and `http://localhost:3000/**`
7. Run Supabase Security Advisor and fix any reported issue before sharing the deployment.

## Vercel

Import `https://github.com/myw07170/avalon.git` into a personal Vercel Hobby account.

Use:

- Framework Preset: Next.js
- Production Branch: `main`
- Build Command: `pnpm build`

Production environment variables:

```dotenv
NEXT_PUBLIC_AI_MODE=remote
NEXT_PUBLIC_REQUIRE_AUTH=true
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
LLM_PROVIDER=
LLM_API_KEY=
LLM_MODEL=
LLM_BASE_URL=
LLM_EXTRA_BODY=
LLM_MAX_TOKENS=
LLM_TIMEOUT_MS=
LLM_MAX_RETRIES=2
MAX_AI_CALLS_PER_GAME=250
```

`LLM_BASE_URL`, `LLM_EXTRA_BODY`, `LLM_MAX_TOKENS`, and `LLM_TIMEOUT_MS` are optional unless your chosen provider/model needs them.

For Qwen/DashScope-compatible production deployments, prefer:

```dotenv
LLM_TEMPERATURE=default
LLM_EXTRA_BODY={"enable_thinking":false}
LLM_MAX_TOKENS=700
LLM_TIMEOUT_MS=18000
LLM_MAX_RETRIES=2
```

If a Qwen model rejects `enable_thinking`, use `LLM_EXTRA_BODY={"thinking_budget":0}` instead. Do not use OpenAI's `{"reasoning_effort":"minimal"}` with Qwen/DashScope-compatible endpoints.

Vercel only applies environment variable changes to new deployments. After changing Supabase Auth URLs or Vercel env vars, redeploy.

## Manual Acceptance

- Sign up with email and password.
- Confirm the email from the mailbox.
- Sign in.
- Start one remote game successfully.
- Refresh the page and continue the same session.
- Try starting a second remote game; it should be blocked because the free credit is already spent.
- Sign out; `/api/ai` should reject calls without a valid session.
