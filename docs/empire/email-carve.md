# emailed — Hardening Plan & Ship-Blocker Roadmap

**Status:** ACTIVE. This is the priority platform — ship first, ship fast.
**Audited:** 2026-04-11 (full codebase audit, 532 TS/TSX files, ~152K LOC)
**Repo:** `ccantynz-alt/emailed` — standalone, Bun+Turbo+Next.js 15+Hono+Drizzle+Postgres+Redis+Cloudflare
**Branch:** `claude/setup-multi-repo-session-x5wFz`
**Standalone rule:** emailed imports ZERO code from Crontech, Zoobicon, or GateTest. Patterns may be borrowed; code may not.

---

## The Green Ecosystem Mandate (binding, 20-year horizon)

> No error, broken link, dead button, 404, unstyled page, or runtime exception reaches the customer — ever. Every fix in this document must preserve this invariant. GateTest is the enforcement mechanism. If a fix would violate the mandate even briefly, the fix gets a feature flag and a progressive rollout instead of a hard switch.

---

## Executive Summary

emailed is the **most production-ready platform in the empire** — ahead of Crontech on durability (BullMQ durable queues, Redis-backed rate limiting, Cloudflare R2 storage, multi-tenant `accountId` scoping on every table, HMAC-SHA256 webhook signatures with auto-deactivate). It has 9 apps, 27 Drizzle tables, 153 AI-engine files, a custom RFC 5321 SMTP server, and full DKIM/DMARC/SPF infrastructure.

**The ship-blocker is reputation protection**, not durability. Without bulletproof sender reputation, every email lands in spam and the platform is dead. Reputation destruction is permanent — once Gmail/Outlook mark the IP, recovery takes months.

**Three reputation fixes landed tonight** (session 2026-04-11):
- `e9e067d` — SPF recursive `include:` expansion (RFC 7208 compliant, 20 new tests)
- `49bd182` — Auto warm-up enrolment with hard day-limit enforcement
- `50e29ff` — Custom header whitelist + CRLF injection guard (39 tests)

**Remaining work is ranked below by phase.**

---

## What Landed Tonight (Session 2026-04-11)

| Commit | Fix | Impact | Tests |
|---|---|---|---|
| `e9e067d` | SPF `include:` recursive expansion per RFC 7208 §5.2 | Valid senders no longer rejected; circular chains return `permerror` safely; 10-lookup cap enforced | 6 new, 20 total |
| `49bd182` | Auto warm-up enrolment + hard `WARMUP_LIMIT_EXCEEDED` rejection | New domains auto-throttled (50→100→500→1K→5K→25K→100K→unlimited); bounce-rate gated; no manual trigger needed | 12 new |
| `50e29ff` | Custom header whitelist + CRLF/NUL injection guard | Banned headers (Bcc, From, DKIM-Signature, ARC-*, etc) blocked; `X-Custom-*` namespace (≤10 per msg, ≤256B each); header injection impossible | 39 new |

**Build:** 26/26 turbo tasks green. **Tests:** 130/130 pass. **Push:** branch tracked on origin.

---

## Surface Inventory (20 surfaces from audit)

| # | Surface | Maturity | Classification | Red flags |
|---|---|---|---|---|
| 1 | Auth (email/password, WebAuthn passkeys) | 85% | Standalone | HS256 JWT in dev (hardcoded secret); no refresh token rotation |
| 2 | Auth (OAuth: Gmail, Outlook; SAML 2.0 SSO) | 95% | Standalone | Email-specific OAuth scopes; SAML SP wired |
| 3 | Database (Drizzle, 27 tables, multi-tenant) | 100% | Standalone | `email_status` enum missing "draft" (uses "queued"); DNS records no liveness check |
| 4 | Billing (Stripe: Free/Starter/Pro/Enterprise) | 95% | Standalone | No hard quota enforcement (soft limits only) |
| 5 | AI layer (Claude Haiku/Sonnet/Opus, 153 files) | 100% | Standalone | No per-account token metering; no cost guardrails |
| 6 | Background jobs (BullMQ, Redis-backed) | 95% | Standalone | No DLQ processing logic; manual inspection only |
| 7 | Email sending (custom SMTP, DKIM Ed25519, DMARC) | 95% | Standalone | FBL not integrated; SPF include expansion FIXED tonight |
| 8 | Email receiving (SMTP inbound, IMAP sync, JMAP stub) | 90% | Standalone | Open relay risk if not gated; threading headers-only |
| 9 | File storage (Cloudflare R2, presigned URLs) | 95% | Standalone | No virus scanning; no per-user storage quota |
| 10 | Feature flags | 0% | MISSING | No runtime toggle system; plan-tier only |
| 11 | Audit logging (events table, append-only) | 85% | Standalone | No admin action audit; no data access logging; hard deletes |
| 12 | Rate limiting (Redis sliding window + in-memory fallback) | 95% | Standalone | No hard quota enforcement |
| 13 | Webhooks (HMAC-SHA256, retry, auto-deactivate) | 95% | Standalone | Production-grade; no issues |
| 14 | Secrets management (.env, Vercel/CF secrets) | 80% | Standalone | No rotation automation; SHA-256 for passwords (should be Argon2) |
| 15 | Deploy (Cloudflare Pages + Fly.io) | 95% | Standalone | No CI/CD pipeline (GitHub Actions) |
| 16 | Observability (OpenTelemetry) | 85% | Standalone | No Sentry; no alerting; no log aggregation |
| 17 | Router/API (Hono, 30+ routes, OpenAPI 3.0) | 100% | Standalone | Clean, versioned, type-safe |
| 18 | Tests (Vitest, 32 test files) | 80% | Standalone | No CI/CD; no coverage tracking; no load testing |
| 19 | Desktop app (Electron) | 90% | Standalone | Builds clean |
| 20 | Mobile app (React Native + Expo) | 90% | Standalone | Scaffolded with accessibility |

