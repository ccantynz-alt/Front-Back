# Competitive Reality — Crontech vs the platforms it claims to replace

> **Doctrine note.** This file is a permanent reality check, not a marketing
> document. It is the answer to "are we actually a better Vercel /
> Cloudflare / Render / Mailgun / Twilio yet?" Answer today: **no.** This
> document tracks how far behind we are, what we have that they don't,
> and what we have to build to close the gap. It is updated on every
> session that ships product. Drift between this file and reality is a
> doctrine breach.
>
> Authored 2026-04-27 in response to Craig's challenge: *"this is for real
> we'd run this over the next month and we haven't even done our audits
> yet... we're onboarding now, we're onboarding all our platforms."*

---

## Bottom line up front

Crontech currently has **somewhere between 5% and 30% of any single named
competitor's product surface**, and **0%** of the integrated cross-vendor
offering (no one else attempts the all-in-one pitch). We are not yet a
better-anything. We are a working monorepo with one VPS, one tRPC API, one
SolidStart frontend, and a deploy pipeline that started reporting truthful
status only on 2026-04-26 after PR #198.

The pitch is "one platform replacing them all." The reality is "one
platform that hosts a static landing page from a single VPS and just got
its deploy chain working." Closing the gap is the entire roadmap.

What Crontech *does* have that the named competitors do not (real today,
not aspirational):

1. **End-to-end type safety** via tRPC + Zod with no codegen. None of the
   named platforms compete here. This is a real moat — surface it.
2. **AI-native architecture thesis** (three-tier compute: client GPU →
   edge → cloud). Cloudflare just shipped Workers AI; we are not behind
   on the *idea*, only on the implementation.
3. **Bleeding-edge stack** (Bun, SolidJS, Hono). Faster runtimes than
   what Vercel / Render run by default.
4. **Self-hostable end-state.** Vercel / Cloudflare are vendor-locked by
   design; we are vendor-locked today, but our architecture allows escape
   (Gluecron, dns-server, deploy-agent are concrete moves toward this).
5. **One bill, one dashboard, one product.** Nobody else even attempts
   this. Customers genuinely hate stitching five vendors together.

That is the moat. Everything else needs to be built.

---

## Per-competitor parity table

Each row is the honest state today. "Status" is one of:

- ✅ **Working in production** — we ship this, customers use it.
- 🟢 **Working but unsurfaced** — the code runs, no UI/marketing yet.
- 🟡 **Code in repo, not running** — file exists, service unit not enabled,
  or feature half-done. Doctrine breach: we built it then forgot to turn
  it on.
- ❌ **Not built** — neither code nor service exists.

### Vercel — estimated **~25% parity**

| Vercel product | Crontech equivalent | Status |
|---|---|---|
| Hosting (Next.js / static / SolidStart) | SolidStart on Vultr (single origin) | ✅ |
| Custom domains + auto-TLS | Caddy on Vultr | ✅ |
| Git-push deploy | `.github/workflows/deploy.yml` (just fixed 2026-04-26) | ✅ |
| Vercel AI SDK | We use the same SDK | ✅ |
| Edge Functions (V8 isolates at PoPs) | `services/edge-runtime/` (BLK-017 v0) — Bun-Worker stand-in for V8 isolates, single instance | 🟡 Code in repo, not running, not multi-region |
| Serverless Functions | Hono routes on the box | 🟢 (architecture differs but covers the use case) |
| Preview deployments per PR | None | ❌ |
| Image optimisation | None | ❌ |
| Vercel Analytics | None | ❌ |
| Speed Insights | None | ❌ |
| Vercel Storage (KV / Postgres / Blob) | Local Postgres on Vultr | 🟡 (single, not multi-tenant) |
| Build cache (Turborepo cloud) | Turborepo local + GitHub artifact upload | 🟢 |
| Team collaboration / permissions | Admin role flag in `users` table | 🟡 (schema exists, no UI) |
| Environment variable UI | Admin endpoints exist, no UI | 🟡 |

### Render — estimated **~20% parity**

| Render product | Crontech equivalent | Status |
|---|---|---|
| Web services (Docker / native) | crontech-web + crontech-api on Vultr | ✅ |
| Static sites | SolidStart static export | ✅ |
| Background workers | `services/queue/` exists | 🟡 (not running) |
| Cron jobs (managed) | systemd timers + watchdog | 🟢 (works for ourselves, no customer-facing offering) |
| Managed Postgres | Postgres on Vultr (single instance) | ✅ |
| Managed Redis | None | ❌ |
| Private services / VPC | None | ❌ |
| Auto-scaling | None | ❌ |
| Health checks | Deploy-agent does it | 🟢 |
| Disk storage (managed) | None as a managed product | ❌ |
| Custom domains + TLS | Caddy | ✅ |
| Auto-deploy from git | deploy.yml | ✅ |

