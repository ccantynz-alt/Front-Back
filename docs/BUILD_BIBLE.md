# BUILD BIBLE — Crontech

> **Doctrine. Locked by Craig.**
> Every block below is a contract. Locked blocks cannot be modified,
> undone, reverted, renamed, or "refactored away" without Craig's
> explicit in-chat authorization. Any agent that violates this is
> in doctrine breach; the next session will see it in git log
> and revert.
>
> This file is mandatory reading at the start of **every** Claude
> session in the Crontech repo. See `CLAUDE.md` §0.9.
>
> Companion doctrine: `CLAUDE.md`, `docs/POSITIONING.md`, `HANDOFF.md`.

---

## Why this file exists

Craig has many products downstream of Crontech (GateTest, Gluecron,
Zoobicon, GateTest-backed onboarding for his other sites). When
sessions drift — when one agent rewrites what the previous agent
just shipped, when positioning gets muddied, when "compliance-native
for AI SaaS" creeps back into a landing page that was already
corrected to "the developer platform for the next decade" — those
downstream products bleed.

The Build Bible stops the drift. Every block is either **set in
concrete** (locked) or **in motion** (building / planned). Locked
blocks are off-limits. In-motion blocks can only be advanced along
the scoped path, never redirected sideways.

---

## How to read this file

Every unit of work in Crontech is a **block**. Each block has:

- **ID** — stable identifier (`BLK-007`). Never renumbered.
- **Status**:
  - 🟢 SET — set in concrete. Locked. No changes without Craig's auth.
  - 🟡 BUILDING — actively being built this sprint.
  - 🔵 PLANNED — scoped, not yet started.
  - ⚫ PAUSED — started, currently on hold.
  - ✅ SHIPPED — merged to main, verified live, now functionally locked.
- **Scope** — what is in the block.
- **Non-scope** — what is explicitly NOT in the block (prevents scope creep).
- **Exit criteria** — objective and verifiable. Either met or not.
- **Lock clause** — present on 🟢 and ✅ blocks. Reiterates the authorization rule.

When a 🟡 BUILDING block meets its exit criteria and passes GateTest
(once BLK-007 is live), its status flips to ✅ SHIPPED in the same
PR that merges the block. SHIPPED blocks inherit the same lock as
🟢 SET.

---

## Locked blocks — DO NOT MODIFY WITHOUT CRAIG'S AUTHORIZATION

### BLK-001 — Positioning 🟢 SET

**Scope.** Crontech's audience, tone, and headline as defined in
`docs/POSITIONING.md`. Universal audience, polite tone (no named
competitors in public copy), headline "The developer platform for
the next decade."

**Non-scope.** Vertical-specific product copy. Named-competitor
comparisons in public-facing pages. Any pivot away from a unified
developer platform.

**Exit criteria.** `docs/POSITIONING.md` exists, is read by every
agent writing marketing copy, and is cited in PR descriptions when
copy changes.

**Lock clause.** Any deviation from `docs/POSITIONING.md` requires
Craig's explicit in-chat authorization. Any PR that silently changes
positioning is to be reverted on sight.

---

### BLK-002 — Platform stack 🟢 SET

**Scope.** The arsenal as defined in `CLAUDE.md` §3:

- **Runtime.** Bun, Hono, Axum (Rust), tRPC v11, Drizzle.
- **Frontend.** SolidJS + SolidStart, Tailwind v4, WebGPU
  (PixiJS + Use.GPU), Motion, R3F + Drei, Biome.
- **AI.** Vercel AI SDK 6, LangGraph, Mastra, json-render + Zod,
  WebGPU + WebLLM, Transformers.js v4.
- **Data.** Turso (primary), Neon (serverless Postgres), Qdrant (vectors).
- **Infra.** Cloudflare Workers + D1/R2/KV/DO, Modal.com GPUs,
  Fly.io long-lived processes, Vultr (current production host).
- **Auth.** Passkeys/WebAuthn, Google OAuth, username/password, TOTP planned.
- **Real-time.** WebSockets + SSE, Yjs CRDTs, Liveblocks.
- **Observability.** OpenTelemetry + Grafana LGTM stack.

**Non-scope.** Swapping out any of the above for a competitor
framework or runtime without review. One-shot experiments in other
stacks.

**Exit criteria.** `CLAUDE.md` §3 is the single source of truth.
Every new dependency is justified against it.

**Lock clause.** Replacing a first-class stack element (SolidJS →
Svelte, Hono → Express, Turso → PlanetScale, etc.) is a CLAUDE.md
§0.7 hard gate and requires Craig's explicit authorization.

---

### BLK-003 — Landing page copy + information architecture 🟢 SET

**Scope.** `apps/web/src/routes/index.tsx` IA:

- Hero with announcement badge, H1 "The developer platform for the
  next decade.", subhead, primary CTA "Start building →", secondary
  CTA "See the docs", tech stack strip.
