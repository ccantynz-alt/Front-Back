# Zoobicon.com — Hardening Plan & Revenue Protection

**Status:** ACTIVE. Revenue-bearing platform with 4 pricing tiers (Creator/Pro/Agency/WhiteLabel).
**Audited:** 2026-04-11 (full codebase audit, 1158 code files)
**Repo:** `ccantynz-alt/Zoobicon.com` — standalone, Next.js 14 App Router + Vercel + Neon Serverless Postgres
**Branch:** `claude/setup-multi-repo-session-x5wFz`
**Standalone rule:** Zoobicon imports ZERO code from Crontech, emailed, or GateTest. Patterns may be borrowed; code may not.

---

## The Green Ecosystem Mandate (binding, 20-year horizon)

> No error, broken link, dead button, 404, unstyled page, or runtime exception reaches the customer — ever. Every fix in this document must preserve this invariant. GateTest is the enforcement mechanism.

---

## Executive Summary

Zoobicon is a **feature-rich AI website builder** with 114+ components, OpenSRS domain registration, a 7-agent build pipeline (Strategist → Brand Designer → Copywriter → Architect → Developer → SEO → Animation), multi-LLM support (Anthropic primary, OpenAI/Gemini fallback stubs), and a Replicate-powered video pipeline (12+ models). Customer sites hosted at `zoobicon.sh`.

The platform has **real paying customers** and **real revenue at risk**. Tonight's session fixed 3 critical bugs that were actively leaking money or exposing data.

---

## What Landed Tonight (Session 2026-04-11)

| Commit | Fix | Impact | Craig Action Required |
|---|---|---|---|
| `37022ce` | **Stripe webhook dedup → Upstash Redis** (was in-memory LRU, cold start = duplicate charges) | Revenue leak closed. Atomic `SET NX` with 24h TTL. Falls back to in-memory if Upstash not configured. | Add `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` to Vercel env (free tier at upstash.com) |
| `554b035` | **Mailgun inbound webhook HMAC verification** (was accepting unsigned POSTs — anyone could inject fake emails) | Security hole closed. `crypto.timingSafeEqual` + 5-minute replay guard. Missing key = reject all with 401. | Add `MAILGUN_WEBHOOK_SIGNING_KEY` to Vercel env |
| `795c646` | **Password reset token TTL + single-use** (was unlimited validity — intercepted token usable months later) | Auth hardened. DB-enforced `reset_token_expires_at = now() + 1 hour`. Token nulled on successful reset. | Run `/api/db/init` after deploy (provisions new columns via `ADD COLUMN IF NOT EXISTS`) |

**Build:** passing (pre-existing unrelated warnings only). **Push:** branch tracked on origin.

---

## Surface Inventory (20 surfaces from audit)

