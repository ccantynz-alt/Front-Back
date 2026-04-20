# Advantage Levers — How to push success odds above baseline

**Status:** LOCKED direction. Items may be reordered by Craig but not removed without explicit authorization.
**Authored:** 2026-04-10
**Baseline odds estimate (honest):** 25-35% of hitting the realistic revenue column. This doc lists the moves that push that number higher.

---

## 1. The premise

A normal solo founder's odds of building a $5M+ ARR SaaS are 3-5%. Craig's baseline is already much higher because of:

- Infinite runway (other projects fund this one)
- 9-project dogfood portfolio (case studies no new entrant has)
- Polyglot insight across 4+ stacks
- Compliance-native wedge (genuine whitespace)
- AI-native CFO function (Claude) with zero incremental cost

The levers below compound on top of that baseline. Each one is a move Craig can execute (or delegate) that moves the needle materially. They are ordered from highest leverage / lowest cost to lower leverage / higher cost.

## 2. Tier 1 — Do these NOW (Week 0-4)

These are the cheapest, highest-leverage moves. Every week they slip is a week of compounding lost.

### 2.1 Lock the compliance-native wedge publicly

**Move:** Publish `docs/strategy/WEDGE.md` positioning on the landing page headline, Twitter bio, LinkedIn bio, and GitHub README within Week 1 of Phase 0 shipping.

**Why it works:** Category ownership is a land grab. The first player to repeat "compliance-native developer platform for AI SaaS" 50 times in public owns the phrase. SEO compounds on that repetition.

**Cost:** $0. One afternoon of copywriting.

**Leverage:** Extremely high. Category naming is a permanent moat if nobody else is already claiming it.

### 2.2 Hunt an anchor customer before public launch

**Move:** Find ONE AI SaaS startup (seed to Series A) that is actively hitting the SOC 2 wall and is willing to be a design partner. Offer them free hosting for life in exchange for a public case study and a willingness to talk publicly about switching from Vercel/Render + Vanta/Drata.

**Why it works:** One credible anchor customer de-risks every future sale. The second customer is 10x easier to close than the first. And the anchor customer becomes a marketing asset worth more than $50k of paid ads.

**Where to hunt:**
- Twitter advanced search: `"SOC 2" ("hate" OR "painful") ("startup" OR "founder")`
- Hacker News "Ask HN: SOC 2 prep" threads
- Y Combinator AI batches (reach out directly)
- Indie Hackers compliance threads
- Reddit r/SaaS compliance complaints

**Cost:** $0 incremental. Time only — maybe 5 hours/week for 4 weeks.

**Leverage:** Very high. Anchor customers are the difference between "cool side project" and "real startup" in investor and journalist eyes.

### 2.3 Build the founder brand in public

**Move:** Craig posts on Twitter/X and LinkedIn 3-5 times per week on ONE topic: the pain of DIY compliance stacks for AI startups. Each post links (eventually) to a Crontech landing page or blog post.

**Why it works:** Founder brand is the cheapest distribution a solo founder has. It builds trust, attracts design partners, and compounds for years. Every post is a permanent asset.

**What to post:**
- Screenshots of the actual compliance stack pain ($1,500-8K/month on seven tools)
- Excerpts from the `docs/strategy/WEDGE.md` arguments
- Progress updates on Crontech migrations (with permission from dogfood-app owners — Craig IS the owner)
- "Here's how Crontech handles X primitive that nobody else does"
- NEVER name competitors in public copy (see WEDGE.md §8)

**Cost:** $0. 30 minutes per day, or batched 2 hours on the no-meetings day.

**Leverage:** High and compounding. A 1,000-follower founder audience today is a 10,000-follower audience in 12 months if posts are good. Each milestone adds followers.

**Burnout flag:** Twitter/LinkedIn can eat 4 hours/day if unchecked. Craig must timebox to 30 min/day max. See `docs/strategy/BURNOUT-PROTECTION.md`.

