# Crontech Build Plan — LOCKED

**Purpose:** kill scope creep. Anything not on this plan does not get built. Additions require a new phase, not a mid-phase insertion.

**Locked:** 2026-04-22. Amended: 2026-04-22 late evening (Phase 3 parallel-safe work opened).

---

## Phase 1 — Fortress Foundation (ship within 7 days)

**Outcome:** Craig can show an attorney, show an accountant, and take a real payment from a real customer.

### Code (Claude-assisted, done this session)
- [x] Signup + email verification (efc49f4)
- [x] Stripe price IDs + missing-price gate (e4cbf4c, e61d3a2)
- [x] Pricing per-plan CTAs + /checkout route (5e46035, 17962142)
- [x] Deploy pipeline — "Live" means live (3b23346, a586292)
- [x] Non-dev paste-a-URL tile (d96054b)
- [x] AlecRae client + webhook receiver + mount (ecb87be, 3fcb60e, 46498ac, 897745c, 8cd1649)
- [x] Landing page every-business positioning + stealth tone (31335df, 977338d)
- [x] /solutions verticals page (167b182)
- [x] /wordpress marketing page (07eef5b)
- [x] 5 real Getting Started docs articles (6591f82)
- [x] Legal stubs populated v1.0 — Privacy, ToS, Cookie scrubbed of crawl-visible "temporary" flags (34f055f, 08ccc99, and the Cookie Policy clean-up)

### Code (remaining, small — tonight if time)
- [ ] Web routes to render `/privacy`, `/terms`, `/cookies` from the MD files so they are actually reachable from the site footer
- [ ] Footer legal-links component on the landing (Privacy / Terms / Cookies / Contact + copyright)

### Gated on Craig (no code can unblock these)
- [ ] **Provision AlecRae** — tenant, 10 templates, `mail.crontech.ai` DNS. 40-60 min.
- [ ] **Provision Stripe** — create live Pro + Enterprise prices, create webhook endpoint, flip `STRIPE_ENABLED=true` in Vercel. 20-30 min.
- [ ] **First-invoice test** — one paying customer (friend/family/throwaway card) through the full funnel.
- [ ] **Orchestrator decision**: stand up on a $10/mo VM, OR launch with deploy-queue communicated upfront, OR punt deploys entirely for week one.

**Exit criteria for Phase 1:**
1. A real payment has cleared.
2. Legal docs v1.0 published and linked from the footer.
3. AlecRae + Stripe + orchestrator-or-decision are all green.
4. Crontech.ai is publicly reachable with clean docs.

---

## Phase 2 — Fortress Walls (weeks 2-4, quietly)

**Outcome:** legal and compliance moat exists. You can defend the company if a competitor notices.

### Legal + compliance (funded by Phase 1 revenue)
- [ ] Engage attorney with the v1.0 legal docs as a review brief (targets $1-2k for limited-scope review rather than $3-5k for full drafting)
- [ ] Incorporation (if not already done)
- [ ] Bank account + clean books to accountant monthly
- [ ] Trademark filings progressed to "published for opposition" stage
- [ ] SOC 2 Type II audit engaged — Drata or Vanta, stealth onboarding
- [ ] GDPR + CCPA + NZ Privacy Act 2020 compliance documentation trail
- [ ] Cookie consent banner live on the site (implement once legal routes ship)
- [ ] IP assignment agreements (contractors, agents, Craig → the company post-incorporation)

### Customer acquisition (stealth)
- [ ] First 10-25 paying customers by invitation only
- [ ] Every paying customer signs the clean v1.0 Agreement (which will be attorney-finalised during Phase 2)

**Exit criteria for Phase 2:**
1. 10+ paying customers, billed successfully through Stripe for 2+ months.
2. Attorney-finalised legal v2 live (replaces v1.0).
3. SOC 2 Type II readiness gap assessment complete.
4. Bank account + accountant + books in order.

---

## Phase 3 — Split into two streams (Craig's amendment, 2026-04-22 evening)

Craig's revised position: we cannot afford to wait for Phase 2 to complete before starting Phase 3. Revenue urgency requires parallel execution. The split is now:

### Phase 3-A — Parallel-safe product work (can start NOW, alongside Phase 1 and 2)

These are product features that build the moat without alerting competitors. Shipping them quietly is how you become unavoidable before anyone notices.

- [ ] **AI Builder inline demo on the landing page** — visitor types "build a pizzeria website" and watches Claude start generating right there. v0.dev-shaped. Competitors see a quiet "AI Builder" card, not a "we're beating v0.dev" headline.
- [ ] **Self-healing deploys** — Claude reads the deploy failure, proposes a fix, ships a PR back to the user's repo. Gatetest already does this for code; extending to deploys is a product feature, not a competitive jab.
- [ ] **Prod observability in English** — "Why is checkout slow on Safari iPad?" → Claude reads traces + logs + recent commits → answers in plain English with a PR. Ship as a product feature; don't call it "replaces Datadog + Sentry" until Phase 3-B.
- [ ] **Weekly business insights email** — Monday-morning email per project: "Conversion dropped 8% this week. Claude suspects the checkout button colour on Android. Here's a PR." Ship quietly as a feature.
- [ ] **Partner program for agencies** — private B2B conversations, no public marketing. White-label Crontech for WordPress/SMB agencies. All conversations one-to-one, no announcements.
- [ ] **SEO groundwork** — blog posts optimised for "how to launch a SaaS", "AI-native hosting", "SMB site performance". Nothing positioned AGAINST a named competitor yet — neutral-voice educational content only.

### Phase 3-B — Loud work (still waits for fortress)

Runs AFTER Phase 2 exit criteria are met. These moves wake competitors up.

- [ ] Public Product Hunt launch
- [ ] Hacker News "Show HN" post
- [ ] Twitter / X launch thread with the "replaces Cloudflare + Vercel + Mailgun + Twilio" framing
- [ ] Press outreach — TechCrunch, The Information, Bloomberg, Stratechery
- [ ] `/vs-vercel`, `/vs-cloudflare`, `/vs-supabase`, `/vs-github` comparison pages
- [ ] Paid acquisition scaling (currently only quiet SMB-keyword spend in Phase 3-A)
- [ ] WordPress.org plugin directory listing (public, loud, competitive)
- [ ] Marketplace of third-party AI agents

**Exit criteria for Phase 3-B:**
1. 1,000+ paying customers.
2. First major press mention without getting squashed.
3. ARR reaches a level where an acquisition offer from a hyperscaler can be declined from strength.

---

## The unbendable rule

**No feature or doc can be added to Phase 1 without removing an equivalent one.** Phase 1 is locked. If something feels urgent, write it down in a "Phase 1.5 parking lot" at the bottom of this doc and move on.

### Phase 1.5 parking lot (not in scope, don't build)
- Revenue-share pricing tier (3% until first $1,000)
- AlecRae as fourth card in PlatformSiblingsWidget
- Cross-cloud arbitrage
- Voice deploy ("hey Crontech, ship my latest commit")

---

## Amendment log

- **2026-04-22 initial lock** by Craig. Scope frozen at Phase 1 list above.
- **2026-04-22 late evening** — Craig's amendment: Phase 3 split into 3-A (parallel-safe product work starts now) and 3-B (loud/public work still waits for Phase 2 fortress). Stealth doctrine applies to everything crawl-visible. Internal "pre-attorney" status lives here and in PROGRESS_LOG.md only, never on the public site.
