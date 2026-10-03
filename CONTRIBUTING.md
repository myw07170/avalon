# Contributing to Avalon

Thanks for helping improve Avalon. Changes are easiest to review when they preserve the project's central guarantees: deterministic game rules and strict isolation of hidden information.

## Set up the project

You need Node.js 20.9 or later and pnpm 11.2.2.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

The application defaults to mock mode. It needs no API key, makes no model requests, and should be used for ordinary development and automated tests.

To test a real provider, copy `.env.local.example` to `.env.local` and follow the comments in that file. Never commit `.env.local` or put an API key in a `NEXT_PUBLIC_*` variable.

## Understand the boundaries first

Read the relevant design document before changing behavior:

- [`docs/rules.md`](./docs/rules.md) is the authoritative game specification. If a rule is missing or ambiguous, update the specification before changing the engine.
- [`docs/state-machine.md`](./docs/state-machine.md) defines phases, transitions, legal actions, player views, and the testing strategy.
- [`docs/architecture.md`](./docs/architecture.md) defines dependency direction and the separation between the engine, AI, UI, and future operations code.

The practical rules are:

- Keep the engine pure. It must not fetch, call an LLM, read the clock, or use an implicit random source.
- Build AI requests only from `PlayerView`; never pass a complete `GameState` into prompt code.
- UI components consume projected views and public atoms. Do not import private engine state to make a component convenient.
- Derive available moves from `getLegalActions`, and reject illegal actions explicitly.
- Keep Chinese and English UI copy in sync and extend the catalog/smoke tests when adding messages.
- For Next.js changes, read the matching guide in `node_modules/next/dist/docs/`; this pinned Next.js version may differ from older public examples.

## Run the checks

Before opening a pull request, run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm build` downloads Geist through `next/font/google`, so it requires access to Google Fonts.

Snapshot changes are review material, not disposable output. Inspect why each value changed before accepting an update; for intentional updates, use `pnpm exec vitest run -u` and include the snapshot diff in the pull request.

### Real-model tests

The full-game provider test is skipped unless `LLM_REAL_GAME=1` is set. It makes real API calls, can take several minutes, and costs money. Configure `.env.local`, opt in explicitly, and run only the targeted file:

```bash
LLM_REAL_GAME=1 pnpm exec vitest run src/lib/ai/real-game.test.ts
```

On PowerShell:

```powershell
$env:LLM_REAL_GAME = "1"
pnpm exec vitest run src/lib/ai/real-game.test.ts
Remove-Item Env:LLM_REAL_GAME
```

Do not enable this switch in the default test script or in unbudgeted CI jobs. Generated transcripts live under the ignored `transcripts/` directory and may contain real model output; review them before sharing.

## Pull requests

Keep each change focused and explain the behavior being protected, especially for engine or visibility changes. A pull request should:

- include tests for new rules, transitions, view fields, and leak boundaries;
- preserve or deliberately update Chinese and English behavior;
- document new configuration without committing secrets;
- call out intentional snapshot changes and any real-model validation performed;
- pass lint, type checking, unit tests, and the production build.

## Contribution license

Unless explicitly stated otherwise, any contribution intentionally submitted for inclusion in Avalon is provided under the [Apache License 2.0](./LICENSE).

Security vulnerabilities should not be filed as public issues. Follow [`SECURITY.md`](./SECURITY.md) instead.
