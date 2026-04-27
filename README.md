# Crontech

**The most aggressive full-stack AI-native developer platform ever built.**

One platform. One bill. Zero glue code. Purpose-built for AI website builders and AI video builders to make them faster and more capable than anything else on the market.

> Nobody has combined the most advanced backend + frontend into one unified platform. We sit in pure whitespace. The entire industry is fragmented — backend frameworks over here, frontend frameworks over there, AI bolted on as an afterthought, edge computing treated as a deployment target instead of a compute primitive. We reject all of that. We unify everything into a single, cohesive platform.

---

## What Is Crontech?

Crontech replaces **22+ separate services** with one integrated platform:

| # | Replaces | With |
|---|----------|------|
| 1 | Vercel (frontend hosting) | SolidStart on Cloudflare Pages |
| 2 | Render / Railway (backend) | Hono on Cloudflare Workers |
| 3 | OpenAPI specs (API safety) | tRPC end-to-end type safety |
| 4 | Supabase / PlanetScale (database) | Neon serverless PostgreSQL |
| 5 | — (no equivalent) | Turso edge SQLite embedded replicas |
| 6 | Pinecone (vector DB) | Qdrant |
| 7 | Auth0 / Clerk (auth) | Passkeys + Google OAuth + password |
| 8 | OpenAI API (cloud AI) | AI SDK + Modal.com H100 GPUs |
| 9 | — (no equivalent) | WebLLM + Transformers.js ($0/token client AI) |
| 10 | LangChain (AI agents) | Mastra agents, built in |
| 11 | — (no equivalent) | Generative UI from Zod component catalog |
| 12 | Liveblocks (collaboration) | Yjs CRDTs, native |
| 13 | Pusher / Ably (real-time) | WebSockets + SSE via Hono + Durable Objects |
| 14 | Mux (video) | WebGPU video pipeline, client-side |
| 15 | Datadog (monitoring) | OpenTelemetry + Grafana LGTM stack |
| 16 | LaunchDarkly (feature flags) | Built-in feature flag system |
| 17 | Stripe (billing) | Stripe pre-integrated |
| 18 | GitHub Actions (CI) | Built-in quality gates |
| 19 | — (no equivalent) | Sentinel 24/7 competitive intelligence |
| 20 | shadcn (components) | AI-composable Zod schema components |
| 21 | Tailwind (styling) | Tailwind v4 pre-configured |
| 22 | ESLint + Prettier (code quality) | Biome (100x faster, one tool) |

**Cost if bought separately: $350–600+/month.** Crontech: **$29/seat/month.**

---

## The Three-Tier AI Compute Model

Nobody else has this. AI workloads automatically flow between three compute tiers:

```
CLIENT GPU (WebGPU)  →  EDGE (Cloudflare Workers)  →  CLOUD (Modal.com H100s)
     $0/token              sub-50ms latency              full GPU power
     sub-10ms              lightweight inference          heavy inference + training
     models ≤2B            Workers AI + Hono              Llama 70B, SDXL, fine-tuning
```

- **Client GPU** — WebLLM runs Llama 3.1 8B at 41 tok/s in the browser. Zero cost. Zero latency. Data never leaves the device.
- **Edge** — Cloudflare Workers AI across 330+ cities. Sub-50ms globally.
- **Cloud** — Modal.com H100 GPUs for heavy inference, video processing, and model fine-tuning.

The platform decides where to run each request. The developer doesn't think about infrastructure.

---

## Technology Stack

### Runtime & Backend
| Technology | Role |
|---|---|
| **Bun** | Runtime — 60K+ req/s, 10–20x faster installs, native TypeScript |
| **Hono** | Web framework — 4x faster than Express, runs on every edge platform |
| **tRPC v11** | End-to-end type-safe API — change a type, see errors instantly |
| **Drizzle ORM** | SQL-like TypeScript — 7.4KB bundle, zero generation step |

### Frontend
| Technology | Role |
|---|---|
| **SolidJS + SolidStart** | Fastest reactive framework — true signals, zero virtual DOM |
| **Tailwind v4** | Rust-based CSS engine — 10x faster than v3 |
| **Biome** | Linter + formatter — 100x faster than ESLint + Prettier |

### AI Layer
| Technology | Role |
|---|---|
| **Vercel AI SDK 6** | Universal AI orchestration — streaming, generative UI, 25+ providers |
| **Mastra** | Production AI agents — multi-step, tool-calling, memory |
| **WebLLM** | Client-side LLM inference via WebGPU — $0/token |
| **Transformers.js** | Client-side ML — embeddings, classification, summarization |
| **json-render + Zod** | AI-composable UI — AI generates validated component trees |