| # | Surface | Maturity | Key files | Red flags |
|---|---|---|---|---|
| 1 | Auth (email+OAuth, JWT localStorage) | 90% | `src/app/api/auth/` (14 routes), `src/lib/auth-guard.ts` | Hardcoded `unknown@zoobicon.com` fallback; auth guard checks localStorage only |
| 2 | Database (Neon serverless, raw SQL) | 90% | `src/lib/db.ts`, 14+ tables | No foreign key constraints; no RLS; cold-start pool warmup missing |
| 3 | Billing (Stripe v21, 4 plans) | 90% | `src/app/api/stripe/webhook/route.ts`, `src/lib/stripe.ts` | ✅ Dedup FIXED tonight. Metadata parsing fragile (CSV+JSON) |
| 4 | AI layer (Anthropic primary, 7 agents) | 85% | `src/lib/llm-provider.ts`, `src/lib/agents.ts` (51KB) | OpenAI/Gemini keys missing; 7-agent pipeline orphaned (builder bypasses it) |
| 5 | Background jobs (Vercel crons only) | 40% | `src/app/api/cron/` (10 jobs) | No durable queue; no retry; no DLQ; cron failures silent |
| 6 | Email sending (Mailgun) | 80% | `src/app/api/email/`, `src/lib/email-template.ts` | No fallback; no retry; no rate limit on send endpoint |
| 7 | Email receiving (ImapFlow) | 60% | `src/lib/imap-provider.ts` | No reconnection; no error handling; creds env-only |
| 8 | File storage (Neon BYTEA only) | 30% | `src/lib/db.ts` schema | ❌ Zero durability. Sites in BYTEA. Video outputs lost on cold start. Need R2/S3/MinIO. |
| 9 | Feature flags | 0% | hardcoded + localStorage | ❌ MISSING. No runtime toggles, no A/B, no gradual rollout. |
| 10 | Audit logging (Postgres table) | 70% | `src/lib/audit-log.ts` | Not auto-hooked to events; no retention policy; table grows unbounded |
| 11 | Rate limiting (in-memory Map) | 20% | `src/lib/rateLimit.ts` | ❌ CRITICAL. Cold start = zero limits. Need Upstash Redis (already in repo after tonight). |
| 12 | Webhooks in (Stripe + Mailgun) | 85% | `src/app/api/stripe/webhook/`, `src/app/api/email/webhook/` | ✅ Stripe dedup FIXED. ✅ Mailgun HMAC FIXED tonight. |
| 13 | Webhooks out | 0% | N/A | ❌ MISSING. No outbound webhook support for customers. |
| 14 | Video pipeline (Replicate, 12+ models) | 50% | `src/lib/video-pipeline.ts` (180KB) | ❌ Untested E2E. Model slugs may be stale. Polling naive. No cost control. |
| 15 | Domain registration (OpenSRS/Tucows) | 85% | `src/lib/domain-reseller.ts` | Contact info fallback weak; no ICANN accreditation (3x markup) |
| 16 | Component registry (114 components) | 90% | `src/lib/component-registry/` | Only 6 next-gen patterns; target 150+ |
| 17 | Agent pipeline (7 agents) | 70% | `src/lib/agents.ts` | ❌ Orphaned — builder UI uses different endpoint. Wire or delete. |
| 18 | Multi-tenancy | 60% | DB queries, `user_email` scoping | ❌ No RLS. SQL injection = full breach. Application-layer only. |
| 19 | Secrets management | 70% | Vercel env vars | No rotation. Previous Mailgun key leak (2-week shutdown). |
| 20 | Deploy (Vercel + Render fallback) | 90% | `vercel.json`, `render.yaml` | Render stale. Post-deploy health checks not blocking. |

---

## Remaining Red Flags (ranked by urgency)

### CRITICAL (fix next session)