### Cloudflare — estimated **~13% parity** (see also `docs/CLOUDFLARE_PARITY_AUDIT.md`)

Cloudflare ships 34+ products. We have working equivalents for ~3
(TLS via Caddy, type-safe API contracts via tRPC, base web hosting on
Vultr). Another ~9 exist as code in this repo but **are not running**
(`dns-server`, `deploy-agent`, `watchdog`, `queue`, `sentinel`, plus
the four 2026-04-26 v0 additions: `edge-runtime` BLK-017,
`object-storage` BLK-018, `tunnel` BLK-019, `ai-gateway` BLK-021).
The remaining ~22 are unbuilt.

The full breakdown is in `docs/CLOUDFLARE_PARITY_AUDIT.md` so this row
stays terse.

### Mailgun — estimated **~5% parity**

| Mailgun product | Crontech equivalent | Status |
|---|---|---|
| Transactional send (SMTP + REST) | `apps/api/src/email/client.ts` | 🟡 (file exists, no live sending pipeline) |
| Inbound email routing | `apps/api/src/email/alecrae-webhook.ts` (one webhook) | 🟡 (one customer hardcoded, no general routing) |
| Email validation | None | ❌ |
| Templates | None | ❌ |
| Open / click analytics | None | ❌ |
| SPF / DKIM / DMARC tooling | DNS UI surfaces alerts (per Cloudflare) | 🟡 (read-only, no automation) |
| Webhooks for events | None | ❌ |
| Suppression / bounce handling | None | ❌ |
| Email logs | None | ❌ |

We are not in this category yet. Anyone who needs email today routes to
a third party.

### Twilio — estimated **~3% parity**

| Twilio product | Crontech equivalent | Status |
|---|---|---|
| SMS (programmable) | `/sms` route + `/sms2` route exist in app | 🟡 (route exists, no carrier integration verified) |
| Voice | None | ❌ |
| WhatsApp | None | ❌ |
| Verify (OTP / 2FA) | TOTP planned per CLAUDE.md §3 | ❌ (planned, not built) |
| SendGrid email | None | ❌ |
| Studio (workflows) | None | ❌ |
| Phone number provisioning | None | ❌ |
| TaskRouter | None | ❌ |
| Flex (contact center) | None | ❌ |
| Lookup (phone validation) | None | ❌ |

We are not in this category either.

---

## What "onboarding" actually requires today

Onboarding a new platform / customer onto Crontech requires *all* of
these to be working end-to-end. The asterisks are doctrine breaches —
features that are either missing entirely or built-but-not-running:

| Step | Required | Status |
|---|---|---|
| 1. Customer signs up | `/register`, password / passkey / OAuth | ✅ |
| 2. Customer adds a domain | `tenant_git_repos` table + DNS proc + Caddy vhost | 🟡 (schema yes, automation partial) |
| 3. Customer points DNS at Crontech | Cloudflare or our own DNS | 🟢 Cloudflare works; ⭐ self-hosted dns-server **not running** |
| 4. Customer pushes code | git remote → webhook → deploy-agent | 🟢 GitHub-Actions path works; ⭐ Gluecron path live as of PR #202/#203 tonight, **untested end-to-end** |
| 5. Build runs in isolation | Per-tenant Cloudflare-Container or Fly.io microVM | ❌ Not built. Today every tenant build runs on the shared Vultr box. |
| 6. Static assets served | R2 or equivalent CDN | ❌ Not built. Caddy serves directly from Vultr disk. |
| 7. Logs streamed to customer | SSE log stream | 🟢 `deploymentLogsStreamApp` mounted; not surfaced in admin UI |
| 8. Health monitored | Watchdog + alert | ⭐ `crontech-watchdog.service` **not running** |
| 9. Customer can email + SMS users | Mailgun-equivalent + Twilio-equivalent | ❌ Not built (per tables above) |
| 10. Customer billed | Stripe metered | ❌ BLK-010 PLANNED, not started |
| 11. Customer sees analytics | Privacy-first analytics | ❌ Not built |

Nine of eleven onboarding steps have either no implementation or a
partial one. **This is the gap between "we onboard customers now" and
"we can onboard customers now."**

---

## The five doctrine breaches sitting in this repo today

