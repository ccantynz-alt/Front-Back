# CRON_REPO — Cross-Platform Scoreboard & Operational Readiness

**Status:** ACTIVE. This is the meta-document for the Canty empire's 4-platform strategy.
**Created:** 2026-04-11
**Scope:** Crontech, Zoobicon, emailed, GateTest — each standalone, no cross-contamination.
**Location:** Lives in Crontech repo as the strategic coordination doc, but describes ALL 4 platforms.

---

## The Green Ecosystem Mandate (binding, 20-year horizon)

> No error, broken link, dead button, 404, unstyled page, or runtime exception reaches the customer — ever. This applies to ALL 4 platforms. GateTest is the enforcement mechanism. Every platform must pass GateTest before any PR merges to main.

---

## Purpose

Craig's 4 platforms are standalone products. They do NOT share code, do NOT import from each other, and do NOT run on a shared substrate. But they share a STRATEGY: make each one the strongest, fastest, most reliable version of itself, as quickly as possible, using insights from auditing all 4 together.

This document is the scoreboard. It tracks:
1. What each platform does well (pattern source for others to borrow)
2. What each platform is missing (hardening backlog)
3. Revenue readiness per platform
4. GateTest installation status (empire QA gate)

---

## Platform Scoreboard (as of 2026-04-11 audit)

### Capability Matrix

| Capability | emailed | Zoobicon | GateTest | Crontech |
|---|---|---|---|---|
| **Auth (password + OAuth)** | ✅ 95% (WebAuthn, Google, Microsoft, SAML) | ✅ 90% (email + OAuth) | ✅ fixed tonight (GitHub OAuth admin) | ✅ PARTIAL (passkey + Google OAuth + password) |
| **Database (structured, multi-tenant)** | ✅ 100% (27 Drizzle tables, accountId scoping) | ⚠️ 90% (Neon raw SQL, no RLS) | ❌ 0% (Stripe metadata only) | ⚠️ PARTIAL (Drizzle, no RLS) |
| **Billing (Stripe)** | ✅ 95% (4 plans, webhook verified) | ✅ 90% (4 plans, ✅ dedup fixed tonight) | ✅ fixed tonight (async, idempotent) | ⚠️ PARTIAL (webhook verified, no retry) |
| **Durable queue** | ✅ 95% (BullMQ + Redis) | ❌ 0% (Vercel crons only) | ❌ 0% (none) | ❌ 0% (in-memory, 5-retry) |
| **Rate limiting (durable)** | ✅ 95% (Redis sliding window) | ❌ 20% (in-memory — CRITICAL) | N/A | ✅ fixed tonight (Cloudflare KV) |
| **File storage** | ✅ 95% (Cloudflare R2) | ❌ 30% (Neon BYTEA only) | ❌ 0% (filesystem only) | ❌ 0% (zero code) |
| **Email sending** | ✅ 95% (custom SMTP, DKIM, DMARC) | ⚠️ 80% (Mailgun, no fallback) | N/A | ⚠️ PARTIAL (Resend, fire-and-forget) |
| **Email receiving** | ✅ 90% (SMTP inbound + IMAP sync + JMAP stub) | ⚠️ 60% (ImapFlow, fragile) | N/A | ❌ STUB (Resend webhook only) |
| **Webhooks (outbound)** | ✅ 95% (HMAC, retry, auto-deactivate) | ❌ 0% (missing) | N/A | ✅ fixed tonight (HMAC, retry, auto-deactivate) |
| **Audit logging** | ⚠️ 85% (events table, no admin audit) | ⚠️ 70% (table exists, not auto-hooked) | ❌ 0% (none) | ⚠️ PARTIAL (hash-chained, untested) |
| **Feature flags** | ❌ 0% (plan-tier only) | ❌ 0% (hardcoded) | ❌ 0% (none) | ⚠️ PARTIAL (in-memory, 11 flags) |
| **Observability (OTel)** | ⚠️ 85% (wired, no dashboards) | ❌ 0% (none) | ❌ 0% (none) | ⚠️ PARTIAL (wired, no Grafana) |
| **CI/CD pipeline** | ❌ 0% (no GitHub Actions) | ⚠️ 70% (partial GH Actions) | ❌ 0% (no CI) | ⚠️ PARTIAL (deploy.yml exists) |
| **Tests** | ⚠️ 80% (130/130, no CI) | ⚠️ 60% (Vitest + Playwright) | ✅ 95% (62/62) | ⚠️ 70% (337 files, gaps on critical paths) |
| **Reputation protection** | ✅ fixed tonight (SPF, warmup, headers) | N/A | N/A | N/A |
| **AI layer** | ✅ 100% (Claude Haiku/Sonnet/Opus, 153 files) | ⚠️ 85% (Anthropic primary, failover stubs) | ✅ fixed tonight (cost-capped) | ⚠️ PARTIAL (OpenAI only) |
| **Real-time collab (CRDT)** | ⚠️ 80% (Yjs wired) | ❌ 0% | N/A | ❌ STUB (raw WebSocket) |
| **Multi-tenancy (RLS)** | ✅ 100% (accountId, cascade) | ❌ 0% (no RLS) | N/A | ❌ 0% (developer-manual) |