### Databases
| Technology | Role |
|---|---|
| **Turso** | Edge SQLite with embedded replicas — 0.02ms reads |
| **Neon** | Serverless PostgreSQL — full SQL power, scale-to-zero |
| **Qdrant** | Vector search — Rust-built, ACORN algorithm, billions of vectors |

### Real-Time Collaboration
| Technology | Role |
|---|---|
| **Yjs (CRDTs)** | Conflict-free real-time editing — humans + AI agents co-create |
| **WebSockets + SSE** | Bidirectional real-time + efficient streaming |

### Infrastructure
| Technology | Role |
|---|---|
| **Cloudflare Workers** | Edge compute — sub-5ms cold starts, 330+ cities |
| **Cloudflare D1/R2/KV** | Edge data layer — SQL, objects, key-value |
| **Modal.com** | Serverless GPU — H100s on demand, scale-to-zero |
| **OpenTelemetry + Grafana** | Full observability — metrics, logs, traces |

### Auth
| Method | Description |
|---|---|
| **Passkeys (WebAuthn/FIDO2)** | Phishing-immune, 17x faster than password + 2FA |
| **Google OAuth 2.0** | One-click sign-in |
| **Email + Password** | Argon2id hashing, complexity enforcement |

---

## Platform Features

### 28 Production Routes

**Marketing & Public**
- `/` — Landing page with hero, features, testimonials, stats
- `/about` — Company mission and platform story
- `/pricing` — 3 tiers (Free / Pro / Enterprise) with comparison table
- `/docs` — Documentation hub with 8 category cards
- `/templates` — Template gallery with 12 templates, filter, search
- `/status` — System status dashboard with 8 services
- `/support` — Help center with FAQ, contact form, community links

**Application**
- `/dashboard` — Mission control with stats, activity feed, quick actions
- `/builder` — Collaborative website builder (multi-user, real-time)
- `/video` — Collaborative video editor with AI assistant, timeline comments
- `/ai-playground` — AI chat interface with model selector, compute tier indicator
- `/database` — SQL query editor with schema viewer
- `/deployments` — Deploy pipeline, domains, env vars, build settings
- `/collab` — Real-time collaboration rooms
- `/settings` — Profile, API keys, notifications, appearance
- `/admin` — User management, system health, quick actions
- `/billing` — Plan display, usage meters, invoice history

**Auth**
- `/login` — Passkeys + Google OAuth + password
- `/register` — Account creation with all 3 auth methods

**Legal** (7 documents, attorney-review ready)
- `/legal/terms` — Terms of Service (16 sections)
- `/legal/privacy` — Privacy Policy (GDPR + CCPA, 13 sections)
- `/legal/acceptable-use` — Acceptable Use Policy
- `/legal/dmca` — DMCA Copyright Policy (17 USC §512)
- `/legal/cookies` — Cookie Policy
- `/legal/sla` — Service Level Agreement (99.9%/99.99% uptime)
- `/legal/ai-disclosure` — AI Transparency Disclosure

### 14 tRPC Router Modules (60+ Procedures)
Auth, users, admin, billing, analytics, API keys, audit logs, collaboration, email, feature flags, notifications, support tickets, tenant management, webhooks.

### 15 Database Tables
Users, credentials, sessions, plans, subscriptions, payments, tenant projects, API keys, webhooks, audit logs, support tickets, support messages, notifications, analytics events.

### AI Capabilities
- **Mastra AI Agents** — orchestrator, site-builder, approval workflow agents
- **RAG Pipeline** — automatic content indexing + retrieval-augmented generation
- **Generative UI** — AI composes validated component trees from Zod schemas
- **Vector Search** — semantic search via Qdrant on all content
- **Client-Side Inference** — WebLLM (Llama 3.1, Phi-3, Gemma) + Transformers.js (embeddings, classification)
- **GPU Workers** — Modal.com inference (Llama 70B, Mixtral, SDXL), video processing, LoRA fine-tuning

### Sentinel — 24/7 Competitive Intelligence
- **GitHub Release Monitor** — tracks 10 competitor repos (Next.js, Remix, SvelteKit, Qwik, Astro, Hono, Solid, tRPC, AI SDK, LangChain)
- **Commit Velocity Tracker** — detects activity spikes (upcoming releases)
- **npm Registry Watcher** — package releases and version bumps
- **Hacker News Scanner** — filtered tech news
- **ArXiv Monitor** — AI/ML paper tracking (cs.AI, cs.LG, cs.CL)
- **Dead-Man's Switch** — alerts if any collector stops reporting

---

## Project Structure