Each of these has *working code in `services/` or `infra/`* and would
help onboarding immediately, but is **not running** on the Vultr box.
Turning them on requires no new code, only the right `systemctl
enable --now` invocation. Per CLAUDE.md §0.10 Zero-Idle Rule, leaving
shippable code unshipped is itself a breach.

| Service | Path | What it does | Why it matters for onboarding |
|---|---|---|---|
| `crontech-deploy-agent.service` | `infra/bare-metal/crontech-deploy-agent.service` | HTTP daemon on `127.0.0.1:9091` for git-pull / build / restart | Required for the BLK-016 Gluecron self-deploy hook (just shipped) to actually execute. |
| `crontech-watchdog.service` | `infra/bare-metal/crontech-watchdog.service` (+ `.timer`) | Periodic health curl + auto-restart on failure | Means the platform self-heals between deploys. Catches the next "site is silently down" before a human does. |
| `dns-server.service` | `infra/bare-metal/dns-server.service` (+ `services/dns-server/`) | Self-hosted authoritative DNS | Removes the Cloudflare dependency for DNS. Step toward true self-sufficiency. |
| `services/queue/` | `services/queue/` | Background job queue | Required for any non-blocking work (email sends, build triggers, deploys). |
| `services/sentinel/` | `services/sentinel/` (+ collectors) | 24/7 competitive intelligence + ecosystem monitoring | Per CLAUDE.md §0.3 Ahead-of-Competition Rule. The session-start hook reports "no intel store yet" every session — that's a 30+ session-old breach. |

**Five wins for zero new code.** Cost: an SSH session and `systemctl
enable --now` × 5. Should not survive past tonight.

---

## What the actual roadmap looks like, prioritised by leverage

This is a list, not a timeline. Each item is a discrete unit of work.
The order is "what gives the most onboarding capability per session of
work" — not "what we'll do this month."

1. **Turn on the five dormant services above.** Zero code. Largest
   immediate-effect single move available to us.
2. **Smoke test against the public URL in `deploy.yml`.** ~30 minutes
   of work. Catches the next 36-hour silent failure.
3. **Slack / email alert on deploy failure.** ~15 minutes. We never have
   to ask "why isn't the site updating" again.
4. **Cloudflare Health Checks** on `crontech.ai` and
   `api.crontech.ai/api/health`. ~10 minutes in the Cloudflare console.
   Free.
5. **Admin Ops page** at `/admin/ops`. Surfaces deploy status, recent
   commits, current SHA on box vs `Main`, log tail, three buttons
   (Deploy, Restart, Diagnose). Removes ~90% of SSH-and-paste manual
   loops. Per session estimate: 1-2 sessions.
6. **AI Gateway** — own LLM proxy with caching + provider failover.
   Single biggest leverage on cost + future product offering. Per
   session estimate: 1-2 sessions.
7. **R2-equivalent object storage** (self-hosted MinIO on Vultr or
   custom) — required for tenant assets, image uploads, video.
8. **WAF + rate-limit dashboard** in admin. We have the primitives
   already; surface them.
9. **Privacy-first first-party analytics.** No more Cloudflare-anything
   in the public site.
10. **Cloudflare Tunnel equivalent** so the origin IP can go private.
11. **Workers-equivalent edge runtime.** Largest CapEx gap, longest
    build, but the single feature that closes the Vercel-edge gap.
12. **Durable Objects equivalent.** Required for real-time collab + edge
    state.
13. **Stream-equivalent video pipeline.** Already in stack as ambition.
14. **Transactional email pipeline** (Mailgun replacement).
15. **SMS / Verify pipeline** (Twilio replacement, smallest needed
    surface to start).

Items 1–5 are all sub-day-of-work each and unblock most of customer
onboarding. Items 6–10 are session-scale (single focused session per
item). Items 11–15 are multi-session builds.

---

## How this file gets updated

- Every PR that ships a new product equivalent updates the relevant
  parity table row from 🟡 / ❌ to 🟢 / ✅.
- Every doctrine breach discovered (working code not running) gets
  added to "The five doctrine breaches" section.
- Every claim to a customer or in marketing copy must reconcile against
  the parity tables here. If the file says ❌ and the marketing says
  ✅, the marketing is wrong.
- Drift between this file and shipped reality is itself a doctrine
  breach and gets caught by GateTest module — the
  *workflow-script ↔ codebase coherence* module — once it ships.

This file does not flip Crontech's positioning. The positioning in
`docs/POSITIONING.md` ("the developer platform for the next decade") is
locked. This file just keeps us honest about how far we have to go to
earn the positioning.