---

## Phase 0 — Reputation Protection (SHIP BLOCKER — do first)

These 8 items must all be green before ANY sending volume ramps. Order matters.

| # | Fix | Status | Effort | Files |
|---|---|---|---|---|
| 0.1 | SPF `include:` recursive expansion | ✅ DONE tonight | — | `services/mta/src/spf/validator.ts` |
| 0.2 | Auto warm-up enrolment + hard day-limit | ✅ DONE tonight | — | `services/reputation/src/warmup/orchestrator.ts` |
| 0.3 | Custom header injection prevention | ✅ DONE tonight | — | `services/mta/src/smtp/header-validator.ts` |
| 0.4 | ISP Feedback Loop (FBL) integration | ❌ TODO | M | Register with Gmail Postmaster Tools, Yahoo CFL, Microsoft JMRP/SNDS. Parse FBL reports (ARF format), auto-add complainers to suppression list. File: `services/reputation/src/fbl/` |
| 0.5 | Domain DNS liveness re-verification | ❌ TODO | S | Periodic job (BullMQ repeat, daily) that re-checks DKIM/DMARC/SPF DNS records for every verified domain. If records go stale, flag domain + pause sending. File: `services/dns/` |
| 0.6 | Virus scanning on inbound attachments | ❌ TODO | M | Integrate ClamAV (self-hosted on Fly.io) or VirusTotal API. Scan at SMTP DATA acceptance before storing to R2. Reject infected attachments with `550 5.7.1 virus detected`. File: `services/inbound/src/receiver/` |
| 0.7 | Hard quota enforcement at send time | ❌ TODO | S | In `apps/api/src/routes/messages.ts`, check `account.usageMetrics.emailsSentThisMonth` against plan limit BEFORE enqueue. Return `429 QUOTA_EXCEEDED` with plan details. Currently soft-limited only. |
| 0.8 | Suppression list enforcement timing | ❌ VERIFY | S | Confirm suppression check happens BEFORE BullMQ enqueue (not after). If checked after, a suppressed address still gets queued and wastes a warmup slot. Trace the code path in `apps/api/src/routes/messages.ts` → `services/mta/src/queue/manager.ts`. |

**Exit criteria for Phase 0:** All 8 green. Then, and only then, ramp sending volume.

---

## Phase 1 — Durability Hardening (weeks 2-3)

| # | Fix | Severity | Effort | Description |
|---|---|---|---|---|
| 1.1 | Request-level idempotency tokens | HIGH | M | Add `Idempotency-Key` header support to all mutating endpoints. Track in DB (idempotency_keys table: key, response, created_at, expires_at 24h). Return cached response on duplicate. Prevents duplicate sends from client retries. |
| 1.2 | DLQ (dead-letter queue) for exhausted jobs | HIGH | S | BullMQ supports DLQ natively. Configure `deadLetterQueue` option on `emailed:outbound` and `emailed:webhooks` queues. Add admin route to inspect + replay dead letters. |
| 1.3 | `email_status` enum: add "draft" value | MEDIUM | S | Drizzle schema change + migration. Currently using "queued" as workaround. Fixes data confusion in analytics. |
| 1.4 | Feature flag system | MEDIUM | M | Plan-based + runtime toggles. Store flags in Redis (Upstash). Simple: `isEnabled(accountId, flagName): boolean`. Progressive rollout by percentage. No PostHog dependency — keep standalone. |
| 1.5 | Soft deletes with tombstones | HIGH | M | Add `deleted_at TIMESTAMPTZ` to emails, attachments, contacts. Index on `deleted_at IS NULL`. Change all queries to filter deleted. 30-day recovery window. Compliance (GDPR right-to-erasure audit trail). |
| 1.6 | Per-user storage quota | MEDIUM | S | Add `storage_used_bytes BIGINT` to accounts. Increment on R2 upload, decrement on delete. Check against plan limit before upload. Return `413 STORAGE_QUOTA_EXCEEDED`. |

---

## Phase 2 — Compliance Polish (weeks 3-4)