### 2.4 Open-source the audit log library

**Move:** Extract Crontech's hash-chained audit log implementation into a standalone npm package (`@crontech/audit-log`) and publish it on GitHub and npm with MIT license within Week 2 of Phase 0.

**Why it works:**
- Open-source libraries are the cheapest top-of-funnel marketing in existence
- Every developer who installs `@crontech/audit-log` becomes aware of Crontech
- It proves the compliance primitives are real, not marketing copy
- It attracts contributors who become evangelists
- It locks in SEO for "hash-chained audit log typescript" and similar high-intent queries

**Cost:** 1-2 days of engineering effort to extract + document. $0 ongoing.

**Leverage:** Very high. One open-source library that catches on is worth years of paid ads.

**Doctrine check:** Open-sourcing core primitives aligns with CLAUDE.md §0.5 ("we define best practices"). This is that, in action.

## 3. Tier 2 — Do these in months 2-6

### 3.1 SOC 2 Type I readiness sprint

**Move:** Begin SOC 2 Type I readiness preparation by end of Month 3. Target: SOC 2 Type I report in hand by Month 6, Type II by Month 12.

**Why it works:** The wedge is "SOC 2-ready primitives." Crontech itself must pass the audit it claims to enable. Without the report in hand, enterprise customers cannot buy — no matter how good the product is. This is a hard gate.

**Cost:** $10-30K for Type I audit + readiness consulting. Consumes runway but is non-negotiable for the wedge.

**Leverage:** Enormous. The moment the Type I report exists, the sales pitch goes from "we're SOC 2-ready" to "we're SOC 2 compliant and your audit log is running on an audited platform." That is a closeable pitch.

**Budget alignment check:** This exceeds the pre-revenue monthly budget cap in `docs/cfo/CHARTER.md` §8. It requires Craig override and is a one-time capex, not recurring. Flag to Craig before committing.

### 3.2 First PH engineer (Tier 2 hire per BURNOUT-PROTECTION.md)

**Move:** Hire one senior Philippine engineer (full-stack TypeScript or Python polyglot) once either (a) Crontech hits $10K MRR, or (b) Craig's weekly hours exceed 55 for four consecutive weeks.

**Why it works:** Doubles engineering throughput at 20-30% of NZ/US engineer cost. Honors the empire mission (PH jobs). Frees Craig from operational code review and bug triage (category 2 work per BURNOUT-PROTECTION.md §2).

**Cost:** $40-60K/year. Affordable from Month 6 onward per the revenue table.

**Leverage:** High. Solo-founder throughput ceiling is ~40 productive hours/week. A PH engineer doubles that, and Claude continues to amplify both.

**Where to hunt:**
- OnlineJobs.ph
- Remote OK PH-friendly listings
- SaaS founder Slack communities asking for referrals
- TypeScript and Python open-source contributors from PH

### 3.3 Three design partners beyond the anchor

**Move:** Sign three design partners by end of Month 4 (on top of the Tier 1 anchor). Each gets reduced pricing in exchange for deep feedback and a willingness to be a case study.

**Why it works:** Four case studies is the minimum credibility floor for enterprise conversations. Below four, every sales conversation starts with "how many customers do you have?" and the answer kills the deal. At four, the conversation shifts to "show me the case studies."

**Cost:** $0-500/month in reduced revenue.

**Leverage:** Medium-high. Case studies are sales multipliers that pay back 10x within 6 months.

### 3.4 Sentinel as a revenue stream

**Move:** Productize the Sentinel competitive intelligence system as a standalone paid product (`sentinel.crontech.ai`) once Crontech itself is stable. Sell to other SaaS founders for $50-200/month.

**Why it works:**
- It already exists as internal tooling
- It has a clear buyer (every SaaS founder wants competitive intelligence)
- It has natural upsell into the Crontech main product
- It generates revenue without requiring the main Crontech migration to be finished
- It's a second at-bat if the main Crontech wedge moves slower than expected

