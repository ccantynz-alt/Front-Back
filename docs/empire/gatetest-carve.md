# GateTest — Hardening Plan & Empire QA Gate Strategy

**Status:** ACTIVE. Revenue product ($29-$399/scan) AND the empire's green-ecosystem enforcement tool.
**Audited:** 2026-04-11 (full codebase audit, 82 code files)
**Repo:** `ccantynz-alt/GateTest` — standalone, Node.js CLI + Next.js 16 website on Vercel
**Branch:** `claude/setup-multi-repo-session-x5wFz`
**Standalone rule:** GateTest imports ZERO code from Crontech, emailed, or Zoobicon. It SCANS those repos externally; it does not share code with them.

---

## The Green Ecosystem Mandate (binding, 20-year horizon)

> No error, broken link, dead button, 404, unstyled page, or runtime exception reaches the customer — ever. GateTest IS the enforcement mechanism for this mandate across the entire empire.

---

## Executive Summary

GateTest is a **24-module QA scanning engine** with a unique competitive weapon: the **fake-fix-detector** — the only tool that detects when AI coding assistants (Claude, Copilot) apply symptom patches instead of real fixes (deleting assertions, swallowing errors, commenting out failing tests).

GateTest has TWO missions:
1. **Revenue product:** SaaS at $29 (Quick), $99 (Full), $199 (Scan+Fix), $399 (Nuclear) per scan. Stripe Payment Intents with manual capture (hold-then-charge).
2. **Empire QA gate:** Installed via GitHub App (`GateTestHQ`) on Crontech, Zoobicon, emailed — enforces green ecosystem without code contamination.

Tonight's session fixed 3 critical bugs that were risking revenue and leaking data.

---

## What Landed Tonight (Session 2026-04-11)

| Commit | Fix | Impact |
|---|---|---|
| `0d9e30e` | **Admin panel auth** — GitHub OAuth + allowlist (was zero auth, anyone could see customer scans) | Data leak closed. Server-rendered auth check. Missing env vars = "not configured" page, never exposes data. |
| `2d4cc54` | **Stripe webhook → async scan** — via `next/server after()` (was running scan inline in webhook, 60s timeout = double charge) | Double-charge bug fixed. Webhook returns 200 in milliseconds. Scan runs in background. Idempotent: `sha256("gatetest-scan:" + session.id)` stamps the payment intent before scan starts; retries short-circuit. |
| `97122a4` | **Claude API cost cap** — per-scan ledger with tier-specific ceilings (was unbounded, $199 scan could cost $50+ in API) | Margin protected. Ceilings: Quick=$1, Full=$3, Scan+Fix=$15, Nuclear=$30. At 80% ceiling → downgrade to Haiku. At 95% → stop AI calls, mark remaining hunks "unverified". Cost report attached to scan output. |

**Tests:** 62/62 pass. **Build:** 20 static + 9 dynamic pages. **CLI:** all 22 modules load. **Zero new dependencies** (used built-in `crypto` + `next/server.after`). **Push:** branch tracked on origin.

**Craig action required:** add to Vercel env:
- `GATETEST_ADMIN_USERNAMES` (your GitHub login, comma-separated)
- `SESSION_SECRET` (any random 32+ char string)
- `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` (from existing GateTestHQ GitHub App)

---

## Module Inventory (24 modules)

