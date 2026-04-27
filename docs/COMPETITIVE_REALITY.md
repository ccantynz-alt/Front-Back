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
| 3. Customer points DNS at Crontech | Cloudflare or our own DNS | 🟢 Cloudflare works; self-hosted dns-server ✅ active on Vultr |
| 4. Customer pushes code | git remote → webhook → deploy-agent | 🟢 GitHub-Actions path works; deploy-agent ✅ active; Gluecron path live as of PR #202/#203, **untested end-to-end** |
| 5. Build runs in isolation | Per-tenant Cloudflare-Container or Fly.io microVM | ❌ Not built. Today every tenant build runs on the shared Vultr box. |
| 6. Static assets served | R2 or equivalent CDN | 🟡 BLK-018 v0 in repo (`services/object-storage/`), unit shipped, deploys on next push. |
| 7. Logs streamed to customer | SSE log stream | 🟢 `deploymentLogsStreamApp` mounted; not surfaced in admin UI |
| 8. Health monitored | Watchdog + alert | 🟢 `crontech-watchdog.timer` ✅ active; alert pipeline still pending |
| 9. Customer can email + SMS users | Mailgun-equivalent + Twilio-equivalent | ❌ Not built (per tables above) |
| 10. Customer billed | Stripe metered | ❌ BLK-010 PLANNED, not started |
| 11. Customer sees analytics | Privacy-first analytics | ❌ Not built |

Nine of eleven onboarding steps have either no implementation or a
partial one. **This is the gap between "we onboard customers now" and
"we can onboard customers now."**

---

## Self-hosted services: live state (last verified 2026-04-26 SSH session)

Each row shows code-in-repo state and on-the-box state separately.
Per CLAUDE.md §0.10 Zero-Idle Rule, "code in repo, not running" is a
breach; "no systemd unit at all" is a deeper breach.

| Service | Code in repo | systemd unit | Active on Vultr |
|---|---|---|---|
| `crontech-deploy-agent` | ✅ `services/deploy-agent/` | ✅ `infra/bare-metal/crontech-deploy-agent.service` | ✅ active |
| `crontech-watchdog` | ✅ `infra/bare-metal/crontech-watchdog.sh` | ✅ `crontech-watchdog.{service,timer}` | ✅ active |
| `dns-server` | ✅ `services/dns-server/` | ✅ `infra/bare-metal/dns-server.service` | ✅ active |
| `crontech-sentinel` (BLK-015) | ✅ `services/sentinel/` | ✅ `infra/bare-metal/crontech-sentinel.service` (added 2026-04-26) | ⚠️ next deploy enables |
| `crontech-ai-gateway` (BLK-021) | ✅ `services/ai-gateway/` | ✅ `infra/bare-metal/crontech-ai-gateway.service` (added 2026-04-26) | ⚠️ next deploy enables |
| `crontech-edge-runtime` (BLK-017) | ✅ `services/edge-runtime/` | ✅ `infra/bare-metal/crontech-edge-runtime.service` (added 2026-04-26) | ⚠️ next deploy enables |
| `crontech-tunnel-origin` (BLK-019) | ✅ `services/tunnel/` | ✅ `infra/bare-metal/crontech-tunnel-origin.service` | ⚠️ next deploy enables |
| `crontech-object-storage` (BLK-018) | ✅ `services/object-storage/` | ✅ `infra/bare-metal/crontech-object-storage.service` (relocated 2026-04-26) | ⚠️ next deploy enables (requires docker on box) |
| `queue` | ✅ `packages/queue/` (library, not a daemon) | n/a (consumed by workers) | n/a |

`deploy.yml` was updated 2026-04-26 to `cp` + `systemctl enable --now`
each unit on every push to `Main` (graceful failure with `|| true`
so a missing secret / docker / user doesn't break the deploy). After
the next merge to `Main`, the four ⚠️ rows flip to ✅ active.

**Status of the original "five dormant" call-out from 2026-04-25:** three
of the five (deploy-agent, watchdog, dns-server) are now live on the
Vultr box. The other two (queue, sentinel) were misclassified — `queue`
is a library, not a service; `sentinel` had no systemd unit and now does.

---

## What the actual roadmap looks like, prioritised by leverage

This is a list, not a timeline. Each item is a discrete unit of work.
The order is "what gives the most onboarding capability per session of
work" — not "what we'll do this month."

1. ~~**Turn on the five dormant services above.**~~ ✅ DONE 2026-04-26.
   Three live on box (deploy-agent, watchdog, dns-server). Two
   reclassified (queue is a library; sentinel got a unit and deploys
   on next push). New v0 services (BLK-017/018/019/021) all have units
   in repo and deploy on next push.
2. ~~**Smoke test against the public URL in `deploy.yml`.**~~ ✅ DONE
   2026-04-26 in commit `5c5abf0`. Job fails if `crontech.ai` or
   `api.crontech.ai` doesn't respond after deploy.
3. **Self-hosted alert pipeline on deploy failure.** Build it on top
   of BLK-030 (transactional email) — Slack is a vendor we're not
   adding. Delete `Cloudflare Health Checks` from this list — same
   reason. Per-session estimate: ships with BLK-030 v0.
4. ~~**Admin Ops page** at `/admin/ops`.~~ ✅ DONE 2026-04-26 in
   commit `5c5abf0`. Surfaces deploy drift, recent commits, services,
   diagnose battery.
5. **AI Gateway wired into existing AI consumers.** v0 service shipped
   2026-04-26 (`services/ai-gateway/`); next move is routing
   `apps/api/src/ai/*` and the Composer through the gateway. Single
   biggest leverage on cost + cache hit rate. Per-session estimate: 1.
6. **Object storage cutover to BLK-018.** v0 service shipped
   2026-04-26 (`services/object-storage/`); next move is routing
   tenant uploads through it. Per-session estimate: 1.
7. **Tunnel cutover (BLK-019).** v0 daemon shipped 2026-04-26
   (`services/tunnel/`); next move is enabling on the box +
   privatising the origin IP. Per-session estimate: 1.
8. **Edge runtime first customer (BLK-017).** v0 dispatcher shipped
   2026-04-26 (`services/edge-runtime/`); next move is wrangler-shim
   deploy command + first customer bundle running. Per-session
   estimate: 2.
9. **WAF + rate-limit dashboard** in admin. We have the primitives
   already; surface them.
10. **Privacy-first first-party analytics.** No more vendor analytics
    on the public site.
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