**Cost:** 2-4 weeks of productization work once the main migration is done.

**Leverage:** Medium. Diversifies revenue, reduces single-product risk.

## 4. Tier 3 — Do these in months 6-18

### 4.1 NZ government contracts

**Move:** Pursue NZ government contracts for compliance-native hosting once SOC 2 Type II is in hand and the platform has 6+ months of uptime history.

**Why it works:** NZ government contracts are high-margin, long-term, and create anchor references for commercial sales. Also aligns with the empire mission (NZ jobs).

**Cost:** 3-6 months of relationship-building. Sales time, not engineering time.

**Leverage:** High if any deal lands. One NZ government contract can cover 12-24 months of runway in a single signature.

**Beware:** Government sales cycles can eat years. Budget the time but do not depend on the revenue.

### 4.2 Provisional patents on the novel primitives

**Move:** File provisional patents on any genuinely novel architecture patterns Crontech invents — specifically around:
- Three-tier compute routing (client GPU → edge → cloud) for AI workloads
- Polyglot runtime substrate with shared compliance primitives
- AI-participant CRDT collaboration
- Automatic RAG indexing across heterogeneous data stores

**Why it works:** Provisional patents are cheap ($150-500 each) and give Craig 12 months to decide whether to file full patents. They are also a moat against fast-followers and a credibility signal for enterprise buyers.

**Cost:** $500-2,000 total for 3-4 provisionals.

**Leverage:** Medium. Patents rarely matter in practice but can matter enormously in acquisition discussions or defensive litigation.

**Rule:** NEVER use patents offensively. Only defensively. This aligns with the "polite tone" rule in POSITIONING.md.

### 4.3 Advisory board of three

**Move:** Assemble a three-person informal advisory board by Month 12:
1. A SOC 2 / compliance auditor who has audited AI SaaS companies
2. A solo founder who has exited a dev-tools SaaS for $10M+
3. An experienced NZ/PH HR or operations leader who knows employment law across both countries

**Why it works:** Advisors are force multipliers. One good intro from a credible advisor can replace 6 months of cold outreach. And Craig's decision quality goes up when he has experienced people to pressure-test ideas against.

**Cost:** Typically 0.1-0.5% equity per advisor, or a small cash retainer ($500-2,000/month). Total: ~1-1.5% equity or ~$2-6K/month.

**Leverage:** Very high for intros. Medium for strategic input.

## 5. Tier 4 — Anti-traps (do NOT do these)

Equally important: the moves that LOOK like they would help but actively reduce odds of success. Craig should refuse these even when tempted.

### 5.1 Do NOT try to match Vercel feature-for-feature

**Why:** Vercel has 400+ engineers. A feature-parity race is unwinnable. Crontech wins by having the ONE thing Vercel doesn't (compliance-native primitives) and deliberately ignoring features that don't serve the compliance-native wedge.

**Correct move:** Every feature request must pass the filter: "Does this make Crontech more compliance-native for AI SaaS?" If no, reject.

### 5.2 Do NOT perfect the architecture before shipping

**Why:** Perfect architecture ships in Year 3. Real revenue requires shipping in Month 2. Dogfood migrations will reveal the right architecture faster than any amount of upfront design.

**Correct move:** Ship the migration. Let the migration reveal the architecture. Refactor when the substrate's actual usage tells you what to refactor.

**Rule:** Architecture reviews are a trap for solo founders. Claude must flag it when Craig starts "just cleaning up the substrate layer" instead of shipping migrations.

### 5.3 Do NOT over-build the admin area pre-revenue

**Why:** An admin area is valuable at 50+ customers. At 0-10 customers, a spreadsheet + Grafana + a tRPC admin procedure is sufficient. Time spent polishing the admin area is time NOT spent migrating dogfood apps or hunting customers.