| Module | File | What it does | Substrate-worthy? |
|---|---|---|---|
| **syntax** | `src/modules/syntax.js` | JS/TS/JSON compilation errors | No — trivial |
| **lint** | `src/modules/lint.js` | ESLint/Stylelint integration | No — vendor-specific |
| **secrets** | `src/modules/secrets.js` | API key/token/password regex detection | Yes — generic pattern engine |
| **code-quality** | `src/modules/code-quality.js` | console.log, debugger, TODO, eval, complexity | Yes — generic rules |
| **unit-tests** | `src/modules/unit-tests.js` | Jest/Vitest/Mocha detection + execution | No — framework-specific |
| **integration-tests** | `src/modules/integration-tests.js` | API/service integration test detection | No — context-dependent |
| **e2e** | `src/modules/e2e.js` | Playwright/Cypress stub | No — framework-specific |
| **visual** | `src/modules/visual.js` | Layout shift, font, z-index checks | Maybe |
| **accessibility** | `src/modules/accessibility.js` (19KB) | WCAG 2.2 AAA: alt text, ARIA, focus, contrast | Yes — core, comprehensive |
| **performance** | `src/modules/performance.js` | Bundle budgets, Core Web Vitals, Lighthouse | Yes — generic thresholds |
| **security** | `src/modules/security.js` (24KB) | OWASP patterns, CVE detection, CSP, XSS/SQLi | Yes — core, comprehensive |
| **seo** | `src/modules/seo.js` | Meta tags, Open Graph, sitemaps, structured data | Yes — standard rules |
| **links** | `src/modules/links.js` | Broken internal/external link detection | Yes — generic crawler |
| **compatibility** | `src/modules/compatibility.js` | Browser matrix, polyfill checks | Maybe |
| **data-integrity** | `src/modules/data-integrity.js` | Schema, migrations, PII handling | Maybe |
| **documentation** | `src/modules/documentation.js` | README, CHANGELOG completeness | Maybe |
| **fake-fix-detector** | `src/modules/fake-fix-detector.js` (18.6KB) | **THE SPEAR** — detects AI symptom patches | Yes — unique moat |
| **ai-review** | `src/modules/ai-review.js` | Claude API code review | Yes — generic AI engine |
| **live-crawler** | `src/modules/live-crawler.js` (21.9KB) | Crawls live site, tests every page | No — GateTest-specific |
| **mutation** | `src/modules/mutation.js` | Mutation testing (code changes + retest) | Maybe |
| **explorer** | `src/modules/explorer.js` (23KB) | File tree analysis, dependency graphs | Yes — powerful analysis |
| **chaos** | `src/modules/chaos.js` | Chaos engineering (fault injection) | No — experimental |