- Stats strip (4 tiles).
- "Every layer your app needs, in one product" (6 feature cards:
  Edge Compute, Unified Data, Type-Safe APIs, Real-Time Layer,
  AI Runtime, Auth + Admin).
- "Move your app to Crontech in three steps" (Connect → Compose → Ship).
- Tech pillars (3 cards).
- Bottom CTA.

**Non-scope.** Changing the H1. Changing the section order without
reason. Adding vertical-specific language ("compliance-native for
AI SaaS", "for lawyers", "for accountants" — all rejected). Naming
competitors in copy.

**Exit criteria.** Page renders the above on `main` at `https://crontech.ai/`.
Link + button checkers green.

**Lock clause.** The H1, CTAs, and six-card IA are locked. Visual
polish (BLK-008) may restyle them, but the words and structure
stay. Any rewrite of the hero sentence requires Craig's auth.

---

### BLK-004 — Three-tier compute model 🟢 SET

**Scope.** `CLAUDE.md` §4.1:

1. **Client GPU** via WebGPU + WebLLM + Transformers.js. $0/token.
2. **Edge** via Cloudflare Workers + Workers AI + Hono. Sub-5ms.
3. **Cloud** via Modal.com H100/A100. Scale-to-zero.

Routing is automatic based on model size, device capability, and
latency requirements. Tier selection is visible to users (see
the compute-tier pill in `apps/web/src/routes/builder.tsx`).

**Non-scope.** Hard-coded tier selection that bypasses the router.
Single-tier compute models.

**Exit criteria.** A prompt entered on `/builder` reports which
tier served it and the cost. Router code under
`apps/web/src/lib/ai-client.ts`.

**Lock clause.** Removing any of the three tiers, or collapsing
them, requires Craig's auth. This is the architectural moat.

---

### BLK-005 — Auth model 🟢 SET

**Scope.** `CLAUDE.md` §3 "Auth & Security":

- Passkeys / WebAuthn (FIDO2) — primary.
- Google OAuth 2.0 — social fallback.
- Username + password — traditional fallback, bcrypt/Argon2 hashing.
- 2FA / TOTP — planned, not yet shipped.
- Zero-trust between services.

**Non-scope.** Magic-link-only auth (rejected — doesn't meet AAL2).
Password-only auth (rejected — fails CLAUDE.md §5A.1 standards).
Removing passkey support.

**Exit criteria.** User can register, sign in with passkey, sign in
with Google, sign in with username/password. Route `/login` and
`/register` live.

**Lock clause.** Adding a new auth provider or changing the primary
method is a CLAUDE.md §0.7 hard gate.

---

### BLK-006 — Composer (internal dev tool, formerly "AI Builder") 🟢 SET

**Scope.** `apps/web/src/routes/builder.tsx` is the **Component
Composer** — an internal dev tool that generates SolidJS component
trees from prompts using the three-tier compute router. It is NOT
a customer-facing AI website builder. Nav label is "Composer".

**Non-scope.** Re-framing this route as "AI Website Builder" or
targeting non-developers. Naming any competitor product in the UI.

**Exit criteria.** Route framing, labels, and copy match the
"Component Composer" identity. No "AI Website Builder" strings
remain on the page.

**Lock clause.** Re-labelling this route, or pitching it to
non-developers, violates BLK-001 (Positioning) and requires Craig's
auth.

---

## Active blocks (in motion this sprint)

### BLK-007 — GateTest as required PR gate 🟡 BUILDING

**Scope.** Wire `ccantynz-alt/GateTest` into Crontech CI so every
PR is scanned before it can merge to `main`:

- Add `ANTHROPIC_API_KEY` as a repo secret (Craig).
- Upgrade `.github/workflows/ci.yml` GateTest step to run with
  the Claude key, emit SARIF + JSON reports, upload them as
  workflow artifacts, and surface SARIF in GitHub Code Scanning.
- Add a repo-root `gatetest.config.json` with sensible defaults
  (visual, accessibility, liveCrawler, aiReview, fakeFixDetector
  modules enabled).
- **First sprint: report-only** (`continue-on-error: true`). Observe
  output on 2 PRs. Then flip to hard gate (`continue-on-error: false`)
  and add GateTest to branch protection's required-checks list.

**Non-scope.** Replacing the link-checker / button-checker / Biome /
tsc gates (they stay). Publishing a fork of GateTest. Paying for
the `Scan + Fix` tier yet.

**Exit criteria.**
1. `.github/workflows/ci.yml` runs GateTest with `ANTHROPIC_API_KEY`.
2. `gatetest.config.json` committed.
3. Two PRs observed in report-only mode; output reviewed.
4. `continue-on-error: false` flipped on the GateTest step.
5. GateTest listed in `main` branch protection as a required check.
6. `CLAUDE.md` §0.4 build-quality gate table includes GateTest row.

**Progression flip.** Once flipped, BLK-007 becomes ✅ SHIPPED and
is locked like any other 🟢 block.

---

### BLK-008 — Visual design system (Stripe direction) 🟡 BUILDING

**Scope.** Retire the default "cyberpunk-dark" aesthetic. Move
Crontech's storefront to a Stripe-direction premium developer-
platform look:

- **Light-first** surface palette (near-white primary, cream/ivory
  sections, optional dark mode layered on top — not the other way
  round).
- **Typographic hierarchy.** Real H1/H2/H3 contrast. Generous line
  height. Restrained accent use.
- **Restrained accents.** Keep the locked violet / cyan / emerald
  palette (`ACCENT.violet #8b5cf6`, `ACCENT.cyan #06b6d4`,
  `ACCENT.emerald #10b981`) but apply at 10–30 % of the surface
  they currently occupy — accents, not backgrounds.
- **Real buttons.** Primary CTA is a solid button with padding,
  shadow, hover elevation. Secondary is outlined. No CTAs that
  render as flat text links.
- **Proper spacing system.** 8-pt grid, consistent gap tokens.
  Nav items spaced at minimum `gap-6`. No bunched items.
- **Fix known bugs from Craig's iPad screenshot:** nav bunching,
  clipped `CORE` badge, `Learn more →` glyph rendering, unstyled
  hero CTAs.

**Non-scope.** Rewriting H1 or subhead (BLK-003 locks those).
Changing the six-card IA. Replacing Tailwind. Adding a third
aesthetic direction alongside light + dark.

**Exit criteria.**
1. Light mode is the default rendered palette; dark mode toggle works.
2. Desktop + tablet + mobile screenshots match Stripe-grade
   premium feel (subjective, but verifiable by Craig).
3. GateTest visual + accessibility modules pass.
4. All four iPad-screenshot bugs fixed and verified.
5. Bundle size within CLAUDE.md §6.6 budget.

**Ship gate.** No merge to `main` until Craig has seen
desktop + tablet + mobile screenshots in chat and said yes.
This is the promise to Craig from 14 April 2026.

---

## Planned blocks (priority order)

### BLK-009 — Git-push deploy pipeline for customer repos 🔵 PLANNED

**Scope.** The Vercel/Render parity feature. A customer connects
their GitHub repo → we receive push webhooks → we build in a
sandboxed worker → we stream logs to a browser panel → we deploy
**onto the Crontech edge runtime (BLK-017) running on our own
multi-region nodes** → we update their project's `*.crontech.app`
subdomain.

Components:
- GitHub App (install flow under `/dashboard/projects/new`).
- Webhook receiver at `apps/api` with signature verification.
- Build worker (initial: Cloudflare Container as interim while
  BLK-017 lands; final: our own per-tenant Fly.io / Hetzner
  microVM. **Net direction: off Cloudflare, onto our infra.**).
- Log streamer via SSE to the project's live logs page.
- **Crontech edge deployer** (final). Wrangler-based deployer
  acceptable as interim ONLY if BLK-017 is not yet live.
- Per-project subdomain routing via our own DNS (BLK-019 +
  `services/dns-server`).

**Non-scope.** Non-GitHub providers (GitLab, Bitbucket) in v1.
Paid build minutes billing (that's BLK-010). **Long-term hard
dependency on Cloudflare Workers as the only deploy target —
BLK-009 must ship a path that runs on Crontech's own runtime by
the time it flips to ✅ SHIPPED.**

**Exit criteria.** Craig can point a test repo at crontech.ai,
click deploy, see live logs, and load the resulting site **served
from the Crontech edge runtime** (or, in the interim window
before BLK-017 GA, from a Cloudflare Container clearly flagged
as transitional in the deploy log).

---

### BLK-010 — Stripe metered billing 🔵 PLANNED

**Scope.** Real revenue loop. Stripe Checkout for subscription
tiers (Free / Pro / Team), usage events for metered resources
(build minutes, edge requests, AI tokens), invoice UI, webhook
receiver, grace-period + dunning flow.

**Non-scope.** Custom billing engine (we use Stripe as-is). Offline
payment methods. Crypto payments.

**Exit criteria.** Craig can purchase a Pro plan with a real card,
see the invoice, see usage accrue, and cancel / downgrade.

---

### BLK-011 — CRDT collaboration production 🔵 PLANNED

**Scope.** Promote the current Yjs prototype to production-grade:
Durable Object persistence, room provisioning, presence, cursor
positions, access control per room, reconnection handling.

**Non-scope.** Operational-Transform fallback. Non-Yjs providers.

**Exit criteria.** Two users + one AI agent edit the same Composer
document simultaneously, reload the page, and state persists
without data loss.

---

### BLK-012 — Database inspector UI 🔵 PLANNED

**Scope.** Read-only Turso + Neon browsers at `/database`. List
tables, run bounded queries, view rows. Per-project isolation.

**Non-scope.** Write access from the UI in v1. Schema migrations
from the UI.

---

### BLK-013 — Admin dashboard with real data 🔵 PLANNED

**Scope.** Replace every `mock` data source in
`apps/web/src/routes/admin/*` with live tRPC queries. Users,
sessions, audit logs, billing status, system health.

**Non-scope.** New admin features beyond the existing routes.

---

### BLK-014 — Observability (Grafana LGTM dashboard, self-hosted) 🔵 PLANNED

**Scope.** Deploy Grafana + Loki + Tempo + Mimir **on Crontech's
own infrastructure** (Vultr / Hetzner / our edge nodes — never
Grafana Cloud or any vendor-hosted observability tier). Point the
existing OTel instrumentation at them. Build a single dashboard
covering edge / cloud / client metrics + AI inference cost and
latency.

**Non-scope.** Proprietary APM (Datadog, New Relic) in v1.
**Grafana Cloud or any other vendor-hosted observability service
— self-sufficiency rule: we do not consume what we are positioned
to replace.** Anything pushing telemetry off our boxes to a
third-party SaaS observability vendor is out of scope and will
be reverted on sight.

---

### BLK-015 — Sentinel live service 🔵 PLANNED

**Scope.** Move `services/sentinel/` from file-based intelligence
store to a long-running daemon (Fly.io microVM) that posts to
Slack `#sentinel-critical` / `#sentinel-daily` / `#sentinel-weekly`.
Dead-man's switch.

**Non-scope.** Paid tier integrations (Brand24, Semrush) in v1.

---

### BLK-016 — Gluecron integration 🔵 PLANNED

**Scope.** Coordinate with `ccantynz-alt/Gluecron.com` (Craig's
self-hosted git + CI replacement) so Crontech can eventually be
deployed / PR-managed via Gluecron instead of GitHub. Requires
Gluecron API surface to exist first.

**Non-scope.** Removing GitHub integration. Forking GitHub Actions.

---

## Mega-platform parity blocks (BLK-017..BLK-033)

Authorized by Craig 2026-04-26 with the directive *"absolutely all
systems go please don't stop until finished"* on the build plan
posted in chat. Every block below is a vendor-retirement move
mapped to `docs/COMPETITIVE_REALITY.md` and
`docs/CLOUDFLARE_PARITY_AUDIT.md`. Each is 🔵 PLANNED until a
session promotes it to 🟡 BUILDING with Craig's chat-level
greenlight per the Amending-this-file protocol.

The grouping below mirrors the parity audit so the link from
"competitor product" → "Crontech block" stays one click long.

### Cloudflare-class blocks (compute + edge + storage + security)

---

### BLK-017 — Crontech Edge Runtime (V8-isolate, Workers-class) 🟡 BUILDING (v0 in repo)

**Scope.** Self-hosted V8-isolate edge runtime running on our
own multi-region nodes (initial: a single Hetzner / Vultr
region; v1: 3+ regions with Anycast routing). Boot characteristics
target sub-5ms cold start, sub-1ms warm dispatch. Deploys are
artifact uploads (already-built JS + Wasm) routed via DNS
(`services/dns-server`) to the nearest healthy node. Wrangler-
compatible API surface so customer code that targeted Cloudflare
Workers ports with zero changes.

**Non-scope.** Workers KV-equivalent (separate block; lands when
needed). Durable Objects-equivalent (extends BLK-011). Workers AI
hosted models (covered by BLK-021).

**Exit criteria.** A customer's pre-built JS bundle uploaded via
`bunx wrangler-shim deploy` runs on a Crontech edge node, returns
a response within 5ms cold / 1ms warm at p50, and survives a node
failover within 10s.

**v0 state (as of 2026-04-26).** `services/edge-runtime/` shipped
on `claude/vendor-parity-docs-22c9D` (commits `3fe51c7` + `956e4ae`).
HTTP dispatcher on `127.0.0.1:9096`, Zod-validated bundle upload,
in-memory registry, Bearer-token auth, **Bun-Worker dispatch with
5s hard timeout** (Bun Workers are the V8-isolate stand-in for v0
— v1 swaps in `isolated-vm` or a custom V8 harness; documented in
`docs/EDGE_RUNTIME_V0.md`). 39 tests / 91 expects green. Not yet
deployed to a production edge node, not yet multi-region, not yet
Anycast-routed.

---

### BLK-018 — Self-Hosted Object Storage (R2-class) 🟡 BUILDING (v0 in repo)

**Scope.** S3-compatible object storage running on Crontech
infrastructure. Initial: MinIO cluster on a single region; v1:
multi-region replication with read-from-nearest. Native
integration with the Crontech edge runtime (BLK-017) so static
asset serves are zero-egress between origin and edge cache.

**Non-scope.** Vendor-managed S3 (AWS, Cloudflare R2, Backblaze
B2) — self-sufficiency rule: we replace, we do not consume.
Block storage / EBS-equivalent (separate concern).

**Exit criteria.** A customer can upload a 1GB file via the S3
API, have it replicated, served from the edge with >100MB/s
egress, and retrieved by URL in <100ms p50 globally.

**v0 state (as of 2026-04-26).** `services/object-storage/`
shipped on `claude/vendor-parity-docs-22c9D` (commit `89951dc`).
MinIO `docker-compose.yml` (single-node), systemd unit
`crontech-object-storage.service`, Bun proxy on
`127.0.0.1:9094`, S3 v4-signing client wrapper in
`packages/storage/src/client.ts`, tRPC `storage.getSignedUploadUrl`
admin-only procedure. 70+ test assertions green. Not yet
multi-region, not yet wired to edge cache, not yet customer-facing.

---

### BLK-019 — Reverse-Tunnel Daemon (Cloudflare Tunnel-class) 🟡 BUILDING (v0 in repo)

**Scope.** Daemon that opens an outbound persistent connection
from the origin Vultr/Hetzner node to the Crontech edge runtime
(BLK-017) so the origin IP never appears on the public internet.
Edge nodes route inbound traffic through the tunnel. Removes the
direct DDoS surface on the origin and unlocks running the API on
private addressing only.

**Non-scope.** Magic Transit-class BGP routing. Per-user identity-
aware proxying (that lives in BLK-022 / Zero Trust Access).

**Exit criteria.** `nslookup crontech.ai` resolves only to edge
node IPs. The origin host has no public-facing port 80/443
listener. End-to-end latency through the tunnel adds <5ms p50
versus direct origin hit.

**v0 state (as of 2026-04-26).** `services/tunnel/` shipped on
`claude/vendor-parity-docs-22c9D` (commits `6a9385b` + `3cf5ce1`
+ `6bc7f04`). Origin↔edge WebSocket bridge with framed HTTP
(4-byte big-endian length prefix + JSON, 32 MiB cap),
hostname connection registry, exponential-backoff reconnect (1s →
60s capped), constant-time shared-secret auth, systemd unit
`crontech-tunnel-origin.service`. 47 tests / 114 assertions
green. Not yet deployed (origin still publicly reachable on its
own IP), not yet TLS-terminated at the edge.

---

### BLK-021 — AI Gateway (Crontech LLM Proxy) 🟡 BUILDING (v0 in repo)

**Scope.** Self-hosted LLM proxy that fans out across providers
(Anthropic, OpenAI, Google, Mistral, plus client-side WebGPU
tiers per CLAUDE.md §4.1) with: response-cache (semantic +
exact), prompt-cache passthrough, provider failover, per-tenant
spend caps, per-tenant rate limits, and request/response
audit logging. Replaces direct vendor API coupling everywhere
in `packages/ai-core` and `apps/api/src/ai/*`.

**Non-scope.** Hosting our own foundation models (separate
moonshot block when GPU economics flip). Multi-modal routing
(text+vision+audio) — text-only in v1.

**Exit criteria.** Every Anthropic API call from Crontech's
codebase routes through the gateway. Cache hit rate ≥30% on
admin Claude Console traffic within first month live. Failover
from Anthropic to OpenAI on 5xx round-trip <500ms.

**v0 state (as of 2026-04-26).** `services/ai-gateway/` shipped
on `claude/vendor-parity-docs-22c9D` (commit `482e633`).
OpenAI-compatible `POST /v1/chat/completions` on
`127.0.0.1:9092`, Anthropic + OpenAI raw-fetch adapters,
LRU 1000-entry exact-match cache via WebCrypto SHA-256
(`x-cache: HIT/MISS` header), single-hop failover on 5xx
(`x-failover` header), in-memory usage ledger with
microdollar cost estimation. 31 tests green. Not yet wired
into existing AI consumers (zero blast radius v0), no
spend-cap enforcement yet, no semantic cache, no streaming.

---

### BLK-022 — WAF + Rate-Limit Dashboard 🔵 PLANNED

**Scope.** Per-route WAF rules engine surfacing primitives we
already have (Caddy headers, tRPC rate-limit middleware, password
login throttle in `apps/api/src/auth/password.ts`). Centralised
admin UI under `/admin/security` for rule authoring, traffic
inspection, and per-tenant rule scoping. Bot-management heuristics
(JA3 fingerprint, behavioural rate-shaping) on the Crontech edge
runtime (BLK-017).

**Non-scope.** ML-driven bot scoring (separate block once we
have RUM telemetry from BLK-027). DDoS scrubbing at L3/L4 (that
lives in the tunnel + Anycast architecture of BLK-019).

**Exit criteria.** Admin can author and apply a per-route WAF
rule in under 60 seconds without an SSH session. Rule applies
within 5s of save. Hit/block counts visible in the dashboard
within 60s of being applied.

---

### BLK-023 — WebGPU Video Pipeline (Stream-class) 🔵 PLANNED

**Scope.** Client-side WebGPU video encoding, decoding, effects
processing, and timeline editing. Server-side transcode + storage
for finished assets (lands on BLK-018 object storage). Adaptive
bitrate streaming served from the Crontech edge runtime (BLK-017).
First customer-facing surface: the AI Video Builder ambition in
CLAUDE.md §1.

**Non-scope.** Live-streaming ingest (RTMP / WebRTC SFU) — that's
its own future block. DRM. Per-frame ML model inference from the
client GPU at upload time (separate research block).

**Exit criteria.** A 5-minute 1080p MP4 uploaded by a customer
encodes client-side via WebGPU in under 30 seconds, replicates to
edge cache, and plays back at p50 <500ms first-frame globally.

---

### BLK-024 — Privacy-First First-Party Analytics 🔵 PLANNED

**Scope.** Cookieless, first-party page analytics served from
the Crontech edge runtime. Minimum viable schema: pageview,
session, referrer, country (from edge geo), device class. Stored
on BLK-018 / Turso. No third-party scripts shipped to the
customer site. Surface as a tile under `/admin/analytics` and a
public-customer-facing `/dashboard/projects/:id/analytics` page.

**Non-scope.** Funnel/conversion analytics (BLK-027 / RUM
territory). Heatmaps, session replay (long-term moonshot).

**Exit criteria.** A customer site embeds a single `<script>`
tag served from the Crontech edge, page views accrue with
sub-50ms client-side overhead, and the customer sees an
unsampled live counter in their dashboard within 5s of a hit.

---

### Vercel-class blocks (deploy UX + image opt + RUM)

---

### BLK-025 — Preview Deploys per PR 🔵 PLANNED

**Scope.** Every git push to a non-Main branch in a customer
repo (BLK-009 git-push pipeline) produces an isolated preview
deploy at `pr-${number}-${slug}.${tenant}.crontech.app`. Live
log stream, automatic teardown on PR close, comment back to the
PR with the preview URL.

**Non-scope.** Production traffic shadowing in v1. Per-PR DB
branches (lands once Neon-equivalent self-hosted Postgres
branching is built; separate future block).

**Exit criteria.** Opening a PR on a customer repo connected to
Crontech surfaces a working preview URL within 60s of push,
visible on the PR via comment + status check.

---

### BLK-026 — Image Optimisation Pipeline 🔵 PLANNED

**Scope.** On-demand image transform served from the Crontech
edge runtime (BLK-017). WebGPU-side resizing, format conversion
(AVIF / WebP), quality / DPR-aware variants. Cached on BLK-018
object storage. URL grammar: `/img/${path}?w=800&q=80&fmt=avif`.

**Non-scope.** AI-driven content-aware crop / inpaint / generative
fill (separate AI block). Video transforms (BLK-023 territory).

**Exit criteria.** A customer requests `/img/hero.jpg?w=800` and
receives a sub-200ms p50 globally cached AVIF, served from the
nearest edge, with cache-hit rates ≥90% after warmup.

---

### BLK-027 — Real User Monitoring (Speed Insights-class) 🔵 PLANNED

**Scope.** Web Vitals (LCP, INP, CLS, TTFB) collected via the
Beacon API to the Crontech edge runtime, stored on Turso /
BLK-018, surfaced under `/admin/rum` and the customer dashboard.
Cross-references BLK-024 first-party analytics for context.

**Non-scope.** APM-grade error tracking with stack traces (that
is BLK-014 self-hosted Grafana / OpenTelemetry territory). User
journey replay.

**Exit criteria.** A customer site instrumented with Crontech
RUM reports p75 LCP, INP, CLS for every route within 5 minutes
of first hit. No third-party RUM script in the customer bundle.

---

### Render-class blocks (long-lived workloads + private networking)

---

### BLK-028 — Multi-Region Auto-Scaling Orchestrator 🔵 PLANNED

**Scope.** Service unit that watches CPU / memory / request-rate
across the Crontech node fleet and provisions / drains nodes to
maintain SLO. Initial scaling target: per-tenant build worker
pool (BLK-009). v1: stateless service tier (web, api). Triggers
new node provisioning via Hetzner / Vultr API.

**Non-scope.** Stateful workload migration (Postgres failover,
Durable Objects migration) in v1 — those are their own blocks.

**Exit criteria.** Sustained 80% CPU on a node triggers a new
node coming online within 90s, traffic shifting within 30s
post-warmup. Sustained idle drains a node within 5min while
preserving in-flight requests.

---

### BLK-029 — WireGuard Mesh Between Nodes 🔵 PLANNED

**Scope.** Encrypted WireGuard mesh connecting every Crontech
node (origin, edge, build workers, future GPU workers). Replaces
public-internet hops between our own services with private
encrypted hops. Enables BLK-019 tunnel and BLK-028 auto-scaler
without exposing internal control planes.

**Non-scope.** Customer VPC isolation in v1 (lands on top of
this block). Layer-7 service mesh (Istio / Linkerd) — overkill
for our scale until it isn't.

**Exit criteria.** A new Crontech node provisioned by BLK-028
joins the mesh within 60s of boot. Internal service-to-service
calls add <2ms p50 versus public-internet baseline. Traffic
between nodes is unobservable from the public internet.

---

### Mailgun-class block (transactional email)

---

### BLK-030 — Transactional Email Pipeline 🔵 PLANNED

**Scope.** Full Mailgun-equivalent: outbound SMTP via warmed
Crontech IPs + REST API, inbound routing engine, MIME templates,
open / click tracking pixels, bounce / complaint handling,
suppression list, DKIM / SPF / DMARC automation tied into
BLK-019 DNS, webhooks for delivery events. Runs on the queue
service (already in repo, currently dormant).

**Non-scope.** Marketing-grade email (segmentation, A/B,
campaigns) — separate product surface in a future block. Mass
mailing >1M / day (later, capacity decision).

**Exit criteria.** Crontech itself sends every system email
(welcome, password reset, deploy alert, billing receipt) through
this pipeline, with delivery rates ≥98% across major mailbox
providers and bounce / complaint events surfaced to admin within
60s.

---

### Twilio-class blocks (SMS + Voice + Verify)

---

### BLK-031 — Programmable SMS Pipeline 🔵 PLANNED

**Scope.** Outbound + inbound SMS via wholesale carrier
integration (initial: Sinch / Telnyx; long-term: direct carrier
interconnect). REST API + webhooks. Per-tenant number
provisioning, queue-backed delivery, delivery receipts, opt-out
handling (STOP / HELP keywords), TCPA / 10DLC compliance
plumbing.

**Non-scope.** MMS (separate block). Short codes (separate
block — different procurement surface). International fanout in
v1 (US / CA / UK / NZ / AU only).

**Exit criteria.** Crontech itself sends every system SMS (2FA
code, deploy alert opt-in) via this pipeline. Round-trip API →
delivered <5s p50. Inbound webhook fires within 1s of receipt.

---

### BLK-032 — Voice Pipeline (SIP Trunking) 🔵 PLANNED

**Scope.** Programmable voice via SIP trunking (initial: Telnyx
/ Bandwidth wholesale). Inbound call routing, IVR primitives,
recording, voicemail-to-email (uses BLK-030), per-tenant number
provisioning. Hooks for AI agents to participate in calls
(speech-to-text + LLM + text-to-speech via BLK-021).

**Non-scope.** Native PSTN interconnect (years out). Contact-
center scale (TaskRouter-class). Video calling (separate WebRTC
block).

**Exit criteria.** A customer can provision a number, route
inbound calls to a SIP endpoint or an HTTP webhook, and connect
an AI agent to a live call with sub-500ms STT-to-LLM-to-TTS
round-trip.

---

### BLK-033 — Verify / OTP Pipeline 🔵 PLANNED

**Scope.** Verify-class API that wraps BLK-031 (SMS), BLK-030
(email OTP), TOTP (per CLAUDE.md §3 Auth roadmap), and WhatsApp
(once integrated). Per-tenant rate limits, brute-force lockout,
abuse signals fed into BLK-022. Replaces every direct OTP
implementation across Crontech and downstream products.

**Non-scope.** Voice OTP in v1 (BLK-032 dependency lands first).
Knowledge-based authentication (KBA) — separate compliance
block.

**Exit criteria.** Crontech's own 2FA flow uses this pipeline
end-to-end. SDK has a single `verify.send()` / `verify.check()`
surface. Per-tenant cost dashboard surfaces in `/admin/ops`.

---

### BLK-020 — Admin Claude Console (BYOK builder interface) ✅ SHIPPED

**Scope.** An admin-only Claude-native chat console at
`/admin/claude` that lets Craig paste his own Anthropic API key
and build websites / projects directly from the admin backend.
Purpose: retire the $1,996/mo Craig pays for four rotating Claude
Pro/Max seats (needed only to bypass rolling usage windows) and
replace them with metered API usage (~$150–$400/mo for the same
workload).

**Build on.** Most of this already exists from a prior session:
- `apps/api/src/trpc/procedures/chat.ts` — CRUD for conversations,
  messages, and encrypted provider keys (XOR-obfuscated, keyed to
  `SESSION_SECRET` — flagged as NOT cryptographic-grade; see
  Follow-up below).
- `apps/api/src/ai/chat-stream.ts` — Hono `POST /api/chat/stream`
  that streams Anthropic responses via `streamText()`, resolving
  the key from `userProviderKeys` → `ANTHROPIC_API_KEY` env.
- `packages/ai-core/src/providers.ts` — `getAnthropicModel()`,
  `ANTHROPIC_MODELS` catalog, `estimateCost()` in microdollars.
- `packages/db/src/schema.ts` — `conversations`, `chatMessages`,
  `userProviderKeys` tables.

**This block adds.**
1. Admin-gated route `/admin/claude` — Claude-native chat UI
   wrapped in `AdminRoute`, with admin chrome (breadcrumb back to
   `/admin`, monthly-spend indicator, link to
   `/admin/claude/settings`). Reuses the same tRPC
   `chatRouter` + `POST /api/chat/stream` as `/chat`.
2. Admin-gated route `/admin/claude/settings` — paste/rotate
   Anthropic API key (masked after save), default model picker
   (Haiku / Sonnet / Opus), system prompt preset.
3. tRPC `chat.getUsageStats` — returns current-month token + cost
   totals for the caller, plus conversation count.
4. `saveMessage` populates `conversations.totalCost` via
   `estimateCost()` (currently only writes `totalTokens`). Fixes
   the pre-existing bug where totalCost is always 0.
5. Quick-action tile on `/admin` linking to `/admin/claude`.

**Non-scope (v1).**
- Hard monthly spend cap with enforcement (visibility only in v1 —
  Craig can self-regulate from the spend counter).
- Multi-user BYOK for non-admin users (admin-only for now; there
  is an existing public `/chat` route already serving that case).
- Tool use / function calling (text streaming only in v1).
- File / image upload into the chat.
- Prompt caching control UI (Anthropic SDK applies caching
  automatically; no explicit control exposed yet).

**Exit criteria.**
1. `/admin/claude` renders, is admin-only, and streams real Claude
   responses using the user's stored Anthropic API key.
2. `/admin/claude/settings` successfully saves, masks, and deletes
   an Anthropic key via `chat.saveProviderKey` /
   `chat.deleteProviderKey`.
3. Monthly spend (in dollars) is visible in the console header
   and on `/admin` as a new stat tile.
4. `saveMessage` writes `totalCost` — verified by existing
   `chat.ts` tests + a new unit test.
5. `bun run build`, `bun run check`, `bun run test`,
   `bun run check-links`, `bun run check-buttons`, and
   `bunx biome check` all pass.

**Follow-up (separate blocks).**
- Replace XOR obfuscation in `chat.ts` with AES-256-GCM backed by
  a rotating KMS key (flagged by the file's own comment).
- Hard monthly cap enforcement in `chat-stream.ts` (block stream
  start if current-month cost ≥ cap).
- Prompt-caching metrics surfaced in the spend counter.
- Tool use / MCP tool approval flow so Claude can read repo
  files when building in the console.

**Lock clause.** This block is ✅ SHIPPED — all five exit criteria
are met on `main`. `/admin/claude` + `/admin/claude/settings` are
live, admin-gated, streaming real Claude responses via the
saved Anthropic key; monthly-spend tile renders on `/admin`;
`saveMessage` writes `totalCost` (BLK-013 regression test in
`apps/api/src/trpc/procedures/chat.test.ts` pins it); all six
quality gates pass on HEAD.

Craig authorized this flip on 2026-04-23 in chat by listing it on
the "what I need to finish" punch-list and instructing the agent to
"complete this without stopping." Follow-up blocks listed above
(AES-256-GCM provider-key encryption, hard spend-cap enforcement,
prompt-cache visibility, tool use) remain unstarted and will
receive their own BLK ids.
Non-scope list above is now permanently locked per the ✅ SHIPPED
contract. Any of the Follow-up items gets its own new block with
its own authorization gate.

---

## Amending this file

The Build Bible changes **only** with Craig's explicit in-chat
authorization. The amendment protocol mirrors CLAUDE.md's Layer 1
soft + Layer 2 hard protection:

1. Agent proposes the change in chat (literal diff or new wording).
2. Craig replies with an explicit affirmative ("yes", "go ahead",
   "do it"). Silence is not consent.
3. Agent writes the edit, includes the rationale in the commit
   message.
4. CODEOWNERS / branch protection on `docs/BUILD_BIBLE.md` blocks
   merge without Craig's approving review.

Adding a new block, closing a block, flipping a block's status,
or changing a lock clause — all require authorization. Updating
the "non-scope" or "exit criteria" of a 🟢 SET block also requires
authorization. Only agent-level status on 🟡 BUILDING blocks may be
amended by the executing agent without asking (e.g. "progress
note: step 3 of 6 complete").