**Correct move:** Admin area gets exactly these pages until $10K MRR:
1. Empire overview (jobs created, revenue, runway)
2. Infrastructure status (which Vultr server, health, uptime)
3. Migration status (which app is on Crontech, which is pending)
4. CFO report viewer (latest monthly report)

That's it. No fancy charts. No dark mode. No exports. No multi-tenant admin.

### 5.4 Do NOT take VC money in the first 18 months

**Why:** Craig's infinite runway is his biggest advantage. VC money comes with board seats, milestones, and pressure to grow fast in directions that may not align with the compliance-native wedge. Without VC, Crontech can stay niche and patient. With VC, it cannot.

**Correct move:** Refuse meetings with VCs until Crontech is at $50K+ MRR. At that point, evaluate whether VC accelerates the employment mission or compromises it. Default answer is "no thanks, we're profitable and growing."

### 5.5 Do NOT hire a general manager until there is something to manage

**Why:** Pre-revenue GMs are expensive assistants. A Chief of Staff (much cheaper) delivers 80% of the value at 40% of the cost until there is real management load (usually $750K-$1M ARR).

**Correct move:** Follow the hiring order in `docs/strategy/BURNOUT-PROTECTION.md` §3. Accountant first. VA second. Engineer third. Chief of Staff fourth. Real GM only after $750K-$1M ARR.

### 5.6 Do NOT broaden the positioning to reach more customers

**Why:** Niches win. Generalists lose. Every time Crontech is tempted to add "...and also for fintech" or "...and also for web3", it dilutes the compliance-native AI SaaS wedge and makes the sales pitch harder.

**Correct move:** Stay narrow until the narrow niche is fully captured. Expand only after the first $1M ARR is locked in from AI SaaS specifically.

### 5.7 Do NOT skip the burnout protection rules under any circumstance

**Why:** The #1 cause of solo-founder startup death is founder burnout. Not bad product, not bad market, not bad competition. Founder burnout. Every other lever in this document is worthless if Craig is not functional.

**Correct move:** Sundays off. 8pm hard stop. Monthly walk-away day. See `docs/strategy/BURNOUT-PROTECTION.md`. These rules are not soft. They are the highest-leverage productivity tool Craig has.

## 6. Leverage scorecard — quick reference

| Lever | Cost | Leverage | When |
|---|---|---|---|
| Lock compliance-native wedge publicly | $0 | Extreme | Week 1 |
| Anchor customer hunt | $0 | Very high | Week 1-4 |
| Founder brand (Twitter/LinkedIn) | $0 | High, compounding | Week 1 onward |
| Open-source audit log library | 1-2 days | Very high | Week 2 |
| SOC 2 Type I readiness | $10-30K | Enormous | Month 3-6 |
| First PH engineer | $40-60K/yr | High | Month 3-6 |
| Three design partners | $0-500/mo | Medium-high | Month 2-4 |
| Sentinel as revenue stream | 2-4 weeks | Medium | Month 6+ |
| NZ government contracts | Time only | High if landed | Month 6-12 |
| Provisional patents | $500-2K | Medium | Month 6-12 |
| Advisory board of three | 1-1.5% equity | Very high for intros | Month 6-12 |

## 7. How Claude-as-CFO uses this document

Every monthly CFO report must include a section: **"Advantage levers — status."** That section:

1. Lists each Tier 1-3 lever
2. Marks it as: not started / in progress / blocked / complete
3. If blocked, identifies the blocker and recommends next action
4. Flags any Tier 4 anti-trap that Craig appears to be drifting toward

This keeps the compounding levers visible every month. Nothing gets forgotten.

## 8. Amendment process

Tier 1 levers are LOCKED and may only be removed by Craig with explicit in-session authorization.

Tier 2-3 levers may be reordered based on learnings, but the full list must remain tracked until Craig explicitly delists one.

Tier 4 anti-traps are LOCKED and may not be removed. They exist because future Claude sessions will be tempted to recommend them, and this document is the guardrail.
