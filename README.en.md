# Avalon

English | [简体中文](./README.md)

One player, a table of talking AIs.

Avalon is a single-player game built with Next.js. Take a seat and play against AI players, or watch a fully autonomous AI table. The default mock mode is offline and free to run; after configuring an OpenAI-compatible endpoint, each role can use a real model to discuss, vote, and reason.

The project is under active development. Its central concern is not putting the rules into a prompt, but making the boundaries between game rules, hidden information, and AI decisions verifiable.

## Current Status

- Local mock mode works out of the box and needs no account, database, or API key.
- Remote mode requires your own OpenAI-compatible model provider; fully autonomous games can make many model calls.
- Supabase Auth, account credits, and review history are optional deployment capabilities; local development and mock games do not depend on them.
- Production builds load Geist through `next/font/google`, so the build environment must be able to reach Google Fonts.

## Features

- 5-10 player Avalon games with recommended and valid custom role setups
- Single-player and all-AI spectator modes; spectator roles start face down and can be revealed seat by seat
- Chinese and English interfaces with dark and light themes
- Mock and remote AI modes, with OpenAI-compatible providers in remote mode
- Round-by-round timeline, end-game role and mission-card review, and AI reasoning records
- A pure game engine, explicit legal actions, and dedicated information-leak tests

## What Makes This Implementation Different

### A Deterministic Engine

The engine is a pure state machine:

```ts
reduce(state, action, rng) -> newState
```

It does not make network requests, call an LLM, read the clock, or call `Math.random` directly. Randomness is injected, so the same seed and action sequence always produce the same game. A complete game can be modeled as `seed + action[]`, giving bug reproduction, simulation tests, and full replay a stable foundation.

Rule legality is not delegated to the model either. `getLegalActions` returns only actions the current player may actually take, for example, a good player's choices never contain a mission failure card. The engine rejects illegal actions instead of silently repairing them.

See [State machine design](./docs/state-machine.md) and [Architecture boundaries](./docs/architecture.md) for the detailed design.

### Information Isolation Is A Tested Boundary

AI prompts cannot read the complete `GameState`; they can only be built from the current player's `PlayerView`. The UI likewise consumes a projected player or spectator view instead of touching omniscient state directly.

```text
Game engine (GameState)
        │ pure projection
        ▼
PlayerView / SpectatorView
        │
        ├── UI
        └── AI prompt
```

This boundary protects more than role identities:

- Team votes remain hidden until everyone has voted, preventing later AIs from following earlier votes.
- Mission history reveals only the number of failure cards, never who played them; sources appear only in the end-game review.
- Merlin cannot see Mordred, evil players cannot see Oberon, and Percival's two candidates are indistinguishable.
- Components cannot import omniscient state, and prompt construction cannot bypass `PlayerView`.

[`view.leak.test.ts`](./src/lib/game/view.leak.test.ts) checks serialized information for every role and view. [`components/leak.test.ts`](./src/components/leak.test.ts) enforces the dependency boundary that keeps private state out of components. Snapshots, rule-level unit tests, and randomized simulated games protect the remaining state-machine invariants. Information leaks often look only like an AI that is suspiciously accurate, so these tests are part of game correctness, not an optional extra.

The authoritative rule specification is [currently maintained in Chinese](./docs/rules.md).

## Quick Start

### Prerequisites

- Node.js 20.9 or later
- pnpm 11.2.2, pinned by the `packageManager` field in `package.json`

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://localhost:3000>. The default mock mode needs no API key and makes no model requests.

### Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the development server |
| `pnpm build` | Create a production build |
| `pnpm lint` | Run ESLint |
| `pnpm typecheck` | Run the TypeScript type checker |
| `pnpm test` | Run the Vitest suite |
| `pnpm test:cov` | Generate test coverage |

Full games against real models are skipped by default. See the [contribution guide](./CONTRIBUTING.md) for opt-in instructions and cost warnings.

## Configuration

Copy the environment template and fill in the provider settings you need:

```bash
cp .env.local.example .env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.local.example .env.local
```

| Variable | Purpose | Exposure |
| --- | --- | --- |
| `LLM_PROVIDER` | Selects `mock`, `openai`, `deepseek`, `qwen`, or a custom compatible service | Server configuration |
| `LLM_API_KEY` | Model provider key | Secret; never add `NEXT_PUBLIC_` |
| `LLM_BASE_URL` / `LLM_MODEL` | Custom OpenAI-compatible endpoint and model | Server configuration |
| `LLM_EXTRA_BODY` / `LLM_TEMPERATURE` / `LLM_MAX_TOKENS` | Provider-specific request tuning | Server configuration |
| `NEXT_PUBLIC_AI_MODE` | Browser's initial `mock` or `remote` mode | Public; bundled into client code |
| `NEXT_PUBLIC_REQUIRE_AUTH` | Requires login and session checks for `/api/ai` in public deployments | Public switch |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-side Supabase connection values | Public |
| `SUPABASE_SECRET_KEY` | Server-side Supabase secret key | Secret; server only |
| `MAX_AI_CALLS_PER_GAME` | Per-game remote call limit | Server configuration |

The full field list, defaults, and provider-specific notes live in [`.env.local.example`](./.env.local.example).

> A fully autonomous remote-mode game makes many consecutive model calls. Keep mock mode enabled for everyday development, and run real-model tests only when you explicitly accept their time and cost.

## Docker

The default image starts in mock mode and requires no secrets:

```bash
docker build -t avalon .
docker run --rm -p 3000:3000 avalon
```

To make remote the initially selected mode, pass the non-secret public switch at build time and inject server configuration only when the container starts:

```bash
docker build --build-arg NEXT_PUBLIC_AI_MODE=remote -t avalon:remote .
docker run --rm -p 3000:3000 --env-file .env.local avalon:remote
```

Do not pass `LLM_API_KEY` as a build argument. The image uses Next.js standalone output, runs as a non-root user, and listens on `0.0.0.0:3000`.

## Deployment

Local development does not require Supabase. For public remote deployments, enable Supabase Auth and account credits to prevent unauthorized model usage.

See [Vercel + Supabase Deployment](./docs/deploy-vercel-supabase.md).

## Documentation

The detailed design documents are currently maintained in Chinese:

- [Avalon rule specification](./docs/rules.md): authoritative rules and edge cases
- [State machine design](./docs/state-machine.md): phase transitions, legal actions, and testing strategy
- [Architecture boundaries](./docs/architecture.md): layering, dependency direction, and why core games need no database
- [Vercel + Supabase deployment](./docs/deploy-vercel-supabase.md): reference for public remote deployments
- [Contributing](./CONTRIBUTING.md) · [Security](./SECURITY.md) · [Changelog](./CHANGELOG.md)

## License And Citation

This project is licensed under the [Apache License 2.0](./LICENSE).

Avalon was originally created by Yiwen (Lucy). If you copy, distribute, modify, or build on this project, please retain the copyright notice, license text, and attribution information in [`NOTICE`](./NOTICE). If you modify files, note those changes as required by the Apache License 2.0.

If you cite this project in an article, project description, paper, or presentation, please use the citation metadata in [`CITATION.cff`](./CITATION.cff).