| # | Issue | Impact | Fix | Effort |
|---|---|---|---|---|
| C1 | **Rate limiting in-memory** — cold start = zero limits for 5 min | DDoS-able; `/api/domains/search` hammerable | Extend the `src/lib/redis.ts` added tonight to rate-limit endpoints. Upstash is already wired. | S |
| C2 | **Multi-tenancy: no Postgres RLS** — SQL injection = full data breach | All user projects accessible via injection | Add RLS policies on Neon: `ALTER TABLE projects ENABLE ROW LEVEL SECURITY; CREATE POLICY ...` + DB connection per-user scoping | L |
| C3 | **File storage: zero durability** — sites in BYTEA, video outputs in memory | Customer sites evaporate on DB timeout; videos lost on cold start | Migrate to Vercel Blob or Cloudflare R2 for site HTML + video outputs. Keep BYTEA as cache/fallback. | L |
| C4 | **Video pipeline untested E2E** — Replicate model slugs may be stale | No customer can generate a video (hasn't been tested since rebuild 2026-04-07) | Run full E2E test of the pipeline. Update stale model slugs. Add a health-check cron. | M |
| C5 | **AI failover not wired** — OpenAI/Gemini keys missing | Anthropic 529 = builder down | Craig sets `OPENAI_API_KEY` + `GOOGLE_GEMINI_API_KEY` in Vercel. Code already handles fallback. | S (env vars) |

### HIGH (fix within 2 weeks)

| # | Issue | Fix | Effort |
|---|---|---|---|
| H1 | Background jobs: no durable queue, no retry, no DLQ | Add BullMQ + Upstash Redis (already wired) or Inngest for serverless jobs | L |
| H2 | 7-agent pipeline orphaned — builder UI bypasses it | Wire builder UI to offer "quick" (Haiku) vs "full pipeline" (7 agents) toggle | M |
| H3 | Audit logging not auto-hooked to auth/billing/deploy events | Add `audit.log()` calls to all sensitive operations | M |
| H4 | IMAP email receiving: no error handling, no reconnection | Add try/catch + exponential backoff + reconnect-on-error in ImapFlow provider | M |
| H5 | No feature flag system | Implement plan-based + runtime toggles via Upstash Redis (already wired) | M |

### MEDIUM (fix within 4 weeks)

| # | Issue | Fix | Effort |
|---|---|---|---|
| M1 | Audit log table grows unbounded — no retention | Add 90-day TTL or archive to R2/S3 | S |
| M2 | Email sending: no fallback beyond Mailgun | Add AWS SES or Resend as fallback provider | M |
| M3 | Component registry: only 6 next-gen patterns | Add 30+ next-gen patterns to match Lovable/Bolt | L |
| M4 | Secrets rotation: no automation | Add rotation schedule + alerts for key age > 90 days | M |
| M5 | `zoobicon.sh` hosting: no CDN, no caching headers | Add Cloudflare CDN or Vercel Edge caching for published sites | M |

---

## GateTest Integration

Install `GateTestHQ` GitHub App on `ccantynz-alt/Zoobicon.com`. GateTest scans PRs automatically — security (OWASP), accessibility (WCAG 2.2), performance (Core Web Vitals), SEO, broken links, and fake-fix-detector. Zero code imported. Reports via PR comments + commit status.

**When Phase 3 CI pipeline ships:** add `.github/workflows/gatetest.yml` as a required check on PRs to main.

---

## Zoobicon's Unique Moat (DO NOT carve, DO NOT extract)

These are Zoobicon-specific competitive advantages. They stay in this repo:

1. **Video pipeline** — 12+ Replicate models, $0.10-0.30 per 30s video. Cheaper than competitors.
2. **114+ component registry** — pre-built React components with Tailwind, responsive, accessible.
3. **OpenSRS domain registration** — in-app domain purchase + DNS setup + `zoobicon.sh` hosting.
4. **7-agent build pipeline** — Strategist → Brand Designer → Copywriter → Architect → Developer → SEO → Animation.
5. **Diff-based editing** — AI edits existing sites by patching, not regenerating from scratch.

---

## Open Questions (TBD — Craig to confirm)

1. **Video pipeline: test + fix stale models, or pause video feature until post-launch?** Video is complex and untested. May be safer to launch without it and add later.
2. **Agent pipeline: wire into builder UI, or remove dead code?** 51KB of orphaned agent code adds maintenance burden if unused.
3. **OpenSRS markup (3x): pursue ICANN accreditation for better margins, or accept markup?** ICANN accreditation costs ~$4K + annual fees.
4. **Render.yaml: delete stale config, or keep as documented fallback?**

---

## Session Log

| Date | Session | What landed | Commits |
|---|---|---|---|
| 2026-04-11 | Multi-repo audit + fix | Upstash Redis dedup, Mailgun HMAC, password reset TTL | `37022ce`, `554b035`, `795c646` |

---

*This document is the durable memory for Zoobicon. Future Claude sessions working on Zoobicon should read this file first, then execute the next unchecked item in the red-flag ranking. Each fix is standalone — no fix depends on Crontech, emailed, or GateTest shipping anything.*