| # | Fix | Severity | Effort | Description |
|---|---|---|---|---|
| 2.1 | Admin action audit trail | HIGH | M | Track all admin console actions (user CRUD, plan changes, impersonation, config changes) to audit_events table. Required for SOC 2. |
| 2.2 | Data access logging | HIGH | M | Log all reads of email content + PII (who accessed what, when, from which IP). Required for GDPR DPA + HIPAA BAA. |
| 2.3 | Password hashing: SHA-256 → Argon2id | MEDIUM | S | `apps/api/src/routes/auth.ts` currently uses SHA-256 for password hashing. Migrate to Argon2id (`argon2` package). Rehash on next login (transparent migration). |
| 2.4 | JWT: HS256 → RS256 in production | MEDIUM | S | Switch from symmetric to asymmetric JWT signing. Add key rotation schedule. |
| 2.5 | Refresh token rotation | MEDIUM | M | Issue refresh tokens alongside access tokens. Rotate on every use. Detect token replay (family invalidation). |

---

## Phase 3 — Observability & CI (weeks 4-5)

| # | Fix | Severity | Effort | Description |
|---|---|---|---|---|
| 3.1 | GitHub Actions CI/CD pipeline | HIGH | M | `.github/workflows/ci.yml`: lint, type-check, test (Vitest), build (Turbo). Run on PR + push to main. Block merge on failure. |
| 3.2 | Error tracking (Sentry) | MEDIUM | M | Add `@sentry/node` to `apps/api`. Wire error boundaries. Group by error type. Alert on new errors. |
| 3.3 | Centralized logging | MEDIUM | M | Ship OpenTelemetry logs to Grafana Loki (or Datadog). Structured JSON logging across all services. |
| 3.4 | Alerting (PagerDuty/Opsgenie) | HIGH | M | Wire OpenTelemetry alert rules → PagerDuty. Alert on: bounce rate >5%, queue depth >1000, error rate >1%, SMTP connection failures. |
| 3.5 | Automated R2 backups | HIGH | S | Daily R2 → R2 cross-region replication or R2 → S3 backup. Neon point-in-time-recovery is already configured (verify). |
| 3.6 | Load testing | MEDIUM | L | k6 or artillery. Target: 10K concurrent SMTP connections, 100K emails/hour, 1K API req/sec. |

---

## GateTest Integration (green ecosystem enforcement)

GateTest runs as an **external scanner** — no code imported into emailed. Three integration modes (pick one or all):

**Option A — GitHub App (recommended):**
Install `GateTestHQ` GitHub App on `ccantynz-alt/emailed`. GateTest receives PR events, runs its 24 modules (security, accessibility, performance, SEO, links, fake-fix-detector, code-quality), posts commit status + PR comments. Zero code in emailed's repo.

**Option B — GitHub Actions workflow:**
Add `.github/workflows/gatetest.yml`:
```yaml
name: GateTest
on: [pull_request]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx gatetest@latest --suite full --report json
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Option C — Pre-push hook:**
```bash
#!/bin/sh
npx gatetest@latest --suite quick || exit 1
```

**Recommendation:** Start with Option A (GitHub App) — zero maintenance, automatic. Add Option B when CI/CD pipeline ships (Phase 3.1).

---

## Open Questions (TBD — Craig to confirm)

1. **Is emailed a dogfood-then-sunset product, or a flagship `cron.email.*` product?** The audit found emailed has 15 email-specific primitives (SMTP server, DKIM/DMARC/SPF, bounce classification, reputation warmup, voice cloning, overnight agent, etc.) that could be monetized as a public API. Decision affects whether Phase 2-3 get enterprise polish or MVP-and-ship.

2. **Pricing tiers — are Free/Starter/Pro/Enterprise locked?** The audit found plan limits in `apps/api/src/lib/billing.ts` but CLAUDE.md says pricing requires Craig authorization to change.

3. **Which ISPs to register FBL with first?** Gmail Postmaster Tools is mandatory. Yahoo CFL and Microsoft JMRP/SNDS are recommended. AOL FBL is deprecated. Confirm priority order.

4. **Desktop app (Electron) — ship now or defer?** It's 90% polished but adds support surface. May be better to ship web-only first, desktop v2.

5. **Mobile app (React Native) — ship now or defer?** Same question. 90% scaffolded. Adds App Store review cycle.

6. **Domain: emailed.* or cron.email.*?** Affects branding, DNS, marketing.

7. **Virus scanning: ClamAV (self-hosted, free, slower) or VirusTotal API (hosted, $$$, faster)?** ClamAV on Fly.io is ~$5/month. VirusTotal premium is $$$. Craig to pick.

---

## Session Log

| Date | Session | What landed | Commits |
|---|---|---|---|
| 2026-04-11 | Multi-repo audit + fix session | SPF expansion, auto-warmup, header validator | `e9e067d`, `49bd182`, `50e29ff` |

---

*This document is the durable memory for emailed. Future Claude sessions working on emailed should read this file first, then execute the next unchecked phase. Each phase is independent — no phase depends on Crontech, Zoobicon, or GateTest shipping anything.*
