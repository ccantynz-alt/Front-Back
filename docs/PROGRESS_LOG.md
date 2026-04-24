# Crontech Progress Log

**Purpose:** daily record of what shipped, what's blocked, what's next. Generated from git + session notes. Paste the day's entry into an actual email to yourself, to the team, or to investors.

**How to use:** at the end of each working session, ask Claude "generate today's progress log entry" and paste the output under today's date. Or just read the commit log and fill it in manually.

---

## Template

```
## YYYY-MM-DD

### Shipped today (in chronological commit order)
- `<sha>` <short commit message>
- ...

### Gated on Craig (action required outside the code)
- [ ] <specific action>
- ...

### In flight (agents or MCP work in progress)
- <what's running or queued>

### Blockers that surfaced today
- <anything found that stops progress>

### Tomorrow's single most important thing
- <one line — what is the single most important thing to ship tomorrow>

### Phase 1 finish-time estimate
- On track / slipping by X days / ahead by X days
```

---

## 2026-04-22 — AlecRae integration + launch-readiness push

### Shipped today (in chronological commit order — Crontech only; Gluecron and Gatetest received matching cross-product widget + cross-sell card commits on the same branch)
- `b2f90d3` feat(api): admin fan-out route at /api/admin/platform-siblings
- `38672dc` feat(admin): PlatformSiblingsWidget — cross-product health cards
- `8b1512d` feat(dashboard): PlatformCrossSellCard — gentle sibling intro
- `1314c01` test(components): static-source assertions for new platform components
- `440ba81` feat(admin): mount PlatformSiblingsWidget on admin dashboard
- `0a23f35` feat(dashboard): mount PlatformCrossSellCard on empty-state branch
- `e8a82bb` docs(env): document CRONTECH_STATUS_URL, GLUECRON_STATUS_URL, GATETEST_STATUS_URL
- `a516c3c` revert: remove Playwright — use GateTest (our own product) for visual QA
- `0eac49b` fix(landing): iPad-landscape stats grid, tech strip, hero rhythm (via GateTest dogfood)
- `6591f82` docs: ship real Getting Started quickstart (5 articles)
- `efc49f4` feat(auth): add email verification pipeline to close Stripe prod gate (migration 0025, 9 tests green)
- `e4cbf4c` feat(billing): drive Stripe price IDs from env vars, gate missing-price checkout
- `e61d3a2` docs(env): add Stripe price-ID vars with launch instructions
- `b242c77` docs(env): label AlecRae as primary email provider, Resend as fallback
- `76c1791` docs: add LAUNCH_CHECKLIST.md for Stripe + AlecRae go-live
- `5e46035` feat(pricing): route per-plan CTAs at /checkout/:plan instead of waitlist
- `17962142` feat(checkout): /checkout/:plan auth-gated Stripe handoff
- `d96054b` feat(projects/new): paste-a-URL non-dev entry tile
- `3b23346` feat(projects): wire projects.deploy to orchestrator, real status lifecycle
- `a586292` feat(projects): surface real deploy status + URL on ProjectCard
- `07eef5b` feat(marketing): /wordpress landing page for the 40%-of-the-internet audience
- `ba36138` feat(landing): clean revert + SOC 2 softened
- `0653570` docs: add STRATEGY.md permanent memory doc
- `167b182` feat(marketing): /solutions page with 10 vertical tiles
- `4f46f2a` feat(projects): URL-acceleration backend (migration 0026, stack detection)
- `751c6f0` feat(projects): URL-acceleration WordPress/WooCommerce detection
- `31335df` feat(landing): every-business positioning per STRATEGY.md
- `ecb87be` feat(email): align client with AlecRae onboarding contract (ALECRAE_BASE_URL, /send endpoint, message_id, `to` as string)
- `3fcb60e` feat(email): add /api/alecrae/webhook inbound receiver (HMAC-SHA256)
- `46498ac` docs(env): rename AlecRae env vars to match onboarding checklist
- `897745c` docs: update launch checklist to match AlecRae onboarding note
- `8cd1649` feat(api): mount /api/alecrae/webhook receiver on boot
- `<today>` docs: BUILD_PLAN.md locked 3-phase scope
- `<today>` docs: PROGRESS_LOG.md seed entry

### Gated on Craig (action required outside the code)
- [ ] Provision AlecRae tenant this afternoon — 10 templates, DNS, seed scripts
- [ ] Create Stripe live prices for Pro + Enterprise, paste IDs into Vercel
- [ ] Create Stripe webhook endpoint, paste `STRIPE_WEBHOOK_SECRET` into Vercel
- [ ] Flip `STRIPE_ENABLED=true` in Vercel prod
- [ ] Decide orchestrator hosting: Hetzner VM vs deferred deploys vs punt
- [ ] Book appointment with attorney — hand over legal stubs
- [ ] Book appointment with accountant — hand over books
- [ ] Incorporate if not already done

### In flight (agents or MCP work in progress)
- Nothing — all agents wound down. Everything landed via MCP after agent timeout issues.

### Blockers that surfaced today
- **Anthropic Claude Code stream idle timeouts** — affecting multiple long-running agent runs. Partial responses received mid-report. Workaround: split work into smaller agents + use direct MCP edits for critical path. File upstream at `https://github.com/anthropics/claude-code/issues`.
- **Env var rename collision between AlecRae and Crontech** — AlecRae's onboarding checklist uses `ALECRAE_BASE_URL` / `ALECRAE_FROM_ADDRESS`, Crontech's code was on `ALECRAE_API_URL` / `EMAIL_FROM`. Caught before Craig provisioned AlecRae — would have silently failed at go-live. Fixed with deprecation fallbacks so legacy envs still work.
- **AlecRae endpoint path mismatch** — Crontech was posting to `${baseUrl}/api/email/send`, AlecRae actually serves `${baseUrl}/send` with `/v1` already in the base URL. Fixed.
- **Crontech had no `/api/alecrae/webhook` route** — AlecRae would have 404'd every delivered/bounced event. Fixed.

### Tomorrow's single most important thing
- **Complete Phase 1 provisioning (Craig): AlecRae + Stripe live in Vercel, run a real end-to-end test payment.**

### Phase 1 finish-time estimate
- On track for 7 days. Code work is largely done — the remaining gate is Craig's provisioning/legal sprint, which is his pace not mine.

---
