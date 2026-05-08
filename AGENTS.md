# AGENTS.md

## Monorepo Overview

This is a Turborepo monorepo with five Next.js apps:

```
apps/
├── home/       Personal home page (zlatkov.ai)
├── skillab/    Skill evaluator + dependency graph (skillab.zlatkov.ai)
├── ai-news/    AI news digest agent (ainews.zlatkov.ai)
├── oss-llms/   OSS LLM pricing tracker (llms.zlatkov.ai)
└── ai-tycoon/  AI economy tycoon game (tycoon.zlatkov.ai)
```

Each app has its own `package.json`, `next.config.ts`, `tsconfig.json`, and `vercel.json` where applicable. They share no code packages — each `lib/` is app-local.

---

## apps/home

Static home page. No API routes, no environment variables at runtime. Links to other apps via `NEXT_PUBLIC_SKILLAB_URL`, `NEXT_PUBLIC_AINEWS_URL`, and `NEXT_PUBLIC_OSSLLMS_URL` (fall back to production URLs).

---

## apps/skillab

Web toolkit for testing and visualising AI Agent Skills (SKILL.md files).

```
apps/skillab/
├── app/
│   ├── page.tsx              # Main UI — skill input, tool selector, config, results
│   ├── layout.tsx
│   ├── globals.css
│   └── api/
│       ├── generate/route.ts # LLM proxy — createModel + generateText
│       └── providers/route.ts # Returns which providers have server-side API keys
└── lib/
    ├── types.ts              # Shared types, provider model presets, constants
    ├── skill.ts              # Skill parser, GitHub fetcher, context builder, dependency graph
    └── engine.ts             # Client-side evaluation pipeline with progress callbacks
```

### Key Design Decisions

- **Browser-first**: Parsing, context building, eval orchestration run client-side. The API route only exists to avoid CORS.
- **Three model roles**: test models (evaluated), generator models (create prompts), judge models (score responses).
- **Mock tools**: For compliance testing, mock tool definitions are injected so models can make real structured tool calls.

### Evaluation Pipeline

**Parse → Build Context → Generate Prompts → Test → Evaluate → Report**

1. `parseSkillContent()` — extracts name, description, body from SKILL.md frontmatter
2. `buildTriggerSystemPrompt()` — mixes target skill with distractor skills in `<available_skills>` XML
3. Generator model creates N positive + N negative test prompts
4. Each prompt → each test model via `/api/generate`
5. Judge model scores trigger accuracy; for triggered positive prompts, compliance is also scored
6. Results rendered per model with trigger/compliance breakdown

### Scoring

`overall = trigger_accuracy × 50 + compliance_accuracy × 30 + avg_compliance_score/100 × 20`

### Environment Variables

| Variable | Required | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | Optional | Server-side key for OpenRouter (users can BYOK) |
| `GROQ_API_KEY` | Optional | Server-side key for Groq |
| `ANTHROPIC_API_KEY` | Optional | Server-side key |
| `NEXT_PUBLIC_HOME_URL` | Dev only | Falls back to `https://zlatkov.ai` |

---

## apps/ai-news


Automated AI industry news digest. An agent runs on a cron schedule, fetches news from multiple sources, and stores scored/categorized results in Supabase.

```
apps/ai-news/
├── app/
│   ├── page.tsx              # Displays latest completed run, grouped by category
│   ├── layout.tsx
│   ├── globals.css
│   └── api/
│       └── cron/route.ts     # Cron endpoint — runs agent, stores results
├── lib/
│   ├── types.ts              # NewsItem, NewsRun, CATEGORIES
│   ├── supabase.ts           # Supabase client (service role)
│   └── agent.ts              # Fetch + LLM scoring logic
└── vercel.json               # Cron schedule: 08:00 and 20:00 UTC daily
```

### How the Agent Works