### Revenue Readiness

| Platform | Revenue model | Price points | Live customers? | Ship-blocker |
|---|---|---|---|---|
| **emailed** | SaaS subscriptions | Free / Starter / Pro / Enterprise | TBD — Craig to confirm | Reputation protection (3/8 fixes done tonight) |
| **Zoobicon** | SaaS subscriptions | Creator / Pro / Agency / WhiteLabel | Yes — Stripe deployed, tiers active | In-memory rate limiter (Upstash already wired, needs connection to rate-limit endpoints) |
| **GateTest** | Per-scan payments | $29 / $99 / $199 / $399 | Uncertain — no customer DB | Real database (currently Stripe metadata) |
| **Crontech** | SaaS subscriptions (future) | TBD | No — pre-revenue | File storage, multi-tenant, AI provider fallback |

---

## Pattern-Borrowing Directory

When one platform has solved a problem well, others should copy the PATTERN (not the code). This table tracks which platform is the pattern source for each capability.

| Pattern | Source platform | Borrowers | What to copy |
|---|---|---|---|
| Durable job queue (BullMQ) | **emailed** | Zoobicon, Crontech | Singleton Queue, lazy init, graceful shutdown, exponential backoff |
| Redis rate limiting | **emailed** | Zoobicon | Sliding window, atomic MULTI/EXEC, 6 tiers, X-RateLimit headers |
| Cloudflare R2 storage | **emailed** | Zoobicon, Crontech | Presigned URLs, 15-min TTL, zero egress |
| Multi-tenant DB scoping | **emailed** | Zoobicon, Crontech | `accountId` on every table, cascade deletes, foreign keys |
| Webhook dispatcher (HMAC) | **Crontech** (tonight) / **emailed** | Zoobicon | HMAC-SHA256 signature, retry backoff, auto-deactivate after 5 failures |
| Cloudflare KV rate limiter | **Crontech** (tonight) | — | Sliding-window-counter on KV, auto-fallback to in-memory |
| Claude API cost cap | **GateTest** (tonight) | Zoobicon (for video pipeline) | Per-job ledger, tier-specific ceilings, model downgrade at 80%, hard stop at 95% |
| Async webhook scan | **GateTest** (tonight) | — | `next/server after()` for fire-and-respond, idempotent job stamp |
| Upstash Redis dedup | **Zoobicon** (tonight) | GateTest, Crontech | `SET NX` with 24h TTL for webhook event dedup, 503-on-error so upstream retries |
| SPF include expansion | **emailed** (tonight) | — | Recursive resolver, 10-lookup cap, circular detection, void-lookup counting |
| Header injection guard | **emailed** (tonight) | — | Whitelist + X-Custom-* namespace, CRLF/NUL rejection, RFC 5322 line limits |

---

## GateTest Installation Status (Empire QA Gate)

