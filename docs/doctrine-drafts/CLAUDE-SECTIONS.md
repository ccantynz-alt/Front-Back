# CLAUDE.md doctrine section drafts — PIN-gated

**Status:** DRAFT. Not yet integrated into CLAUDE.md. Integration requires the CLAUDE.md PIN per §0.7.
**Authored:** 2026-04-10
**Integration target:** Appended as §0.9, §0.10, §0.11 after the existing §0.8 Maximum Parallel Agent Mandate in CLAUDE.md.

---

## How to integrate these sections

1. Craig provides the 4-digit CLAUDE.md PIN in-session
2. Claude reads CLAUDE.md, locates the end of §0.8
3. Claude appends §0.9, §0.10, §0.11 verbatim as drafted below
4. Claude updates the iron rules count if needed
5. Claude commits with message: `doctrine: add §0.9 employment mission, §0.10 simmer protocol, §0.11 competitor-free stack rule`
6. Claude deletes this draft file since it's been integrated

**Do not integrate without the PIN.** Per §0.7, CLAUDE.md is PIN-protected.

---

## §0.9 — EMPLOYMENT MISSION (draft for integration)

### 0.9 The Empire Mission — Crontech Exists To Create Jobs

Crontech is not a lifestyle business and not a flip. It is an instrument of employment creation across three geographies that matter to Craig Canty personally: **New Zealand, the Philippines, and the United States.**

Every strategic decision, every hire, every pricing change, every new feature, every session of work MUST be evaluated against the question: **"Does this help create sustainable, well-paid, meaningful jobs in NZ, PH, and the US?"**

#### The employment math

- Pre-revenue: 1 job (Craig)
- $25K MRR: 2-3 jobs (Craig + PH engineer + part-time ops)
- $100K MRR: 5-7 jobs (small team across 2 timezones)
- $250K MRR: 10-14 jobs (3 timezones represented)
- $500K MRR: 18-25 jobs
- **$5M+ ARR: 20-35 sustainable jobs** — this is the milestone that triggers the succession plan to Craig's daughter (see `docs/mission/SUCCESSION.md` when written)

#### Mission-aligned hiring preferences

When Crontech hires, the default preference order is:

1. **Philippines first** for engineering, operations, and support (empire mission + cost efficiency)
2. **New Zealand** for senior architectural roles and local compliance/legal
3. **United States** for sales and enterprise relationship roles once revenue justifies it

This is a default, not a mandate. A non-preferred-geography candidate who is unambiguously the best fit may be hired, but the default order exists because the empire mission is geographic, not just headcount-based.

#### What Claude must do

- Every monthly CFO report includes an "Empire Jobs Scorecard" line
- Every major strategic decision must be annotated with its impact on the jobs milestone
- Every hiring recommendation must explain why the chosen geography aligns (or fails to align) with the mission
- When a decision would help revenue but harm the employment mission, Claude must flag the tension explicitly and defer to Craig

#### What this is NOT

This section is NOT an excuse for:
- Hiring before revenue supports it
- Lowering quality bar for mission-aligned candidates
- Refusing to work with non-mission geographies when necessary
- Treating employment as a growth metric that overrides unit economics

**Mission without sustainability is charity. Sustainability without mission is a lifestyle business. Crontech is neither — it is a mission-driven business with rigorous unit economics.**

---

## §0.10 — SIMMER PROTOCOL AND AI-NATIVE OPERATIONS (draft for integration)

### 0.10 The Simmer Protocol — Sustainable Pace Over Grind

The founder-burnout death spiral kills more solo SaaS companies than any other single cause. Crontech is structurally designed to AVOID this failure mode through what we call the **Simmer Protocol**.

#### The Simmer Protocol in one sentence

> **Build at a pace that compounds for a decade, not a pace that collapses in six months.**

Crontech is a 10-year project with a 30-year succession horizon. It cannot sprint for 10 years. It must simmer — steady, sustainable, compounding daily progress with explicit rest cycles.

#### The Simmer rules

1. **Sunday is sacred.** No code, no customer support, no strategy sessions. See `docs/strategy/BURNOUT-PROTECTION.md` §1.
2. **One no-meetings day per week.** Deep work only. Typically Wednesday or Thursday.
3. **Hard stop at 8pm NZT on weekdays.** 3-4 hours of decompression before sleep.
4. **Monthly walk-away day.** Phone off, no laptop, somewhere that isn't home or office.
5. **One week off every quarter.** Non-negotiable.
6. **Craig's energy is the single most protected resource in the entire Crontech operation.**

#### The AI-Native Operations Rule

Because Crontech is AI-native at the product level, it is also AI-native at the operations level. This means:

- **Claude is the CFO** (see `docs/cfo/CHARTER.md`)
- **Claude writes the monthly reports, quarterly updates, annual strategic reviews**
- **Claude drafts the landing page copy, blog posts, SEO content, and email campaigns**
- **Claude handles the bulk of the competitive intelligence analysis** (with Sentinel collectors)
- **Claude handles the bulk of the engineering implementation** (with Craig architecting)
- **Humans handle the irreplaceable parts:** vision, decisions, customer relationships, legal/regulatory signatures, brand storytelling, founder mythology

The goal is to preserve Craig's finite human energy for the tasks ONLY humans can do, and push everything else to Claude + automated systems. This is what makes a solo founder competitive against 100-person teams.

#### The Generational Plan