1. **Parallel fetch** — All sources fire simultaneously:
   - HN Algolia API (50 stories, filtered ≥ 10 points)
   - 10 Brave Search queries (AI-industry keywords, `freshness=pw`)
   - 7 RSS feeds: The Verge, TechCrunch, VentureBeat, a16z, Hugging Face, The Batch, MIT Tech Review
   - X/Twitter API: recent posts from 8 key AI accounts (sama, karpathy, gdb, DarioAmodei, hwchase17, jerryjliu0, rauchg, ilyasut) — skipped if `X_BEARER_TOKEN` is absent
2. **Single LLM call** — All raw results sent to OpenRouter (default: `openrouter/auto`) with a scoring prompt
3. **Structured output** — LLM deduplicates, categorizes, and returns `NewsItem[]` with score ≥ 6
4. **Store** — Results written to Supabase `news_runs` table

This avoids multi-step agent overhead — parallel fetches + one LLM call is fast and deterministic.

### Supabase Schema

```sql
create table news_runs (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  status text not null default 'running',  -- 'running' | 'complete' | 'error'
  items jsonb not null default '[]',
  item_count int not null default 0,
  error text
);
create index news_runs_created_at_idx on news_runs (created_at desc);
```

### Cron Protection

The `/api/cron` endpoint requires `Authorization: Bearer {CRON_SECRET}`. Vercel sends this header automatically for scheduled cron jobs. Manual calls without the secret return 401.

### News Categories

M&A · Funding · Product Launch · Model Release · AI Engineering · Research · Regulation · Partnership · Open Source · Industry

Items are scored 1-10; only score ≥ 6 are stored. Categories are sorted by item count on the page.

### Environment Variables

| Variable | Required | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | Yes | For LLM scoring calls |
| `BRAVE_API_KEY` | Yes | For Brave Search queries |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (server-side only) |
| `CRON_SECRET` | Yes | Protects the cron endpoint |
| `OPENROUTER_MODEL` | No | Override model (default: `openrouter/auto`) |
| `LANGFUSE_PUBLIC_KEY` | No | Fetch system prompt from Langfuse (falls back to hardcoded) |
| `LANGFUSE_SECRET_KEY` | No | Langfuse secret key |
| `X_BEARER_TOKEN` | No | X/Twitter API bearer token (source skipped if absent) |
| `NEXT_PUBLIC_HOME_URL` | Dev only | Falls back to `https://zlatkov.ai` |

---

## apps/oss-llms

Tracks pricing and availability of open-source LLMs across inference providers. A cron job snapshots data daily; the page shows a deduplicated, grouped model list with per-provider pricing.

```
apps/oss-llms/
├── app/
│   ├── page.tsx              # Displays model groups with provider pricing
│   ├── layout.tsx
│   ├── globals.css
│   └── api/
│       └── cron/route.ts     # Fetches all providers, stores snapshot in Supabase
└── lib/
    ├── types.ts              # ModelEntry, ModelSnapshot, CronRun, provider IDs
    ├── fetcher.ts            # Orchestrates 9 parallel provider fetches + dedup merge
    ├── utils.ts              # Model grouping and name-cleaning helpers
    └── providers/            # One file per provider (groq, together, deepinfra, …)
```

### How the Fetcher Works

1. **Parallel fetch** — All 9 provider APIs fire simultaneously: Groq, Together, DeepInfra, Fireworks, Hyperbolic, Cerebras, SambaNova, Novita, OpenRouter
2. **Merge strategy** — Direct provider fetches win over OpenRouter-derived entries (direct APIs have more accurate pricing). Entries are keyed by `(modelId, providerId)`.
3. **Store** — Merged `ModelEntry[]` written to Supabase with a `CronRun` record

### Environment Variables

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (server-side only) |
| `CRON_SECRET` | Yes | Protects the cron endpoint |
| `OPENROUTER_API_KEY` | No | Used by OpenRouter provider fetcher |
| `NEXT_PUBLIC_HOME_URL` | Dev only | Falls back to `https://zlatkov.ai` |

---

## apps/ai-tycoon

Browser-based city-builder tycoon game where the player builds an AI industry. HTML5 Canvas game engine running inside a Next.js shell. All game logic is client-side; the only server route is the AI advisor chat proxy.

