# Crontech Deployment Runbook

> Honest answer up front: Crontech has **two separate deployment surfaces**, and
> they're at very different readiness levels.
>
> - **Surface A — Crontech site (crontech.ai):** Cloudflare-native, automated on
>   push to `main`. **Ready to deploy today.** Days of Craig-side operational
>   work, not engineering.
> - **Surface B — Customer-app orchestrator:** Handles actual customer deploys
>   (when a customer hits "deploy" in the Crontech UI, this is what runs their
>   code). Currently runs on `localhost:9000` only. **No production deployment
>   config exists yet.** Needs infrastructure design + build before real
>   customer onboarding works.
>
> You can launch the Crontech site and let people sign up, explore the UI, use
> the AI playground, use the builder — all of that works on Surface A alone.
> You cannot let customers actually deploy their apps until Surface B ships.

---

## Surface A — Deploy crontech.ai (the site)

Target: Cloudflare Pages (web) + Cloudflare Workers (API), domain `crontech.ai`.

Workflow: `.github/workflows/deploy.yml` already exists. Pushing to `main` (or
`Main` — the repo's default is capital-M) triggers the full deploy. Zero code
changes needed to go live.

### A.1 — Cloudflare account prerequisites

- [ ] Cloudflare account with Pages + Workers enabled
- [ ] Grab **Account ID** from right sidebar of any Cloudflare dashboard page
- [ ] Create an **API Token** at dash.cloudflare.com/profile/api-tokens with:
  - Account: Workers Scripts: Edit
  - Account: Cloudflare Pages: Edit
  - User: User Details: Read
  - Zone: Zone: Read (if using custom domain)

### A.2 — GitHub repo secrets

In GitHub → Crontech repo → Settings → Secrets → Actions, set:
- `CLOUDFLARE_API_TOKEN` — the token from A.1
- `CLOUDFLARE_ACCOUNT_ID` — your account ID

### A.3 — Provision Neon Postgres

- [ ] neon.tech → create project `crontech`
- [ ] Create a prod branch
- [ ] Copy the connection string

### A.4 — Environment variables (Cloudflare dashboard)

See `docs/ops/ENV_VARS.md` (next file) for the complete list. Minimum set to
boot the site:

| Variable | Surface | Source |
|---|---|---|
| `DATABASE_URL` | Workers | Neon (A.3) |
| `SESSION_SECRET` | Workers | `openssl rand -hex 32` |
| `STRIPE_SECRET_KEY` | Workers | Stripe dashboard (use `sk_test_` — we are pre-launch) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Pages | Stripe dashboard (use `pk_test_`) |
| `ANTHROPIC_API_KEY` | Workers | console.anthropic.com |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | Workers | Google Cloud Console → OAuth |
| `WEBAUTHN_RP_ID` | Workers | `crontech.ai` |
| `WEBAUTHN_RP_NAME` | Workers | `Crontech` |
| `WEBAUTHN_ORIGIN` | Workers | `https://crontech.ai` |
| `GLUECRON_WEBHOOK_SECRET` | Workers | `openssl rand -hex 32`, share with Gluecron |
| `ORCHESTRATOR_URL` | Workers | `http://127.0.0.1:9000` for now; update when Surface B ships |
| `STRIPE_ENABLED` | Workers | `false` (pre-launch — billing returns 503) |
| `RESEND_API_KEY` | Workers | resend.com → API keys |

### A.5 — Push to main, wait for deploy

- [ ] Merge the pre-launch PR (ccantynz-alt/Crontech#103) to `main`
- [ ] Watch `.github/workflows/deploy.yml` run in the Actions tab
- [ ] On success, you'll see both a Workers deployment and a Pages deployment

### A.6 — DNS

- [ ] Point `crontech.ai` → Cloudflare Pages (CNAME to `crontech-web.pages.dev`)
- [ ] Point `api.crontech.ai` → Workers (the deploy step binds the route)
- [ ] Wait for SSL to provision (~5 min)

### A.7 — Run database migrations

Once the API is live at `api.crontech.ai`:
- [ ] Hit the migration endpoint (see `packages/db/` for the exact command)
- [ ] OR SSH into your local clone with `DATABASE_URL` set and run `bun run db:migrate`
- [ ] Verify tables exist in Neon's table browser

### A.8 — Smoke test

- [ ] Visit `https://crontech.ai` — pre-launch banner visible
- [ ] `curl https://api.crontech.ai/health` — should return 200 (or whatever the health route returns)
- [ ] Register an account via passkey
- [ ] Log in
- [ ] Navigate the 28 routes — confirm none 404

**If all of A.1–A.8 succeed, Crontech the site is live.** People can sign up,
explore, use the AI playground (if `ANTHROPIC_API_KEY` set), use the builder.
They **cannot deploy apps yet** — that's Surface B.

---

## Surface B — Customer-app orchestrator

Current state: `services/orchestrator/` is a Hono server that:
- Listens on `localhost:9000` only (hardcoded, per its header comment)
- Accepts POST `/deploy` with `{ appName, repoUrl, branch, domain, port, runtime, envVars }`
- Spins up containers using `services/orchestrator/dockerfiles/Dockerfile.bun` or `Dockerfile.nextjs`
- Has no `fly.toml`, no `docker-compose.prod.yml`, no k8s manifests
- Is NOT internet-exposed by design (it's "internal control plane")

### What's needed to ship Surface B (new engineering work)

This is genuine build work, not just config. Options Craig needs to decide:

| Option | What it is | Pros | Cons |
|---|---|---|---|
| **B1 — Self-hosted on a Vultr / DigitalOcean / AWS VPS** | Rent a box, run the orchestrator, have it spin up Docker containers on the same box | Cheapest, simplest | Single point of failure, doesn't scale beyond one box |
| **B2 — Fly.io Machines API** | Use Fly's Machines API as the container substrate; orchestrator calls Fly instead of local Docker | Scales, Fly handles the hard parts, global edge | ~$5-50/tenant/month cost, Fly dependency |
| **B3 — Cloudflare Containers (beta)** | When available, delegates everything to Cloudflare | Cleanest architecturally, matches the Cloudflare-native doctrine | Still in beta last time checked |
| **B4 — Kubernetes on managed cluster (EKS/GKE/DOKS)** | Orchestrator uses k8s API to spin up pods per customer | Battle-tested scaling | Heavy ops burden, overkill for MVP |

**Recommendation for MVP dogfooding:** B1 (single VPS). One Ubuntu box, Docker
installed, orchestrator runs as a systemd service, DNS via Cloudflare pointing
`*.crontech.ai` wildcard to the box. Upgrade to B2 when you have paying
customers.

**Craig-side authorization needed:**
- Pick an option from B1-B4 (this is a §0.7 HARD GATE — new infrastructure)
- Authorize the spend (B1 is ~$10/month, B2 is pay-per-use)
- Then engineering work: wrangler equivalents for the chosen platform, health
  monitoring, restart-on-crash, logs plumbing

---

## Dogfooding timeline

| Goal | What's needed | Surface |
|---|---|---|
| Crontech site live, people can sign up | A.1–A.8 | Surface A only |
| Your own products hosted on crontech.ai (via manual configuration) | A.1–A.8 | Surface A only |
| Customers click "deploy" and it works | A.1–A.8 + full Surface B build | Both |

**You can be at "site live" and accepting waitlist signups within a single
operational session**, assuming Cloudflare + Neon + Stripe test keys are in
hand. That's enough to start marketing, collecting emails, and positioning
the product.

**Customer-deploy capability is weeks of engineering work** on top of that.
Don't promise it to customers until Surface B is decided and built.

---

## Pre-launch guardrails currently in place

- `STRIPE_ENABLED=false` → billing procedures return 503 with clean message
- Pre-launch banner visible on every route
- Attorney-review package drafted at `docs/legal/attorney-package.md`

Until `STRIPE_ENABLED` flips to `true` and the banner is removed, nobody can
accidentally pay money on Crontech. This is the safety net that lets you
deploy the site publicly without attorney clearance yet.

---

## Rollback

- **Surface A bad deploy:** `workflow_dispatch` pointing at a prior SHA — both
  Cloudflare Workers (versioned) and Pages (deployment history) support it
  natively. Or: `git revert` + push, CI redeploys.
- **Database migration bad:** Neon branch-per-migration — create a new branch
  before running migrations, test there first, promote branch if green.
- **Surface B bad:** depends on option chosen in B1-B4.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Workers deploy fails at wrangler step | `CLOUDFLARE_API_TOKEN` missing/expired | Regenerate in Cloudflare dashboard, update GitHub secret |
| Pages build fails | Missing `VITE_*` env var (public, must be on Pages not Workers) | Set on Pages env var config, not Workers |
| Passkey registration fails | `WEBAUTHN_RP_ID` mismatch with domain | Must be exactly `crontech.ai` (no scheme, no port) |
| Google OAuth callback 400 | Redirect URI not configured in Google Cloud | Add `https://crontech.ai/api/auth/google/callback` to the OAuth client |
| `tenant.deploy` tRPC returns error | Surface B not yet live | Expected pre-launch. `ORCHESTRATOR_URL` points nowhere real until Surface B ships. |
| `/api/hooks/gluecron/push` returns 401 | `GLUECRON_WEBHOOK_SECRET` mismatch between Crontech + Gluecron | Set both to the same value |
| Site loads but all data missing | Migrations not run | See step A.7 |

---

## What to tell your attorney

When you bring the package in, the attorney will ask "is this live?" The
truthful answer after Surface A deploy is:

> "Yes, the site is live at crontech.ai behind a pre-launch banner. Nobody
> can actually purchase — Stripe is disabled at the code level (returns 503).
> The deploy pipeline (customers deploying their apps to us) is not yet
> operational. We're using this window to let you review the legal package
> before we flip Stripe on and take our first paying customer."

That framing gives you maximum time with the attorney at minimum risk, because
nothing customer-visible can actually transact money.