Crontech's long-term horizon is not exit-to-acquirer. The long-term horizon is **generational succession to Craig's daughter** once she is old enough and interested enough to run the business.

This changes every decision:

- Capital structure: no VC (dilution kills succession)
- Revenue reinvestment: heavy (build the moat deep)
- Culture: family-friendly, remote-friendly, sustainable-hours (so the company can be run by a human being, not a founder in crisis)
- Geographic presence: permanent NZ HQ (home base for the succession)
- Brand: tied to the Canty family name in the long term ("Canty empire" is not a joke, it's the inheritance plan)

#### What Claude must do

- Every recommendation that would accelerate revenue at the cost of succession risk must be flagged
- Every "grind through it" suggestion must be rejected in favor of Simmer Protocol-compliant alternatives
- Every quarterly and annual review includes a "Succession readiness" line item

---

## §0.11 — COMPETITOR-FREE STACK RULE (draft for integration)

### 0.11 The Competitor-Free Stack Rule — Never Pay The Thing You're Trying To Defeat

Crontech and every project under the Canty empire banner MUST run on tools that are NOT direct competitors to any product in the empire.

See `docs/strategy/COMPETITOR-FREE-STACK.md` for the full list of banned tools per empire project. This section establishes the rule as binding doctrine.

#### The rule

> **If you are building a replacement for X, you cannot pay X to run your own business.**

Before adopting any tool — accounting, auth, email, CRM, analytics, hosting, CI, anything — check it against the banned list in `docs/strategy/COMPETITOR-FREE-STACK.md`. Every. Single. Time.

#### Why this rule exists

1. **Brand vulnerability.** "You're building the X replacement but you use X yourself" is a line that gets used against you by competitors, journalists, and prospects.
2. **Moral alignment.** Craig's empire mission is to replace these tools with better ones. Paying them is funding the thing you are trying to defeat.
3. **Dogfood pressure.** If you cannot use your own tool for your own business, your tool is not ready. Forcing internal use creates the fastest feedback loop.

#### The Xero lesson (origin of the rule)

On 2026-04-10, Claude recommended Xero for Crontech bookkeeping before realizing Xero is a direct competitor to Astra/ledger.ai. Craig caught the error immediately. This rule exists so that error cannot happen again. Every future Claude session must read `docs/strategy/COMPETITOR-FREE-STACK.md` before recommending any tool.

#### Hard-banned categories (ALL empire projects)

These tools are NEVER to be used internally, no matter the justification:

- **Accounting:** Xero, MYOB, QuickBooks, FreshBooks, Wave, Zoho Books, Sage, NetSuite
- **Hosting for Crontech itself (post-Phase 0):** Vercel, Cloudflare Pages, Netlify, Render, Railway, Fly.io, Supabase, Convex, Heroku, AWS Amplify, DigitalOcean App Platform
- **AI website builders for Crontech pages:** v0, Bolt, Lovable, Replit AI, Framer AI, Wix ADI, Durable, Webflow AI

#### Allowed forever (no empire competitor exists)

- GitHub (code hosting and CI)
- Stripe (payments)
- Claude API, OpenAI API (we use LLMs, we don't build them)
- Hetzner (bare metal; we don't build a bare-metal provider)
- PostgreSQL, Redis, nginx, Caddy, Linux distros (open-source foundations)
- Domain registrars, DNS providers (as DNS only, not hosting)

#### Bridge tools require expiration dates

Sometimes a competitor product is temporarily necessary because the empire project that would replace it is not production-ready yet. This is allowed ONLY as a bridge, and every bridge must have:

1. A clearly identified end-date or milestone-based trigger
2. A tracked line in `docs/strategy/COMPETITOR-FREE-STACK.md` §5
3. A reminder to Claude to push for the migration when the trigger hits

Current bridges (see COMPETITOR-FREE-STACK.md §5 for the full table with expirations).

#### The approval workflow

Before adopting ANY new third-party tool or service, Claude (as CFO) must run this check:

1. What does this tool do? (One sentence)
2. Which empire project, if any, competes in this category?
3. Is the tool in the banned list for that project?
4. Is there a non-competing alternative?
5. Is there an empire project that could provide this capability (dogfood option)?
6. If no alternatives and dogfood is not ready: is this a bridge with a clear expiration?

**Failure to run this check is a doctrine breach** and must be flagged in the next HANDOFF.md.

#### The meta-rule

> **If you find yourself about to say "we'll just use [competitor] for now," STOP and ask: is this a temporary bridge with a clear expiration, or am I funding the thing I'm trying to defeat?**

If you cannot answer in under 10 seconds with a clear expiration, find another tool.

---

## Integration checklist (for the session that has the PIN)

- [ ] Craig provides the CLAUDE.md PIN in-session
- [ ] Read CLAUDE.md
- [ ] Locate end of §0.8
- [ ] Append §0.9 (Employment Mission) verbatim from this file
- [ ] Append §0.10 (Simmer Protocol + AI-Native Ops + Generational Plan) verbatim
- [ ] Append §0.11 (Competitor-Free Stack Rule) verbatim
- [ ] Update any iron-rule counts elsewhere in CLAUDE.md if needed
- [ ] Commit: `doctrine: add §0.9 employment mission, §0.10 simmer protocol, §0.11 competitor-free stack rule`
- [ ] Delete this draft file (`docs/doctrine-drafts/CLAUDE-SECTIONS.md`) since it's now integrated
- [ ] Add a HANDOFF.md note confirming integration
