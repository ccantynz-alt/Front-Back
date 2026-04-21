# Competitive Matrix — One Platform, AI-Native, Parity Or Better

> **INTERNAL STRATEGY DOCUMENT.** This file names competitors because
> `docs/POSITIONING.md` §2 explicitly permits that inside internal strategy
> docs. **Nothing in this file may be copy-pasted into public marketing
> copy.** Public-facing framing stays polite — "one product instead of
> many," "replaces many services" — per the locked tone rule.

> **Status:** Draft v1 — 2026-04-21. Authored during the homepage-fix
> session after Craig directed: "we need to make sure that we can offer
> the same services from all these platforms but better — we don't want
> to produce crap we want to produce quality."

---

## The Quality Bar (non-negotiable)

1. **Parity or better, never worse.** If a legacy platform has feature
   `X`, Crontech's `X` must cover the same job at equal or superior
   fidelity. Half-built is worse than nothing — users will compare us to
   the incumbent and the incumbent will win on maturity.
2. **AI-native is the differentiator, not the excuse.** "We're AI-first"
   does not substitute for the basic features that must exist. The AI
   layer is the moat *on top of* complete, polished, production-grade
   parity. No shipping an AI bell on a broken whistle.
3. **No pay-to-be-alpha.** Billing is deferred until the whole platform
   is GA-ready. We do not take money for an unfinished product (Craig's
   directive, 2026-04-21).
4. **Self-sovereign or we do not ship it.** Every layer must be ours,
   on our metal, with no third-party dependency we cannot replace in one
   week. Every external API is a disaster waiting to happen.
5. **AI architecture, AI design, AI components.** The legacy incumbents
   shipped on 2010-era stacks and 2015-era design systems. Our advantage
   is that we are rebuilding every category from scratch in 2026, with
   AI at every layer, agentic workflows, and generative UI.

---

## The Matrix

Each row lists the legacy product, the job-to-be-done it owns, the
Crontech answer, the AI-native twist that makes ours superior, and the
current build status inside this repo.

### 1. Cloudflare — CDN + DNS + Workers

| Dimension | Detail |
|---|---|
| Old-way job | Global anycast CDN, authoritative DNS, serverless edge compute, WAF. |
| Crontech answer | `apps/web` deploys to our own Vultr metal. `services/dns-server` ships authoritative DNS (see `/dns`). `services/edge-workers` runs edge-style compute on our own runners. |
| AI-native twist | AI-routed compute mesh: workloads flow between client GPU → edge → cloud automatically based on device capability and latency. Agents learn traffic patterns and prefetch predictively. No other CDN does this. |
| Shipped | Self-hosted edge ✅ · Authoritative DNS ✅ · Edge workers ✅ · AI routing 🟡 (BLK-016) · Predictive prefetch ❌ (in AI-native roadmap) |
| Quality bar gaps | WAF rules, DDoS mitigation depth, TLS cert automation at Cloudflare's maturity. Anycast footprint is 1 region today (Path A launch), multi-region is follow-up. |

---

### 2. Vercel — Deploy platform for modern frameworks

| Dimension | Detail |
|---|---|
| Old-way job | Push-to-deploy for Next.js / Nuxt / etc., preview branches, instant rollback, edge functions. |
| Crontech answer | `scripts/install-auto-deploy.sh` + webhook-driven pipeline. `apps/web` on SolidStart with hot-reload dev, push-to-build on `main`. Vinxi + Nitro build pipeline. |
| AI-native twist | `/builder` route (BLK-017) — describe what you want, AI composes the app, writes the code, and deploys it. The platform does not just *deploy* apps, it *writes* them. Generative UI from a Zod-typed component catalog. |
| Shipped | Push-to-deploy ✅ · Preview branches 🟡 (manual) · Instant rollback ❌ · AI builder MVP 🟡 (BLK-017 spec locked, build in progress) |
| Quality bar gaps | Preview deployment URLs per PR, one-click rollback UI, build-log streaming. Polishing needed before public launch. |

