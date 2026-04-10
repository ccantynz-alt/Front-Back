# Week 2 — emailed.io (First Real SaaS)

> **Priority:** P0
> **Target:** `emailed.io`
> **Why this one:** First real SaaS workload. Has auth, billing, a database, and real users. If Crontech can host emailed, it can host anything.

## Pre-flight

- [ ] Week 1 (MarcoReid) complete and stable for ≥72h
- [ ] Stripe live mode working end-to-end on Crontech (test purchase → webhook → DB update)
- [ ] Turso primary + embedded replica wired to the Hetzner box
- [ ] Auth module (`packages/auth`) feature-complete for email/password + passkeys
- [ ] Backup plan documented (current emailed users should NOT lose data)

## Day 1 — Inventory

`docs/migrations/inventories/emailed.md`:

- [ ] Current DB schema dump
- [ ] User count + data volume
- [ ] Billing state (active subscriptions, plan tiers, Stripe IDs)
- [ ] Integrations (outbound email provider, analytics, support tool)
- [ ] Custom domains used by customers (if any — white-label risk)
- [ ] API consumers (if any)
- [ ] Cron jobs / scheduled tasks
- [ ] Webhooks inbound and outbound

**Critical gotcha:** active paying subscriptions. Map every Stripe subscription ID, customer ID, and price ID. Migration must not lose a single active sub.

## Day 2 — Scaffold

- [ ] Branch `migration/week-2-emailed`
- [ ] `apps/emailed/` workspace OR route subtree under `apps/web/src/routes/emailed/` (same decision as Week 1)
- [ ] Drizzle schema for emailed tables, mirrored from source DB
- [ ] Turso database provisioned for emailed (`crontech-emailed-prod`)
- [ ] Env vars on box:
  - `EMAILED_TURSO_URL`
  - `EMAILED_TURSO_AUTH_TOKEN`
  - `EMAILED_STRIPE_SECRET_KEY`
  - `EMAILED_STRIPE_WEBHOOK_SECRET`
  - `EMAILED_SMTP_HOST`
  - `EMAILED_SMTP_USER`
  - `EMAILED_SMTP_PASS`
- [ ] `apps/web/public/progress.json` — flip `week-2-emailed` to `in_progress`

## Day 3 — Data migration

The part that actually matters:

- [ ] Freeze writes on the old DB (put old app into read-only maintenance mode briefly — 30 min max)
- [ ] Dump old DB (pg_dump or equivalent)
- [ ] Load dump into new Turso database
- [ ] Verify row counts match exactly
- [ ] Run data integrity checks (sample queries against both, diff results)
- [ ] Re-enable writes on old DB (old stack still serves traffic until cutover)
- [ ] Set up logical replication or delta-sync for changes made during migration window

**Rollback checkpoint:** if data migration fails verification, stop here. Do not proceed.

## Day 4 — Port pages & API

- [ ] Auth flows (login, signup, forgot password, verify email)
- [ ] Dashboard / main app shell
- [ ] Billing pages (manage subscription, invoices)
- [ ] Settings / profile
- [ ] Any admin tools
- [ ] API endpoints (if emailed has a public API)
- [ ] Webhooks (inbound from Stripe, outbound to customers)
- [ ] Transactional email templates (port to the new email module)

Each feature checkpoint:

- Build green
- Link checker green
- Button checker green
- Integration test green (auth, billing, email send)

## Day 5 — Parallel run + staging

- [ ] Deploy to `emailed-new.crontech.nz`
- [ ] Set up a handful of test accounts
- [ ] Run through every user journey end-to-end
- [ ] Stripe test mode webhook → DB update → email sent → verify
- [ ] Load test: 100 concurrent users, 30 minutes, assert p99 < 500ms
- [ ] Confirm OTel traces land in Grafana for every request

## Day 6 — DNS cutover

24h before:
- [ ] Lower TTL on `emailed.io` to 300s
- [ ] Put old app into read-only mode 10 minutes before cutover
- [ ] Run final delta sync from old DB to new
- [ ] Verify row counts match

Cutover window:
- [ ] Point `emailed.io` at Crontech
- [ ] Monitor traffic arrival in Grafana
- [ ] Smoke-test login, signup, billing, main dashboard
- [ ] Watch for any 5xx spikes
- [ ] Monitor Stripe webhook delivery

## Day 7 — Decommission

- [ ] Confirm old stack has 0 traffic for 24h
- [ ] Export a final backup of the old DB (archive to R2)
- [ ] Archive the old emailed repo
- [ ] Cancel the old hosting
- [ ] Cancel old DB host (after 7-day paranoia buffer)
- [ ] Flip `week-2-emailed` in progress.json to completed
- [ ] War room post: "Week 2 migration complete. emailed.io on Crontech. 2/7 done."

## Exit criteria

- [ ] `https://emailed.io` serves from Crontech
- [ ] Every existing user can log in
- [ ] Every active Stripe subscription still charges correctly
- [ ] Every user sees their correct data
- [ ] Transactional emails sending
- [ ] OTel traces flowing
- [ ] Zero user-reported regressions after 72h
- [ ] 0 dead links, 0 dead buttons
- [ ] Lighthouse ≥ 90
- [ ] `/admin/progress` shows week-2 completed

## Rollback plan

Rollback triggers:

- Auth broken for any user
- Stripe webhook delivery fails
- Data missing for any user
- 5xx error rate > 0.1%
- Login success rate drops below 99%

Rollback procedure:

1. DNS flip back to old host (5 min)
2. Old host reads from last-known-good DB snapshot
3. Crontech-side writes made since cutover get replayed after fix
4. Post-mortem published within 24h

## Risks unique to emailed

- **Active paying customers.** Every downtime minute is revenue + trust lost.
- **Transactional email deliverability.** SPF/DKIM/DMARC records for `emailed.io` must be ported to the new sending infrastructure.
- **Webhook URL changes.** If customers depend on outbound webhooks, they may need URL updates.
- **Session tokens.** Decision: invalidate all sessions on cutover (force re-login) or migrate sessions? Recommended: force re-login with a clear message. Cleaner, fewer edge cases.