```
crontech/
├── apps/
│   ├── web/                  # SolidStart frontend (28 routes)
│   └── api/                  # Hono + tRPC backend (60+ procedures)
├── packages/
│   ├── ui/                   # Shared component library
│   ├── schemas/              # Zod schemas (AI-composable)
│   ├── ai-core/              # AI inference, agents, RAG, vectors
│   ├── db/                   # Drizzle ORM + migrations
│   └── config/               # Shared TypeScript/Biome config
├── services/
│   ├── sentinel/             # 24/7 competitive intelligence
│   ├── gpu-workers/          # Modal.com GPU worker definitions
│   └── edge-workers/         # Cloudflare Worker scripts
├── scripts/                  # Quality gate scripts
├── e2e/                      # Playwright end-to-end tests
├── infra/                    # Docker, Cloudflare, Terraform
├── CLAUDE.md                 # Development doctrine (the Bible)
└── turbo.json                # Turborepo configuration
```

---

## Getting Started

## 60-second start (minimum env)

The smallest viable env to get `bun install && bun run check && bun test` to green. Copy this into `.env` at the repo root:

```env
# Local SQLite — libsql accepts file: URLs in dev
DATABASE_URL=file:./local.db
DATABASE_AUTH_TOKEN=

# Runtime mode
NODE_ENV=development

# Required by the auth/session layer (generate with: openssl rand -hex 32)
SESSION_SECRET=0000000000000000000000000000000000000000000000000000000000000000
```

Then:

```bash
bun install
bun run check
bun test
```

Full env reference: `.env.example`. Doctrine: `CLAUDE.md`.

### Prerequisites
- [Bun](https://bun.sh) v1.3.9+
- Node.js 20+ (for some tooling)

### Install & Run

```bash
# Install dependencies
bun install

# Run development servers
bun run dev

# Run quality gates
bun run build           # Build all packages
bun run check-links     # Zero dead links
bun run check-buttons   # Zero dead buttons
bun test                # Run test suite (500+ tests)

# Run e2e tests
bunx playwright test
```

### Environment Variables

See the Environment Variables Roadmap in `CLAUDE.md` section 5D for the full list. Key variables:

```env
# Database
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
NEON_DATABASE_URL=

# Auth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
SESSION_SECRET=

# AI
OPENAI_API_KEY=

# Payments
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
```

---

## Quality Gates

Every commit must pass:

| Gate | Command | Status |
|------|---------|--------|
| Build | `bun run build` | 4/4 packages |
| Link checker | `bun run check-links` | 0 dead links |
| Button checker | `bun run check-buttons` | 0 dead buttons |
| Tests | `bun test` | 500+ passing |
| Bundle size | `bun run check-bundle` | < 50KB warning, < 100KB fail |
| Accessibility | `bun run check-a11y` | Critical violations = fail |

---

## Legal

7 attorney-review-ready legal documents covering:
- Terms of Service (binding arbitration, IP ownership, AI terms)
- Privacy Policy (GDPR + CCPA compliant, client-side AI privacy)
- Acceptable Use Policy (AI-specific rules, CSAM zero tolerance)
- DMCA Copyright Policy (17 USC §512 safe harbor)
- Cookie Policy (no ad tracking, GDPR consent)
- Service Level Agreement (99.9%/99.99% uptime tiers)
- AI Transparency Disclosure (three-tier compute, NIST AI RMF, EU AI Act)

---

## Competitive Position

| Dimension | Vercel | Supabase | Cloudflare | Render | **Crontech** |
|---|---|---|---|---|---|
| Frontend | Next.js (React) | — | — | — | **SolidJS (signals, no VDOM)** |
| Backend | Lambda (250ms cold starts) | Deno Edge Fns | Workers (raw) | Containers | **Hono + Workers (sub-5ms)** |
| Database | Neon (managed) | Postgres | D1 (SQLite) | Managed PG | **Turso + Neon + Qdrant** |
| AI | Bolt-on (v0) | pgvector | Workers AI | — | **Three-tier ($0 client + edge + cloud)** |
| Real-time | — | Limited | — | — | **Yjs CRDTs + AI agents** |
| Auth | — | GoTrue | — | — | **Passkeys + OAuth + password** |
| All-in-one | No | No | No | No | **Yes** |

---

## Architecture Principles

1. **AI-native, not AI-bolted.** Every layer has AI woven in from day one.
2. **Edge-first.** Data and compute live next to users, not in distant data centers.
3. **Zero HTML.** Components only. The browser is a render target.
4. **Type-safe everything.** Change a database column, see a frontend type error.
5. **$0/token client AI.** The user's GPU does inference for free via WebGPU.
6. **Self-evolving.** Sentinel monitors competitors 24/7. The platform adapts.

---

## License

Proprietary. All rights reserved. Copyright Crontech Technologies, Inc.

---

> **This is not a framework. This is not a boilerplate. This is a self-evolving technology platform.**
> AI-native. Edge-first. Zero-HTML. 22 services in one.
> Nobody has built this before. Nobody will catch us once we launch.