**The Spear — fake-fix-detector:** Two-engine design: (1) deterministic pattern rules (30+ rules, zero API cost) catch common AI symptom patches, (2) Claude API verification asks "is this disabling the check that exposed the bug?" for each diff hunk. Pattern engine catches ~80% of fakes at zero cost; AI engine catches the subtle remaining 20% at API cost (now capped per tonight's fix).

---

## Architecture

```
CLI (bin/gatetest.js)          Website (website/, Next.js 16)
       │                              │
       ├─ Core runner                  ├─ Stripe checkout → Payment Intent
       ├─ Module registry              ├─ Stripe webhook → after() → scan job
       ├─ Config/suite mgmt            ├─ Scan execution → capture/cancel
       ├─ Cache (file change tracking) ├─ GitHub App webhooks → PR comments
       └─ GitHub bridge (33KB)         ├─ GitHub OAuth (new: admin)
                                       └─ Admin panel (new: auth-gated)
```

**Key architectural note:** GateTest CLI has **ZERO npm dependencies**. The scanning engine is pure Node.js. This is a deliberate choice — makes `npx gatetest@latest` instant and safe. The website is a separate Next.js app with its own deps.

---

## Remaining Red Flags (ranked by urgency)

### CRITICAL (fix next session)

| # | Issue | Impact | Fix | Effort |
|---|---|---|---|---|
| C1 | **No real database** — all state in Stripe metadata (500 char/value, 50 keys max) + filesystem (.gatetest/) | Can't scale to teams; scan history lost on redeploy; large scans overflow metadata | Add Neon serverless Postgres or Turso SQLite. Tables: scans, scan_results, customers. Stripe metadata stores only idempotency key + scan ID reference. | M |
| C2 | **GitHub API rate limit** — no caching or batching | Scans fail on medium+ repos (60 req/hour limit for unauthenticated) | Use authenticated GitHub API (GateTest already has App JWT). Add response caching (5-min TTL). Batch file-tree requests. | M |
| C3 | **Website test coverage = 0** — checkout flow, webhook handler, OAuth callback all untested | Stripe integration could break silently | Add Playwright E2E for checkout flow + webhook simulation. Add unit tests for admin session, scan executor. | M |

### HIGH (fix within 2 weeks)

| # | Issue | Fix | Effort |
|---|---|---|---|
| H1 | Fake-fix-detector pattern rules unmaintained (30+ rules, no versioning) | Add version field + quarterly review schedule. Allow CLI users to update rules via `gatetest --update-rules`. | S |
| H2 | Module loading: custom modules via `require()` with no sandboxing | Add basic sandboxing (vm2 or isolated-vm) for custom `.gatetest/modules/` | M |
| H3 | No `.env.example` for the CLI or website | Create `.env.example` files documenting all required env vars | S |
| H4 | Scan report storage: ephemeral (Stripe metadata + filesystem) | Store reports in the database from C1. Add retention policy (90 days default). | M (depends on C1) |

### MEDIUM (fix within 4 weeks)

| # | Issue | Fix | Effort |
|---|---|---|---|
| M1 | Admin panel UI is a stub — no customer list, no revenue dashboard | Build admin dashboard: scan history, revenue by tier, cost reports, customer list | M |
| M2 | No Stripe customer portal link in website | Add `/billing` page that redirects to Stripe Customer Portal | S |
| M3 | CI generator covers GitHub Actions, GitLab CI, CircleCI — may be stale | Verify all 3 templates still valid against latest CI runner versions | S |

---

## GateTest as Empire QA Gate

GateTest's dual role: (1) revenue product for external customers, (2) internal green-ecosystem enforcer for Crontech, Zoobicon, and emailed.

**Installation per repo (no code contamination):**

| Repo | Integration method | Modules to run | Notes |
|---|---|---|---|
| Crontech | GitHub App `GateTestHQ` | security, accessibility, performance, seo, links, fake-fix-detector, code-quality | Block PR merge on any CRITICAL finding |
| Zoobicon | GitHub App `GateTestHQ` | Same + visual (layout shift), compatibility (browser matrix) | Zoobicon has 463 pages — needs `links` module especially |
| emailed | GitHub App `GateTestHQ` | Same + data-integrity (PII handling) | Email platform = PII everywhere |
| GateTest itself | `npm test` + self-scan via `node bin/gatetest.js --suite full` | All modules (self-dogfood) | GateTest must pass its own scan |

**Revenue model for empire use:** empire repos use GateTest for free (dogfood). External customers pay $29-$399/scan. The empire usage is marketing: "GateTest is so good we use it on all our own products."

---

## Open Questions (TBD — Craig to confirm)

1. **Does GateTest have live paying customers?** The audit found Stripe integration deployed but no customer records (no database). Confirm before investing in scaling infrastructure.
2. **Database choice: Neon Postgres or Turso SQLite?** Neon is more capable (JSON, full-text search). Turso is cheaper and simpler. Craig to pick.
3. **Pricing: are tiers locked?** Quick $29, Full $99, Scan+Fix $199, Nuclear $399. Any changes?
4. **npm publish: is `gatetest` published to npm?** Package.json has `bin` field but no publish config. Confirm if `npx gatetest@latest` is live.
5. **GitHub App `GateTestHQ`: is it installed on Crontech/Zoobicon/emailed repos yet?** If not, Craig to install.

---

## Session Log

| Date | Session | What landed | Commits |
|---|---|---|---|
| 2026-04-11 | Multi-repo audit + fix | Admin auth, async scan, API cost cap | `0d9e30e`, `2d4cc54`, `97122a4` |

---

*This document is the durable memory for GateTest. Future Claude sessions working on GateTest should read this file first, then execute the next unchecked red flag. Each fix is standalone — no fix depends on Crontech, emailed, or Zoobicon shipping anything.*
