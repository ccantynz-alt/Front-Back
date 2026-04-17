# Dogfood Migration Plan — 9 Projects → Crontech

**Status:** LOCKED order. Week timing is flexible but sequence is not.
**Authored:** 2026-04-10
**Binding on:** all future Claude sessions planning infrastructure or migration work.

---

## 1. The premise

Crontech launches with **five real production apps already running on it** — case studies no other dev platform has ever launched with. The dogfood migration is not a side project; it is the primary marketing asset and the primary architectural stress test.

Each migration proves a specific substrate capability before a paying customer relies on it.

## 2. The 9 projects

| # | Project | Stack | Role in migration |
|---|---|---|---|
| 1 | Front-Back | Bun + SolidStart + Hono + Drizzle | **IS Crontech** — not a migration target, this IS the platform |
| 2 | MarcoReid.com | Next.js + Prisma + TS + Vercel | Week 1 — dress rehearsal (low risk) |
| 3 | emailed | Bun + Turbo + Drizzle + TS + Vercel | Week 2 — stack-identical dogfood |
| 4 | ledger.ai / Astra | FastAPI + React + Neon + Claude + Plaid + Stripe | Week 3 — polyglot proof #1 (Python) + CFO engine |
| 5 | AI-Immigration-Compliance | FastAPI + vanilla JS + Vercel | Week 4 — polyglot proof #2 + §5A compliance proof |
| 6 | GateTest | React + Node + Claude + Stripe ($29–399 tiers) | Week 5 — revenue-bearing proof (paying Stripe customers migrated without any customer-facing change) |
| 7 | voice | Tauri (Rust) + TS + Vite + Swift iOS | Week 6 — streaming AI stress test (backend only; desktop stays native) |
| 8 | Zoobicon.com | Next.js + React + TS + Vercel | Week 7 — flagship, thesis proof ("our AI website builder runs on our AI-native dev platform") |
| 9 | Esim | Greenfield on Crontech (no prior stack) | Week 8+ — AI-generated eSIM storefront, built directly on Crontech from day one (competitors: Airalo, Holafly, Nomad eSIM, Saily, GigSky, Ubigi — see `docs/strategy/COMPETITOR-FREE-STACK.md` §Esim) |

## 3. Week-by-week execution plan

### Week 0 — Phase 0 infrastructure live

