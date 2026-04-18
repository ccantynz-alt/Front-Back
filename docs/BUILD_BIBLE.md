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
  Fly.io long-lived processes, Hetzner (current production host).
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
to Cloudflare Workers/Pages → we update their project's
`*.crontech.app` subdomain.

Components:
- GitHub App (install flow under `/dashboard/projects/new`).
- Webhook receiver at `apps/api` with signature verification.
- Build worker (initial: Cloudflare Container; later: Fly.io microVM).
- Log streamer via SSE to the project's live logs page.
- Wrangler-based deployer.
- Per-project subdomain routing.

**Non-scope.** Non-GitHub providers (GitLab, Bitbucket) in v1.
Paid build minutes billing (that's BLK-010).

**Exit criteria.** Craig can point a test repo at crontech.ai,
click deploy, see live logs, and load the resulting site.

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

### BLK-014 — Observability (Grafana LGTM dashboard) 🔵 PLANNED

**Scope.** Deploy Grafana + Loki + Tempo + Mimir. Point the
existing OTel instrumentation at them. Build a single dashboard
covering edge / cloud / client metrics + AI inference cost and
latency.

**Non-scope.** Proprietary APM (Datadog, New Relic) in v1.

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

### BLK-020 — Admin Claude Console (BYOK builder interface) 🟡 BUILDING

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

**Lock clause.** This block is 🟡 BUILDING on
`claude/admin-custom-ai-api-pDjEV`. Craig's explicit in-chat
authorization on 2026-04-15 scopes it ("Absolutely let's build").
Flipping it to ✅ SHIPPED and locking the non-scope list
requires a normal BUILD_BIBLE amendment per the "Amending this
file" section below.

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