---

### 3. Render / Fly.io / Heroku — Container app hosting

| Dimension | Detail |
|---|---|
| Old-way job | Run a long-lived process in a container, auto-restart, autoscale, log aggregation. |
| Crontech answer | `services/runner` Docker-sandbox runners orchestrated by `services/orchestrator` on our systemd stack. BLK-009 build-runner shipped. |
| AI-native twist | AI orchestrator schedules workloads based on load prediction and cost. Three-tier compute routing means jobs find the cheapest tier automatically. |
| Shipped | Docker runners ✅ · systemd orchestration ✅ · Log aggregation ✅ (Grafana LGTM, BLK-014) · Autoscale 🟡 · AI scheduler ❌ (BLK-016) |
| Quality bar gaps | Autoscale policies, zero-downtime deploys, per-app custom domains UI. |

---

### 4. Twilio — SMS + voice + verify APIs

| Dimension | Detail |
|---|---|
| Old-way job | Programmatic SMS sending/receiving, voice calls, 2FA verify, short codes, MMS. |
| Crontech answer | `/sms` product page exists, route registered. Outbox architecture planned alongside email. eSIM integration (`/esim`) already shipped for mobile connectivity. |
| AI-native twist | AI drafts message copy per recipient, routes across carriers to optimize deliverability, detects conversational intent, and hands off to an agent when a reply needs a response. Not just "send SMS" — "send the *right* SMS, handled intelligently." |
| Shipped | `/sms` marketing page ✅ · eSIM ✅ · Actual send pipeline ❌ · Carrier routing ❌ · AI drafting ❌ |
| Quality bar gaps | The whole backend. Page exists; product does not. Craig priority: ship real parity before public launch. |

---

### 5. Mailgun / SendGrid / Resend — Transactional email

| Dimension | Detail |
|---|---|
| Old-way job | Transactional email API, template engine, bounce/complaint handling, deliverability. |
| Crontech answer | Unified outbox pattern — same pipeline as SMS, same logs, same observability. SMTP/SES-style send with our own reputation. |
| AI-native twist | AI subject-line A/B testing, deliverability-aware sending (adapts to recipient ESP), anti-spam scoring by model before send, auto-unsubscribe intent detection. Email that thinks before it sends. |
| Shipped | Architecture ✅ (planned as unified outbox) · Send pipeline ❌ · Templates ❌ · AI features ❌ |
| Quality bar gaps | Actual outbound email. Domain warm-up, DKIM/SPF automation, bounce processing, template engine. All unbuilt. |

---

### 6. Supabase / Neon / PlanetScale — Database + auth

| Dimension | Detail |
|---|---|
| Old-way job | Managed Postgres or MySQL, built-in auth, row-level security, realtime subscriptions, edge reads. |
| Crontech answer | Turso (edge SQLite replicas) + Drizzle ORM for the primary data path. Neon-compatible Postgres for heavy queries. Passkeys-first auth (WebAuthn) + OAuth + session-based. Qdrant for vector search. |
| AI-native twist | AI schema suggestions when you describe your data, AI query optimization that rewrites slow queries live, generative admin UI from the schema (BLK-012 db-inspector is the foundation). Vector search is a first-class primitive, not a separate product. |
| Shipped | Turso + Drizzle ✅ · Passkeys ✅ · OAuth ✅ · RBAC ✅ (BLK-010/013) · Realtime subs ✅ (BLK-011 CRDT) · Vector search 🟡 (Qdrant integration planned) · AI schema/query ❌ |
| Quality bar gaps | Connection pooling, point-in-time recovery, database branching (Neon-style), backups UI. Security posture already solid via passkeys. |

---

### 7. Datadog / New Relic / Sentry — Observability

