# Crontech — Substrate Inventory & Standalone Hardening Plan

**Status:** ACTIVE. Pre-revenue platform aiming to be "the fastest, most reliable platform on the market that covers most areas."
**Audited:** 2026-04-11 (full codebase audit, 275 TS/TSX files)
**Repo:** `ccantynz-alt/Crontech` — standalone, SolidStart + Hono + Drizzle + Turso/Neon + Cloudflare Workers/Pages
**Branch:** `claude/setup-multi-repo-session-x5wFz`
**Standalone rule:** Crontech imports ZERO code from emailed, Zoobicon, or GateTest. Patterns may be borrowed; code may not.

---

## The Green Ecosystem Mandate (binding, 20-year horizon)

> No error, broken link, dead button, 404, unstyled page, or runtime exception reaches the customer — ever. Every fix in this document must preserve this invariant. GateTest is the enforcement mechanism.

---

## Executive Summary

Crontech is **architecturally coherent but operationally incomplete**. The monorepo structure is clean (7 packages, 2 apps, 3 services), the tRPC router has 18 sub-routers with type-safe procedures, and the middleware chain (telemetry → rate-limit → CSRF → auth) is wired. But the audit found critical durability gaps: in-memory rate limiter, in-memory feature flags, in-memory AI cache, in-memory background queue, zero file storage code, outbound webhooks declared but never called, and OpenAI-only AI (Anthropic SDK declared, unused).

Tonight's session fixed 2 of the 7 ship blockers. The remaining 5 are ranked below.

**Honest humility note:** emailed (a sister platform) is ahead of Crontech on multiple durability surfaces. Where noted below, Crontech should study emailed's patterns and implement its own versions. No code imports — pattern-borrowing only.

---

## What Landed Tonight (Session 2026-04-11)

| Commit | Fix | Impact |
|---|---|---|
| `e90a2e5` | **Rate limiter → Cloudflare KV** (was in-memory Map, cold start = zero limits) | Durable rate limiting. Auto-selects KV when bound, falls back to in-memory. 9 new tests (32/32 focused tests pass). |
| `3e13849` | **Outbound webhook dispatcher** — HMAC-SHA256 signed, retry with backoff, auto-deactivate after 5 failures | The webhooks CRUD table now has a real dispatcher. `emitWebhook()` inserts pending deliveries; `runDispatcher()` POSTs with signature + retries. 10 new tests. Scheduler via both Bun interval and Cloudflare cron trigger. |

**Craig action required:**
- Run `wrangler kv:namespace create RATE_LIMIT_KV` and uncomment the binding in `apps/api/wrangler.toml`
- Until then, production uses in-memory fallback (same as before — no regression)

