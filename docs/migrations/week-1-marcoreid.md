# Week 1 — MarcoReid.com (Dress Rehearsal)

> **Priority:** P0
> **Target:** `marcoreid.com`
> **Why this one first:** Lowest stakes. Mostly static. Perfect dress rehearsal for the migration pipeline. If anything goes wrong here, we learn it on a property whose downtime does not cost revenue.

## Pre-flight (must be green before starting)

- [ ] Phase 0 bootstrap complete (`infra/README.md` exit criteria all ✅)
- [ ] `crontech.nz` resolving and serving over HTTPS
- [ ] `/admin/progress` reachable and green
- [ ] LGTM stack healthy (`docker compose ps` in `/srv/crontech/observability/lgtm`)
- [ ] Stripe in live mode (not required for MarcoReid itself but confirms the pipeline)
- [ ] Access to MarcoReid's current hosting (Vercel/Netlify/wherever), DNS zone, any env vars

## Day 1 — Inventory

Produce `docs/migrations/inventories/marcoreid.md` with:

- [ ] Full sitemap (every route)
- [ ] Asset inventory (images, fonts, PDFs, videos)
- [ ] Third-party integrations (analytics, forms, mailing list)
- [ ] Current tech stack (framework, hosting, CDN)
- [ ] Current traffic numbers (for capacity planning)
- [ ] Current DNS records
- [ ] Any live forms or interactive elements

**Gotcha:** check for custom 404 pages, `robots.txt`, `sitemap.xml`, `og-image.png`, `favicon.ico` variants. These are easy to forget and embarrassing when missing.

## Day 2 — Scaffold

In the Front-Back repo:

- [ ] Create branch `migration/week-1-marcoreid`
- [ ] Create `apps/marcoreid/` workspace (Bun workspace entry in root `package.json`)
- [ ] Scaffold a SolidStart app inside it (or decide: is MarcoReid static enough to just be a route under `apps/web/src/routes/marcoreid/`?)
- [ ] Port the Tailwind config
- [ ] Port the global fonts / design tokens
- [ ] Verify `bun run build` is green

**Decision point:** if MarcoReid is ≤10 pages and has no auth/DB, it ships as a route subtree under `apps/web` rather than its own app. Faster to build, faster to deploy, one fewer thing to maintain.

## Day 3-4 — Port pages

One page at a time:

- [ ] Homepage
- [ ] About / bio
- [ ] Projects / portfolio
- [ ] Contact form (if any)
- [ ] Blog index (if any)
- [ ] Blog posts (if any)
- [ ] Legal / privacy / terms

After each page:

```bash
bun run build          # must be green
bun run check-links    # must be 0 dead links
bun run check-buttons  # must be 0 dead buttons
```

**No page moves to "done" until all three are green.**

## Day 5 — Parallel deploy

- [ ] Deploy to `marcoreid-new.crontech.nz` (or a Cloudflare preview URL)
- [ ] Smoke-test every route manually
- [ ] Visual diff against the old site (Percy, or just screenshots)
- [ ] Lighthouse: score ≥ 90 on Performance, SEO, Accessibility, Best Practices
- [ ] Link checker against the live URL: 0 dead links
- [ ] Confirm OTel traces show up in Grafana

## Day 6 — DNS cutover

24h before cutover:

- [ ] Lower TTL on `marcoreid.com` A record to 300s

Cutover window (lowest-traffic time in NZ):

- [ ] Update `marcoreid.com` A / CNAME to point at Crontech (Cloudflare edge)
- [ ] Monitor Grafana for traffic arrival
- [ ] Monitor Cloudflare analytics
- [ ] Smoke-test every route on the real domain
- [ ] Restore TTL to 3600s

**Rollback:** if anything is wrong, re-point DNS at the old host. Old host stays running for 48h post-cutover.

## Day 7 — Decommission

- [ ] Confirm no traffic on the old host (check old host's analytics for 24h silence)
- [ ] Archive the old MarcoReid repo (read-only on GitHub)
- [ ] Cancel the old hosting (Vercel / Netlify / wherever)
- [ ] Update `apps/web/public/progress.json`: flip `week-1-marcoreid` entry to `completed`
- [ ] Commit the tracker update
- [ ] Post to `#sentinel-daily`: "Week 1 migration complete. MarcoReid on Crontech. 1/7 done."

## Exit criteria

- [ ] `https://marcoreid.com` serves from Crontech
- [ ] 0 dead links, 0 dead buttons, 0 console errors
- [ ] Lighthouse ≥ 90 on all four axes
- [ ] OTel traces visible in Grafana Tempo
- [ ] Old hosting cancelled or at minimum downgraded to $0 tier
- [ ] `/admin/progress` shows `week-1-marcoreid` as completed
- [ ] No regressions reported after 48h soak

## Rollback plan

If any of the following happen, roll back immediately:

- Homepage 5xx error
- DNS not resolving globally after 30 minutes
- Lighthouse score drops below 80
- Dead links detected post-cutover
- Any form fails to submit

Rollback procedure:

1. Re-point `marcoreid.com` DNS at the old host
2. Wait for DNS propagation (5 min at TTL=300s)
3. Confirm old site is serving
4. Post to war room: "Week 1 rolled back. Root cause: <X>. Retry after fix."
5. Diagnose, fix, re-attempt.

## What this dress rehearsal teaches us

By the end of Week 1, we should have:

- A proven migration pipeline we can reuse for Weeks 2-7
- Caddy + Cloudflare edge in the hot path, battle-tested
- LGTM stack receiving real production traffic
- Confidence that `phase-0.sh` produces a box that can actually serve traffic
- Any rough edges in the platform surfaced and fixed

If Week 1 takes more than 7 days, **stop and audit the blockers before starting Week 2.** Running into the same blocker twice is acceptable. Three times is a doctrine breach.
