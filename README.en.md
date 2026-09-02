# Avalon

English | [简体中文](./README.md)

One player, a table of talking AIs.

Avalon is a single-player game built with Next.js. Take a seat and play against AI players, or watch a fully autonomous AI table. The default mock mode is offline and free to run; after configuring an OpenAI-compatible endpoint, each role can use a real model to discuss, vote, and reason.

The project is under active development. Its central concern is not putting the rules into a prompt, but making the boundaries between game rules, hidden information, and AI decisions verifiable.

## Features

- 5–10 player Avalon games with recommended and valid custom role setups
- Single-player and all-AI spectator modes; spectator roles start face down and can be revealed seat by seat
- Chinese and English interfaces with dark and light themes
- Mock and remote AI modes, with OpenAI-compatible providers in remote mode
- Round-by-round timeline, end-game role and mission-card review, and AI reasoning records
- A pure game engine, explicit legal actions, and dedicated information-leak tests

## What makes this implementation different

### A deterministic engine

The engine is a pure state machine:

```ts
reduce(state, action, rng) -> newState
```

It does not make network requests, call an LLM, read the clock, or call `Math.random` directly. Randomness is injected, so the same seed and action sequence always produce the same game. A complete game can be modeled as `seed + action[]`, giving bug reproduction, simulation tests, and full replay a stable foundation.

Rule legality is not delegated to the model either. `getLegalActions` returns only actions the current player may actually take—for example, a good player's choices never contain a mission failure card. The engine rejects illegal actions instead of silently repairing them.

See [State machine design](./docs/state-machine.md) and [Architecture boundaries](./docs/architecture.md) for the detailed design.

### Information isolation is a tested boundary

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

[`view.leak.test.ts`](./src/lib/game/view.leak.test.ts) checks serialized information for every role and view. [`components/leak.test.ts`](./src/components/leak.test.ts) enforces the dependency boundary that keeps private state out of components. Snapshots, rule-level unit tests, and randomized simulated games protect the remaining state-machine invariants. Information leaks often look only like an AI that is “suspiciously accurate,” so these tests are part of game correctness, not an optional extra.

The authoritative rule specification is [currently maintained in Chinese](./docs/rules.md).

## Local development

### Prerequisites

- Node.js 20.9 or later
- pnpm 11.2.2, pinned by the `packageManager` field in `package.json`

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://localhost:3000>. The default mock mode needs no API key and makes no model requests.

### Using a real model

Copy the environment template and fill in your provider settings:

```bash
cp .env.local.example .env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.local.example .env.local
```

At minimum, review `LLM_PROVIDER`, `LLM_API_KEY`, and `LLM_MODEL`. Set `LLM_BASE_URL` for a custom OpenAI-compatible service. [`.env.local.example`](./.env.local.example) documents every field, default, and provider-specific difference.

`NEXT_PUBLIC_AI_MODE=remote` only controls the initially selected mode in a completed build; the setup screen still lets you switch between mock and remote before a game. Every `NEXT_PUBLIC_*` variable is frozen at build time. `LLM_*` variables are read only by the server at runtime—never add the `NEXT_PUBLIC_` prefix to a secret.

> A fully autonomous remote-mode game makes many consecutive model calls. Keep mock mode enabled for everyday development, and run real-model tests only when you explicitly accept their time and cost.

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

Do not pass `LLM_API_KEY` as a build argument. The image uses Next.js standalone output, runs as a non-root user, and listens on `0.0.0.0:3000`. Because the project loads Geist through `next/font/google`, production builds need network access to Google Fonts.

## Documentation

The detailed design documents are currently maintained in Chinese:

- [Avalon rule specification](./docs/rules.md): authoritative rules and edge cases
- [State machine design](./docs/state-machine.md): phase transitions, legal actions, and testing strategy
- [Architecture boundaries](./docs/architecture.md): layering, dependency direction, and why games need no database
- [Roadmap](./docs/todos.md): current progress and planned work
- [Contributing](./CONTRIBUTING.md) · [Security](./SECURITY.md) · [Changelog](./CHANGELOG.md)

## License

This project is licensed under the [MIT License](./LICENSE).