```
apps/ai-tycoon/
├── app/
│   ├── page.tsx              # React UI shell — resource bar, build panel, info panel, AI chat
│   ├── layout.tsx
│   ├── globals.css
│   └── api/
│       └── chat/route.ts     # OpenRouter proxy for AI advisor (supports BYOK)
└── lib/
    ├── types.ts              # GameState, PlacedBuilding, Resources, BuildingType, etc.
    ├── constants.ts          # BUILDING_DEFS, PLAYER_BUILDING_ORDER, MAX_RESOURCES, costs
    ├── game.ts               # Game class, createInitialState, city generation, place/demolish
    ├── economy.ts            # tick() — per-building production/consumption, railway bonus
    ├── renderer.ts           # Canvas renderer — terrain, infra auto-tiling, buildings, power wires
    ├── vehicles.ts           # VehicleSystem — trip-based cars, loop buses/trains, bus stops
    ├── input.ts              # InputHandler — mouse/touch/keyboard, drag-to-pan, drag-to-paint
    ├── save.ts               # localStorage save/load (3 slots + auto-save)
    └── ai-commands.ts        # parseCommands, executeCommands, summarizeGameState
```

### Game Architecture

- **Imperative game loop**: `Game` class owns `GameState` and runs a `requestAnimationFrame` loop. React gets UI snapshots via `onUIUpdate` callback (no React state in the hot path).
- **Camera**: world-space tile coordinates; screen = `(world - camera) * TILE_SIZE * zoom + canvas/2`.
- **Tick accumulator**: `tickAcc += dt * speed`; one economy tick fires per 1000ms of accumulated time. Speed multipliers: 0 (pause), 1×, 2×, 5×.
- **Economy**: buildings sorted by id, each checks resource availability, produces/consumes. Resources clamped to `MAX_RESOURCES` caps each tick.

### Buildings

14 building types split into player-buildable and city (builtin, indestructible):

**Player**: HQ, Power Plant, Office, Station, Data Center, Research Lab, GPU Farm, Server Farm, AI Lab  
**City** (pre-generated): city_house, town_hall, city_market, city_station, city_park

Resource chain: Power Plant → energy → Data Center/GPU Farm → compute → Research Lab/AI Lab → data/research → Server Farm/AI Lab → capital.

### Infrastructure

Three infra types painted by drag: `road` ($10/tile), `railway` ($30/tile), `power_line` ($5/tile).  
Auto-tiling uses a 4-bit neighbor mask (N/E/S/W) to draw correct turns.  
Adjacent infra gives buildings +10% efficiency. Power line adjacency is shown as a pulsing amber wire.

### Railway Connectivity

A player Station connected to the city station via continuous railway gets `+STATION_TALENT_BONUS` talent/tick. Checked via BFS each tick.

### Vehicles

- **Cars**: trip-based. Spawn at road-adjacent building, BFS-route to another building, despawn on arrival. Up to 28 simultaneous.
- **Buses**: loop along roads, pause at hardcoded bus stops.
- **Trains**: loop along railway tiles. 4-car consist: locomotive (tapered nose, cab, dome, smokestack) + 3 passenger cars (windows, couplings). Rendered via `ctx.rotate()`.

### AI Advisor

`/api/chat` proxies to OpenRouter. Accepts `userApiKey` (BYOK) and `model` override in the request body. Falls back to `OPENROUTER_API_KEY` env var. The system prompt embeds all building definitions and grid coordinates. Responses can contain a `<commands>[...]</commands>` JSON block that `executeCommands()` applies to the live game state.

Costs 20 Research Points per query, capped at 5 queries/day.

### Environment Variables

| Variable | Required | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | Recommended | Server-side key; users can BYOK via UI |
| `TYCOON_MODEL` | No | Override default model (`meta-llama/llama-3.1-8b-instruct`) |
| `NEXT_PUBLIC_HOME_URL` | No | ← Home link target (falls back to `https://zlatkov.ai`) |
