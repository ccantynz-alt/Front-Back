# Crontech Dogfood Migration Plan

> **Goal:** Move every Craig-owned property onto Crontech in 7 weeks. No property is considered production-ready until it runs on Crontech substrate. The empire dogfoods itself or it fails.

## Why

1. **Dogfood or die.** If the founder won't run his own businesses on his platform, nobody else will either.
2. **Zero-cost case studies.** Each migrated property becomes a public proof point.
3. **Forcing function for the stack.** Every rough edge in the platform is found and fixed before a paying customer ever sees it.
4. **Kills the competitor dependency.** Every property off Vercel/Netlify/Supabase is one less recurring payment to a competitor.

## The Plan

| Week | Target | Priority | Playbook |
|---|---|---|---|
| 0 | Phase 0 bootstrap (Vultr + LGTM + Stripe live) | P0 | `../infra/README.md` |
| 1 | **MarcoReid.com** (dress rehearsal, lowest stakes) | P0 | `week-1-marcoreid.md` |
| 2 | **emailed.io** (first real SaaS workload) | P0 | `week-2-emailed.md` |
| 3 | **Astra + CFO engine** (accounting vertical) | P0 | `week-3-astra.md` |
| 4 | **AI-Immigration-Compliance** (first compliance-heavy workload) | P0 | `week-4-ai-immigration.md` |
| 5 | **GateTest** (QA/security vertical) | P0 | `week-5-gatetest.md` |
| 6 | **Voice / transcription** (Whisper-backed stack) | P0 | `week-6-voice.md` |
| 7 | **Zoobicon** (AI website builder — the flagship) | P0 | `week-7-zoobicon.md` |

Week 7 = dogfood cycle complete. Every property runs on Crontech.

## Doctrine

Every migration session MUST honor:

1. **Zero broken anything.** If the migration breaks a link, button, form, or page, it gets rolled back. Period.
2. **No rewrites.** Port the current property. Do not "improve" it during the migration. Improvements are a separate sprint.
3. **DNS cutover is the last step.** The old and new must run in parallel first. Smoke-test the new, then flip DNS.
4. **Rollback plan in writing.** Every playbook has a rollback section. If anything feels wrong, roll back instantly.
5. **Update the master tracker.** When a week's migration is complete, flip its entry in `apps/web/public/progress.json` to `completed`.
6. **Commit often, push immediately.** No stockpiling commits. Each logical unit is its own commit.
7. **Competitor-free stack rule** (§0.11). The migrated property must not depend on Vercel, Netlify, or any platform-layer competitor. Cloudflare edge + Vultr core is the target shape.

## The migration shape

Every week follows the same pattern:

```
Day 1: Inventory
  - Enumerate pages, routes, APIs, data stores, env vars, integrations
  - Produce a one-page inventory doc
  - Confirm nothing is missed

Day 2: Scaffold
  - Create the Crontech-side app shell
  - Port the data schema to Drizzle + Turso/Neon
  - Set up env vars on the box (never in git)

Day 3-4: Port
  - Move pages/components one at a time
  - Each port ends with a working page
  - Build green, link checker green, button checker green after each

Day 5: Parallel run
  - Deploy to a staging subdomain (e.g. marcoreid-new.crontech.nz)
  - Smoke-test every page, every form, every link
  - Compare side-by-side with the old property

Day 6: DNS cutover
  - Lower TTL on the old DNS 24h in advance
  - Flip DNS during the lowest-traffic window
  - Keep the old stack running for 48h in case of rollback

Day 7: Decommission old stack
  - Confirm no traffic hitting the old stack
  - Archive the old repo / cancel the old hosting
  - Update progress.json to completed
  - Post a one-line migration note to the war room
```

## Who runs each migration

By default, each migration is run in its own Claude Code session rooted in the Front-Back repo. If a property has its own repo, a parallel session can handle the source-side work while the Crontech session handles the target-side work.

**Branch discipline:** migrations use a branch named `migration/week-N-<target>` off `main`. Merged via PR only after the playbook's exit criteria are all green.

## Exit criteria (global)

The 7-week plan is DONE when:

- [ ] All 7 properties live on Crontech
- [ ] Zero traffic hitting the old hosting
- [ ] Every property has 0 dead links, 0 dead buttons, 0 console errors
- [ ] Every property emits OTel traces that land in Grafana
- [ ] Every property's auth uses the shared Crontech auth module
- [ ] Every property's billing runs through the shared Stripe integration
- [ ] `/admin/progress` shows 7/7 migrations completed
- [ ] Old hosting accounts cancelled (Vercel, Netlify, wherever)
- [ ] One-page "dogfood complete" doc shipped to the homepage as proof

## See also

- `../../CLAUDE.md` — doctrine
- `../../infra/README.md` — Phase 0 runbook
- `../POSITIONING.md` — compliance-native wedge positioning
- `../../apps/web/public/progress.json` — live tracker source
