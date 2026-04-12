# Week 7 — Zoobicon (AI Website Builder — The Flagship)

> **Priority:** P0
> **Target:** Zoobicon AI website builder
> **Why this one:** Zoobicon is Crontech's flagship consumer-facing vertical. It competes directly with StackBlitz Bolt (which we track in Sentinel). Migrating it LAST makes sense: by Week 7, every piece of Crontech's substrate has been proven. Zoobicon gets the most mature platform.

## Pre-flight

- [ ] Weeks 1-6 all complete and stable for ≥72h each
- [ ] Three-tier inference pipeline proven (Week 6)
- [ ] Audit log substrate proven (Week 3, 4)
- [ ] QA/security substrate proven (Week 5)
- [ ] Real-time collaboration (Yjs + Liveblocks or equivalent) integrated into Crontech core
- [ ] Generative UI pipeline (json-render + Zod schemas) operational

## Day 1 — Inventory

- [ ] Current Zoobicon stack (framework, hosting, DB, AI providers)
- [ ] User count and active site count
- [ ] Site storage model (how are user-generated sites stored?)
- [ ] AI prompt catalog (what does the builder actually ask the LLM?)
- [ ] Template catalog
- [ ] Hosting model for generated sites (subdomain? custom domain? which CDN?)
- [ ] Billing model (free tier, paid tiers, overage)
- [ ] Integrations (Stripe, analytics, custom domains)

## Day 2 — Scaffold

- [ ] Branch `migration/week-7-zoobicon`
- [ ] `apps/zoobicon/` workspace
- [ ] Neon DB for user + site metadata
- [ ] R2 bucket for generated site assets
- [ ] Turso embedded replicas for low-latency site reads at edge
- [ ] Generative UI pipeline wired up
- [ ] Real-time collaboration wired up (multi-user + AI agent editing)

## Day 3 — AI builder core

The heart of Zoobicon. Rebuild it on Crontech's three-tier AI:

- [ ] Prompt template catalog with Zod schemas
- [ ] Generative UI: AI outputs component trees, not HTML
- [ ] Component catalog (from `packages/ui`) exposed to the AI via MCP
- [ ] Every generated site is a valid SolidStart app (no raw HTML ever generated)
- [ ] Preview pipeline: AI generates → preview renders in iframe → user approves
- [ ] Iterative refinement: user says "make it blue" → AI generates a diff, not a full regen

## Day 4 — Site hosting

Generated sites need to be served:

- [ ] Subdomain-per-site routing (`<site-slug>.zoobicon.app`)
- [ ] Optional custom domain support (CNAME + automatic HTTPS via Caddy)
- [ ] Static site generation from the component tree
- [ ] Edge caching via Cloudflare
- [ ] Per-site analytics
- [ ] Per-site OTel instrumentation (optional — user-owned sites shouldn't leak to our telemetry by default)

## Day 5 — Collaboration + AI agents

Multi-user + AI-agent editing is the competitive moat:

- [ ] Yjs-based collaborative document model for each site
- [ ] User cursors visible to other editors
- [ ] AI agent as a first-class collaborator (has a cursor, makes edits, leaves comments)
- [ ] CRDT-safe conflict resolution
- [ ] Undo/redo works across users and AI edits
- [ ] Change history with attribution (user or agent)

## Day 6 — Data migration

- [ ] Export every existing site's component tree (or convert from whatever the old format was)
- [ ] Bulk-import into Neon + R2
- [ ] Verify: load 20 random user sites, confirm they render identically to the old system
- [ ] Migrate user accounts (with forced re-login on first access)
- [ ] Preserve custom domain mappings

## Day 7 — Cutover + victory lap

- [ ] Deploy to `zoobicon-new.zoobicon.app`
- [ ] Parallel run for 48h: every new site creation goes to both old and new
- [ ] Flip DNS during lowest-traffic window
- [ ] Intensive monitoring for 72h
- [ ] Flip `week-7-zoobicon` in progress.json to completed
- [ ] Flip the overall "dogfood migration" macro-entry to completed
- [ ] **War room post: "DOGFOOD MIGRATION COMPLETE. 7/7. The empire runs on Crontech."**
- [ ] Homepage update: add the proof banner
- [ ] Public blog post: "How we migrated 7 businesses to Crontech in 7 weeks"

## Exit criteria

- [ ] Zoobicon serving from Crontech
- [ ] Every existing user site renders correctly
- [ ] AI builder generating valid component trees (never raw HTML)
- [ ] Real-time collaboration working with 2+ users
- [ ] AI agent participating in collaborative sessions
- [ ] Generated site preview + publish working end-to-end
- [ ] Custom domain support working (end-to-end test with a real domain)
- [ ] `/admin/progress` shows 7/7 completed

## Rollback plan

Rollback triggers:

- Any existing user site fails to render
- AI builder producing invalid output
- Collaboration conflicts causing data loss
- Generated site publish failing

Rollback procedure:

1. DNS flip to old Zoobicon
2. Any new sites created on Crontech side get exported and re-imported
3. Post-mortem before retry

## Risks unique to Zoobicon

- **User-generated content at scale.** Unlike the other weeks, Zoobicon stores output from users (lots of it). Storage growth is unbounded.
- **Direct competitive threat.** Bolt.new (`stackblitz/bolt.new` — tracked in Sentinel) is shipping fast. This migration needs to end with Zoobicon ahead, not just equal.
- **LLM cost.** AI builder burns through tokens. The three-tier model (prefer client-side for small diffs) is cost-critical here.
- **Custom domain CNAME chaos.** Users who have their sites on custom domains will be cranky if HTTPS breaks for even a minute.
- **Trust with existing users.** Zoobicon users have spent time building their sites. ANY data loss destroys trust permanently.

## The victory condition

By the end of Week 7:

- Every Craig-owned business runs on Crontech
- The platform has been battle-tested by 7 different workload profiles (static, SaaS, accounting, legal, security, voice/AI, user-generated)
- The audit log, three-tier AI, WORM storage, and real-time collab substrates have all been proven in production
- We have 7 case studies and zero remaining dependencies on Vercel/Netlify/Supabase/etc
- Crontech is ready to sell to external customers with undeniable dogfood proof

**This is the moment Crontech stops being an experiment and starts being a product.**

## What comes after Week 7

Week 8+ is the anchor customer hunt. Tier 1 advantage lever #2 (from `docs/ADVANTAGE_LEVERS.md`). The migration was always just the foundation — the actual business starts after dogfood is complete.

See `docs/ANCHOR_CUSTOMER_HUNT.md` (to be written — this is the next major doctrine doc after the migration plan locks).