**Preconditions:**
- Hetzner box provisioned (Craig's action)
- Stripe live account confirmed (Craig's action)
- NZ chartered accountant engaged (Craig's action)
- Domains pointed at new DNS authority (Claude's action)

**Deliverables:**
- Base system on Hetzner: Caddy, systemd, backups, firewall, unattended-upgrades
- Data primitives: Postgres 17 + pgvector, Redis 8, MinIO, Ollama
- Substrate abstraction layer (`packages/substrate/`)
- Polyglot runtime host (`packages/substrate/runtime-host/`)
- §5A primitives skeleton: encrypted-at-rest Postgres, hash-chained audit log, WORM file storage
- Secrets management (age-encrypted files or similar — NOT `.env` files for production secrets)
- Deploy pipeline (`.github/workflows/deploy-self-host.yml`)
- Observability: self-hosted Grafana LGTM stack
- Admin area skeleton: Empire Overview + Infrastructure panels

**Exit criteria:**
- A throwaway test app deploys from `git push` → live on Hetzner in under 5 minutes
- TLS valid, auto-renewing via Caddy
- Logs visible in Grafana without SSH
- Rollback command works (under 60s)
- Health check automated

### Week 1 — MarcoReid.com (dress rehearsal)

**Why first:** Lowest traffic, no paying customers, no AI workload, small surface area. If this breaks, nothing catastrophic happens.

**Work required:**
- Port Next.js → SolidStart (OR run Next.js in a Docker container as first polyglot test)
- Port Prisma schema → Drizzle (OR keep Prisma temporarily — this migration is primarily infra, not framework)
- Connect to Crontech's Postgres (managed by substrate layer)
- Set up `marcoreid.crontech.ai` staging URL
- Verify end-to-end functionality
- DNS flip: `marcoreid.com` → Crontech Hetzner box
- Kill Vercel deployment after 72 hours of clean logs

**Substrate capabilities proven:**
- Deploy pipeline works under real load
- TLS works on apex + www
- Postgres substrate works for real app data
- Rollback works

### Week 2 — emailed (stack-identical)

**Why second:** Easiest migration possible. The stack is already Bun + Turbo + Drizzle + TypeScript. This should be mechanical — the hardest migration is the one that's 80% identical and reveals every edge case in the substrate layer.

**Work required:**
- Migrate Turbo monorepo into Crontech's deployment system (possibly as a submodule or separate Crontech-hosted tenant)
- Port Drizzle config to Crontech substrate DB
- Migrate email-specific dependencies (Resend integration already exists)
- Inbound webhooks routed through Caddy → Crontech app
- Admin dashboard deployment
- DNS flip

**Substrate capabilities proven:**
- Monorepo tenant hosting
- Webhook ingestion path
- Email outbound (Resend API proxy)
- Multi-app coexistence on single Hetzner box

### Week 3 — Astra / ledger.ai (polyglot proof #1 + CFO engine)

**Why third — this is critical:** Astra is Python FastAPI. This is Crontech's first polyglot app. The polyglot runtime host in `packages/substrate/runtime-host/` will either work here or force a redesign. Better to discover the redesign on dogfood than on a paying customer.

**Also critical:** Astra is Crontech's target CFO engine (see `docs/cfo/CHARTER.md`). The moment Astra can reconcile Stripe + bank feeds + NZ GST, Crontech's books move off the bridge accountant's back-office tool and onto Astra. This creates the permanent marketing asset: "Crontech's SaaS revenue is managed by Astra, which runs on Crontech."

**Work required:**
- Build Python Docker runtime host (`packages/substrate/runtime-host/python-runtime.ts`)
- Configure Caddy to multiplex Python container on dedicated port range
- Astra reads/writes to Crontech's Postgres via substrate layer
- Plaid credentials stored in secrets management (NOT env files)
- Stripe credentials stored in secrets management
- Mailgun outbound email configured
- Claude API proxy configured
- DNS flip: `ledger.ai` → Crontech Hetzner box

**Substrate capabilities proven:**
- Polyglot runtime host works for Python
- Secrets management handles sensitive credentials (Plaid, Stripe)
- Shared substrate (Postgres) works across runtime boundaries
- Outbound API proxies work

**Blocker to monitor:** If the polyglot runtime host needs more than a week of work, delay Astra migration and spend Week 3 on polyglot infrastructure instead. Do not rush a foundational substrate primitive.

### Week 4 — AI-Immigration-Compliance (polyglot proof #2 + §5A)

**Why fourth:** Back-to-back Python migrations prove the polyglot runtime is real and not an accidental one-off. Also triggers the §5A compliance primitives in practice — immigration records are PII with legal exposure.

**Work required:**
- Reuse polyglot runtime host from Week 3
- §5A.1 implementation: SHA-256 hashing on every document upload, RFC 3161 timestamps on critical events, hash chain for audit log
- §5A.2 implementation: AES-256-GCM encryption at rest for Postgres, AES-256-GCM for MinIO file storage
- §5A.3 implementation: Immutable audit trail with all required fields
- §5A.5 implementation begins: documentation for future SOC 2 audit
- DNS flip

**Substrate capabilities proven:**
- §5A primitives work under real compliance-grade load
- Audit log integrity verified via hash chain
- Encrypted storage verified via key rotation test
- Immigration compliance (first regulated-domain production app) runs on Crontech

**This is the first marketing-ready compliance case study.**

### Week 5 — GateTest (revenue-bearing)

**Why fifth:** GateTest has paying customers. Moving a revenue-bearing app proves Crontech is production-ready for real money. The customer-facing surface must not change — same URL, same login, same experience, different backend.

**Work required:**
- Node.js runtime host (simpler than Python; Bun can run Node code directly)
- Claude API proxy already configured from Astra migration
- Stripe integration already configured
- GitHub OAuth flow migrated
- File storage for QA reports and artifacts (MinIO)
- Background job infrastructure (Temporal or similar)
- Zero-downtime DNS flip with 72-hour rollback window

**Substrate capabilities proven:**
- Crontech can host revenue-bearing production apps without customer-visible disruption
- Background jobs work at production scale
- Large file storage works at production scale

**This becomes the second high-value marketing case study:** "Crontech hosts paying SaaS customers. This one has been running on Crontech for X weeks without a single incident."

### Week 6 — voice backend (streaming AI stress test)

**Why sixth:** Voice-to-text is brutal on backends — high-volume SSE streams, low-latency inference, session state. It stress-tests the AI substrate. The Tauri desktop app and Swift iOS app stay native; only the backend API moves.

**Work required:**
- Streaming inference proxy via substrate AI layer
- SSE stream infrastructure tuning
- Session state management (Redis + Durable Object equivalent)
- WebSocket infrastructure if needed
- Low-latency audio processing path

**Substrate capabilities proven:**
- Streaming AI works under production latency
- SSE infrastructure works at scale
- Multi-client session state works

### Week 7 — Zoobicon.com (flagship, thesis proof)

**Why seventh and last among migrations:** Zoobicon is an AI website builder. Crontech is the AI-native dev platform. If Zoobicon runs on Crontech, the thesis is proved: the tool Crontech targets as its ideal customer is already running on it.

**Work required:**
- Next.js → SolidStart port (this is a significant rewrite)
- Generative UI via Crontech's json-render + Zod component catalog
- Client-side WebGPU inference integration
- AI agent backend
- Full dogfood of every Crontech capability

**Substrate capabilities proven:**
- The entire Crontech stack end-to-end
- WebGPU tier of the three-tier compute model
- Generative UI
- Full AI agent pipeline

**This is launch.** Once Zoobicon is running on Crontech, the public marketing can begin with six live production case studies.

### Week 8+ — Esim (greenfield)

Built directly on Crontech from day one. No migration needed. The easiest kind of dogfood — the one where the wrong tool never touched it.

**Product intent (per `docs/strategy/COMPETITOR-FREE-STACK.md` §Esim):** the most sophisticated AI-generated eSIM storefront on the market. Target competitors to beat on experience, coverage surfacing, and AI-led plan selection: Airalo, Holafly, Nomad eSIM, Saily, GigSky, Ubigi.

**Substrate capabilities proven:**
- Greenfield-on-Crontech developer experience (no prior stack to migrate from — the bar is "does a fresh project feel premium out of the box?")
- AI agent pipeline applied to a consumer-commerce surface (storefront + checkout + plan recommendation)
- Any primitives still missing after Weeks 0–7 surface here as the final gap list

**Out of scope here:** exact feature list, launch geography, and pricing tiers. These are product decisions owned by Craig; this plan locks only the substrate role ("Week 8+ greenfield dogfood") and the competitive frame.

## 4. What each migration adds to Crontech itself

Every dogfood migration is not just a migration — it's a forcing function that adds a substrate primitive to Crontech itself. This is how the platform matures without speculation:

| Week | Primitive forced into existence |
|---|---|
| Week 0 | Base substrate, deploy pipeline, Caddy, Postgres, Redis, MinIO, Ollama |
| Week 1 | Node/TS runtime works under real deployment, DNS flip pattern proven |
| Week 2 | Monorepo tenant hosting, webhook ingestion, multi-app coexistence |
| Week 3 | Polyglot Python runtime, secrets management, outbound API proxies, Stripe + Plaid handling |
| Week 4 | §5A compliance primitives (hash-chained audit log, encrypted-at-rest, WORM storage, PII handling) |
| Week 5 | Revenue-grade zero-downtime migration, background jobs, large file storage |
| Week 6 | Streaming AI infrastructure, SSE at scale, low-latency inference, session state |
| Week 7 | Generative UI, WebGPU tier, full AI agent pipeline |

**By the end of Week 7, Crontech has seven production case studies AND the complete substrate layer, each primitive battle-tested by a real app.**

## 5. Rollback protocol — every migration

Every DNS flip must be reversible within 5 minutes. Rules:

1. Keep the old deployment (Vercel, etc.) running in parallel for 72 hours minimum after DNS flip
2. Monitor error rates, latency, and customer complaints for full 72 hours
3. Have the "flip back" DNS change pre-prepared and ready to execute
4. If any critical metric degrades more than 20% from baseline, roll back immediately
5. Do not kill the old deployment until 72 hours of clean logs

This is doctrine §0.4 (Build-Quality Gate) applied to migrations. No exceptions.

## 6. Dependencies on external factors

The migration plan assumes:
- Hetzner box is provisioned and healthy
- DNS authority has been transitioned (Cloudflare DNS or Bunny DNS — NOT Vercel's managed DNS)
- SSL/TLS via Caddy is working
- NZ chartered accountant is engaged for CFO hands role
- Stripe live account is active
- Backups are tested before any production workload lands

**If any of these are not ready at Week 0, the migration plan delays uniformly — do not skip ahead or rush.**

## 7. Success metrics

At the end of the 7-week migration window:

| Metric | Target |
|---|---|
| Production apps on Crontech | 5–6 |
| Uptime across all migrated apps | ≥99.5% |
| Substrate capabilities shipped | All seven listed above |
| §5A primitives verified | All four core primitives working under real production data |
| Marketing case studies ready | 5–6 one-page case studies with screenshots, metrics, and customer quotes (for paying customers) |
| Craig burnout level | Green on founder protection scorecard (see `docs/strategy/BURNOUT-PROTECTION.md`) |

**Any miss on these metrics triggers a post-mortem and adjustment before public launch.**

## 8. Amendment process

This plan may be amended by Craig with in-session authorization. Sequence changes must consider that each week builds on the previous week's substrate primitives. Do not reorder without checking the "Primitive forced into existence" column — reordering may break dependencies.