| Repo | GitHub App installed? | CI workflow? | Pre-push hook? | Status |
|---|---|---|---|---|
| Crontech | TBD — Craig to install | Not yet | Not yet | ❌ Not enforced |
| Zoobicon | TBD — Craig to install | Not yet | Not yet | ❌ Not enforced |
| emailed | TBD — Craig to install | Not yet | Not yet | ❌ Not enforced |
| GateTest | Self-scans via `npm test` | Yes (existing) | Yes (existing) | ✅ Self-enforced |

**Craig action:** Install the `GateTestHQ` GitHub App on all 3 repos. Takes 2 minutes per repo.

---

## What Shipped Tonight (Session 2026-04-11)

### Fixes by repo

| Repo | Fixes | Commits | Tests |
|---|---|---|---|
| **emailed** | SPF include expansion, auto-warmup, header validator | `e9e067d`, `49bd182`, `50e29ff` | 130/130 ✅ |
| **Zoobicon** | Upstash Redis dedup, Mailgun HMAC, password reset TTL | `37022ce`, `554b035`, `795c646` | build passing ✅ |
| **GateTest** | Admin auth, async scan, Claude cost cap | `0d9e30e`, `2d4cc54`, `97122a4` | 62/62 ✅ |
| **Crontech** | KV rate limiter, webhook dispatcher | `e90a2e5`, `3e13849` | 32/32 focused ✅ |

**Total: 11 revenue-critical fixes across 4 repos. Zero cross-contamination. All branches pushed to origin.**

### Env vars Craig must set (action items)

| Repo | Env var | Where | Purpose |
|---|---|---|---|
| Zoobicon | `UPSTASH_REDIS_REST_URL` | Vercel | Stripe webhook dedup |
| Zoobicon | `UPSTASH_REDIS_REST_TOKEN` | Vercel | Stripe webhook dedup |
| Zoobicon | `MAILGUN_WEBHOOK_SIGNING_KEY` | Vercel | Mailgun HMAC verification |
| GateTest | `GATETEST_ADMIN_USERNAMES` | Vercel | Admin panel allowlist |
| GateTest | `SESSION_SECRET` | Vercel | Admin session signing |
| Crontech | Run `wrangler kv:namespace create RATE_LIMIT_KV` | CLI | KV rate limiter |

---

## Next Session Priorities (ranked)

1. **emailed Phase 0.4-0.8:** FBL integration, DNS liveness, virus scanning, hard quotas, suppression timing — completes reputation protection and unblocks email launch.
2. **Zoobicon C1:** Extend Upstash Redis to rate-limit endpoints (Redis client already wired from the webhook fix).
3. **GateTest C1:** Add real database (Neon or Turso) to replace Stripe metadata.
4. **Crontech C1-C2:** Multi-tenant RLS + file storage (Cloudflare R2).
5. **All repos:** Install GateTestHQ GitHub App + create `.github/workflows/gatetest.yml`.

---

## 12 Open Questions (TBD — Craig to confirm)

1. emailed: dogfood product or flagship `cron.email.*` SaaS?
2. emailed: pricing tiers locked?
3. emailed: domain name — `emailed.*` or `cron.email.*`?
4. emailed: desktop + mobile apps — ship now or defer?
5. Zoobicon: video pipeline — test + fix, or pause until post-launch?
6. Zoobicon: 7-agent pipeline — wire into UI, or remove?
7. Zoobicon: OpenSRS ICANN accreditation — pursue or accept 3x markup?
8. GateTest: live paying customers — confirm Stripe activity?
9. GateTest: database choice — Neon Postgres or Turso SQLite?
10. GateTest: npm publish — is `npx gatetest@latest` live?
11. Crontech: Hetzner self-hosting timeline — still the plan?
12. Crontech: WebGPU video pipeline — still a priority, or defer?

---

*This document is the empire coordination layer. It does NOT create cross-repo dependencies — it tracks what each standalone platform has accomplished and what it should do next. Future Claude sessions should read this file + the relevant repo's hardening plan before starting work.*