| Dimension | Detail |
|---|---|
| Old-way job | Metrics, logs, distributed traces, error tracking, APM, alerting. |
| Crontech answer | Sentinel (shipped BLK-015) for competitive + stack intel. Grafana LGTM stack (shipped BLK-014) for logs/metrics/traces/errors. OpenTelemetry instrumentation across apps. |
| AI-native twist | AI analyzes the intel itself — you read *intelligence briefs*, not dashboards. "Your error rate spiked at 14:03 because a dependency upgrade bumped the bcrypt timeout; here's the fix" — not "here's a graph, go diagnose." Multi-agent triage (Tech Scout, Threat Analyst, Opportunity Finder) already running. |
| Shipped | Sentinel ✅ · LGTM stack ✅ · OTel instrumentation ✅ · AI briefs 🟡 (Sentinel writes daily briefs, expand to runtime errors) |
| Quality bar gaps | Real-user monitoring (RUM), session replay, mobile APM. All unbuilt. |

---

### 8. Stripe / Paddle / Lemon Squeezy — Billing **[DEFERRED]**

| Dimension | Detail |
|---|---|
| Old-way job | Subscriptions, metered usage, invoicing, tax, dunning, checkout, fraud. |
| Crontech answer | BLK-010 plumbing shipped (schema, webhooks, usage metering) — **gated off the public signup flow.** |
| AI-native twist | (Planned) AI revenue forecasting, fraud scoring on signup, churn prediction, dynamic pricing suggestions. |
| Shipped | Webhook handler ✅ · Schema ✅ · Metered usage hooks ✅ · **Live billing flow: INTENTIONALLY DISABLED** |
| Status | **DEFERRED until platform is GA-ready.** Craig directive 2026-04-21: "I will do [billing] at the end just to make sure that we don't get anybody signing up to an unfinished product." No one should pay for a half-built platform. Re-enable in the coordinated 1.0 launch. |

---

## Summary — What's Shipped, What's Missing, What's The Risk

### ✅ Categories where Crontech is already at parity or better

- DNS (authoritative, self-hosted)
- Edge hosting + deploy pipeline (self-hosted on Vultr)
- Database + auth (Turso + passkeys + RBAC + CRDT realtime)
- Observability (Sentinel + LGTM + OTel + AI briefs)

### 🟡 Categories where we're partially built — public marketing must wait

- AI builder / deploy platform (Vercel-class) — BLK-017 in flight
- AI compute routing (Cloudflare Workers-class) — BLK-016 spec locked
- Vector/semantic layer (Pinecone/Supabase-class) — Qdrant pending wire-up

### ❌ Categories where we have a page but no product — HIGHEST RISK

- **SMS** — `/sms` marketing page renders, zero backend
- **Email** — architecture sketched, nothing sending
- **Preview deployments** — manual only, no per-PR URL pipeline
- **Autoscale** — orchestrator can schedule but does not auto-expand

### 🔒 Categories intentionally gated

- **Billing** — built, disabled, waiting for GA

---

## How This Document Should Be Used

1. **Before shipping any marketing claim** on the homepage, pricing
   page, or any public surface, check this matrix. If a row says ❌ the
   claim must not go live.
2. **Before starting a new feature**, check the row for that category.
   Are we closing a ❌ gap? Upgrading a 🟡 to ✅? If the feature does not
   move a row up, it's scatter-gun work — stop and pick a different one.
3. **Every BUILD_BIBLE block** should reference one or more rows in
   this matrix by number (BLK-017 → row 2 Vercel, row 6 Supabase).
4. **Quarterly review.** Refresh the "Shipped" column. Update the gap
   list. Retire rows that have been fully closed. Add new rows when a
   new competitor category emerges (Sentinel will flag those).

---

## Non-goals

- **Not a public comparison page.** Public copy names no competitors
  (POSITIONING.md §2).
- **Not a feature wish-list.** Every row must map to a real category
  users already pay someone for — if there is no incumbent, it is not
  on this matrix.
- **Not a marketing script.** This is for strategic prioritization, not
  sales decks. Sales decks use the "one product instead of many" frame
  from POSITIONING.md.