**Pre-existing test failures (5, outside tonight's scope):**
- `apps/api` imports `./procedures/products`, `./procedures/productTenants`, `../trpc/middleware/idempotency`, `aiCache`, `uiComponents` — these files/exports don't exist yet. These stale imports come from prior sessions that declared but never built these modules. A future session should either create the missing files or remove the stale imports.

---

## Package & Service Inventory

| Package | Purpose | Maturity | Key files |
|---|---|---|---|
| `packages/ai-core` | LLM provider abstraction, Vercel AI SDK | PARTIAL | Streaming works; only OpenAI wired; no Anthropic despite .env key |
| `packages/audit-log` | Hash-chained audit trail (§5A) | PARTIAL | Table exists with `previous_hash`, `entry_hash`, `signature`; no RFC 3161 TSA; never tested; signature unsigned |
| `packages/cfo-engine` | CFO reporting for Craig | STUB | Exists but unchecked |
| `packages/config` | Shared tsconfig, Biome config | STABLE | Working |
| `packages/db` | Drizzle schemas + migrations, Turso + Neon clients | PARTIAL | 15+ tables; 7 migrations; tenant-manager exists but queries not scoped automatically |
| `packages/schemas` | Shared Zod schemas | STABLE | Working |
| `packages/ui` | SolidJS component library | PARTIAL | Some components built; cron.ui.* catalog Wave 4 shipped |

| App | Purpose | Deploy target | Maturity |
|---|---|---|---|
| `apps/api` | Hono API server, 18 tRPC sub-routers | Cloudflare Workers | PARTIAL — many routers have stubs |
| `apps/web` | SolidStart frontend | Cloudflare Pages | PARTIAL |

| Service | Purpose | Maturity |
|---|---|---|
| `services/sentinel` | Competitive intelligence collectors | PARTIAL — collectors exist, analysis/alerting not wired |
| `services/gpu-workers` | Modal.com GPU worker definitions | STUB |
| `services/edge-workers` | Cloudflare Worker scripts | PARTIAL |

---

## tRPC Router Surface (18 sub-routers)

| Router | Procedures | Maturity | Notes |
|---|---|---|---|
| `users` | CRUD | PARTIAL | No tenant scoping enforcement |
| `audit` | log, feed | PARTIAL | Hash chain exists, never verified |
| `auth` | passkey, google-oauth, password, session | PARTIAL | Working but no 2FA/TOTP |
| `billing` | Stripe checkout, webhook, portal | PARTIAL | Signature verification correct; no retry queue |
| `featureFlags` | CRUD, evaluate | IN-MEMORY | 11 flags defined; no persistence; resets on restart |
| `collab` | presence, cursors | STUB | Raw WebSocket only; no Yjs |
| `email` | send, templates | PARTIAL | Resend only; fire-and-forget; no retry |
| `admin` | empire overview | STUB | |
| `analytics` | events, metrics | STUB | |
| `notifications` | CRUD | STUB | |
| `tenant` | CRUD, scoping | PARTIAL | Manager exists but not enforced |
| `apiKeys` | CRUD | PARTIAL | |
| `webhooks` | CRUD + ✅ DISPATCHER (tonight) | PARTIAL | Delivery loop wired tonight |
| `support` | tickets | STUB | |
| `ai` | siteBuilder, complete, cache | PARTIAL | Streaming works; OpenAI only |
| `products` | DECLARED | BROKEN | Import exists but file missing |
| `productTenants` | DECLARED | BROKEN | Import exists but file missing |
| `ui` | catalog, components | PARTIAL | Wave 4 keystone shipped |

---

## Remaining Ship Blockers (ranked by severity)

### CRITICAL (fix next session)

| # | Issue | Impact | Fix | Effort | Pattern source |
|---|---|---|---|---|---|
| C1 | **Multi-tenant queries not enforced at DB layer** | One developer forgets WHERE clause → customer data leak | Add RLS policies on Turso/Neon. Or: create a `scopedQuery(tenantId)` wrapper that auto-injects WHERE. | L | emailed: `accountId` on every table + cascade deletes |
| C2 | **Zero file storage** — no R2, no S3, no MinIO, no Blob, nothing | Cannot store user-generated content, sites, videos, exports | Wire Cloudflare R2 (bindings already stubbed in `infra/cloudflare/`). Create `packages/storage/` with `upload()`, `download()`, `delete()`, presigned URLs. | M | emailed: Cloudflare R2 with presigned URLs, 15-min TTL |
| C3 | **In-memory background queue (5-retry cap)** — jobs lost on restart | Email sends, provisioning, video encoding fail silently | Replace `apps/api/src/automation/retry-queue.ts` with BullMQ + Redis (or Cloudflare Queues for Workers). Keep in-memory as dev fallback. | M | emailed: BullMQ singleton with lazy init + graceful shutdown |
| C4 | **OpenAI-only AI** — Anthropic SDK declared but unused | Single provider failure = platform down | Wire `@anthropic-ai/sdk` in `packages/ai-core/`. Add provider router: try primary → fallback → error. Craig must set `ANTHROPIC_API_KEY`. | S | Zoobicon: `src/lib/llm-provider.ts` with Anthropic primary + OpenAI fallback |
| C5 | **5 stale imports breaking tests** | `bun run test` shows 5 failures on stale `products`, `productTenants`, `idempotency`, `aiCache`, `uiComponents` imports | Either create the missing files with minimal stubs, or remove the stale imports. Check git log for which session declared them. | S | — |

### HIGH (fix within 2 weeks)

| # | Issue | Fix | Effort |
|---|---|---|---|
| H1 | Feature flags: in-memory, 11 flags, no persistence | Move to Cloudflare KV (same as rate limiter — already wired tonight) | S |
| H2 | Audit log: hash chain never tested, signature unsigned | Add verification test that re-computes hash chain and catches tampering. Sign entries with a key from Cloudflare Secrets. | M |
| H3 | Email sending: fire-and-forget, no retry | Wire sends through the background queue (after C3 is done). Add retry with backoff. | S (after C3) |
| H4 | Inbound email: Resend webhook only, no IMAP/POP3 | Extend with proper inbound handling if Crontech needs to receive email. May not be needed — Craig to confirm. | M |
| H5 | Observability: OTel wired but no Grafana/LGTM dashboards | Deploy Grafana on Fly.io or use Grafana Cloud free tier. Wire Loki for logs, Tempo for traces. | M |

### MEDIUM (fix within 4 weeks)

| # | Issue | Fix | Effort |
|---|---|---|---|
| M1 | No Hetzner bare-metal deploy (doctrine claims it) | Build self-host deploy pipeline when ready. Not urgent — Cloudflare is fine for now. | L |
| M2 | No Yjs/CRDT despite collaboration router | Wire `@yjs/provider` when real-time collab is needed. Stub is fine until then. | L |
| M3 | No WebGPU video pipeline (doctrine claims it) | Defer until video is actually needed. The doctrine is aspirational here. | XL |
| M4 | Sentinel: collectors exist, analysis not wired | Wire LangGraph agents to analyze Sentinel data. Lower priority than revenue features. | M |

---

## Where emailed Is Ahead (pattern-borrowing candidates)

| Surface | emailed | Crontech | Borrow? |
|---|---|---|---|
| Durable queue | BullMQ + Redis, production-grade | In-memory, 5-retry | Yes — copy pattern for C3 |
| Rate limiting | Redis sliding window, atomic MULTI/EXEC | ✅ KV fixed tonight | Done |
| File storage | Cloudflare R2, presigned URLs | Zero code | Yes — copy pattern for C2 |
| Multi-tenant scoping | `accountId` on every table, cascade deletes | Developer-manual WHERE | Yes — copy pattern for C1 |
| Webhook dispatcher | HMAC-SHA256, retry, auto-deactivate | ✅ Fixed tonight | Done |
| Yjs CRDT | Wired in `services/collab/` | Stub only | Future |
| SAML 2.0 SSO | Full SP, admin login | Not present | Future (enterprise) |
| Custom SMTP | Full RFC 5321 server | Resend wrapper | Not needed — Crontech doesn't send email at scale |

---

## GateTest Integration

Install `GateTestHQ` GitHub App on `ccantynz-alt/Crontech`. Modules to run: security, accessibility, performance, seo, links, fake-fix-detector, code-quality. Block PR merge on CRITICAL findings.

When CI pipeline matures: add `.github/workflows/gatetest.yml` as required check.

---

## Open Questions (TBD — Craig to confirm)

1. **Hetzner timeline: when does Cloudflare → self-host happen?** The doctrine says Phase 0 Week 0, but Cloudflare is working fine. Craig to decide if self-hosting is still the plan.
2. **Stale imports (products, productTenants, idempotency, aiCache, uiComponents): create or delete?** Check which session declared them and whether the code ever shipped.
3. **Does Crontech need inbound email (IMAP/SMTP receiving)?** If no, remove the Resend inbound webhook stub.
4. **WebGPU video pipeline: is this still a priority?** Doctrine says yes but code is 0%. Honest assessment: this is a multi-month effort that doesn't generate revenue.
5. **Sentinel competitive intelligence: wire analysis, or pause?** Collectors run but nobody reads the data.

---

## Session Log

| Date | Session | What landed | Commits |
|---|---|---|---|
| 2026-04-11 | Multi-repo audit + fix | KV rate limiter, outbound webhook dispatcher | `e90a2e5`, `3e13849` |

---

*This document is the durable memory for Crontech. Future Claude sessions should read this file first, then execute the next unchecked ship blocker. Each fix is standalone — no fix depends on emailed, Zoobicon, or GateTest shipping anything.*
