# Competitor-Free Stack Rule

**Status:** LOCKED. This is a binding rule on every tool decision across Crontech and the Canty empire.
**Authored:** 2026-04-10
**Origin:** The Xero incident — Claude recommended Xero for Crontech bookkeeping before realizing it is a direct competitor to Astra/ledger.ai.

---

## 1. The rule

> **Crontech and every project under the Canty empire banner must run on tools that are NOT direct competitors to any product in the empire.**
>
> If you are building a replacement for X, you cannot pay X to run your own business.

Before adopting any tool — accounting, auth, email, CRM, analytics, hosting, CI, anything — check it against this rule. Every. Single. Time.

## 2. Why this rule exists

Three reasons:

1. **Brand vulnerability** — "You're building the X replacement but you use X yourself" is a line that gets used against you by competitors, journalists, and prospects. Cut it off at the source.

2. **Moral alignment** — Craig's empire mission is to replace these tools with better ones. Paying them is funding the thing you are trying to defeat.

3. **Dogfood pressure** — If you cannot use your own tool for your own business, your tool is not ready. Forcing internal use creates the fastest feedback loop for fixing it.

## 3. The current empire competitive audit

For each project in the empire, identify the primary competitors that are **banned as internal tools**:

### Front-Back / Crontech — competes with dev platforms

**Banned internal tools:**
- Vercel (hosting, DNS, edge)
- Cloudflare Pages / Workers (hosting)
- Netlify (hosting)
- Render (hosting)
- Railway (hosting)
- Fly.io (hosting)
- Supabase (database + auth + storage)
- Convex (backend)
- Heroku (hosting)
- AWS Amplify (hosting)
- DigitalOcean App Platform (hosting)

**Current exceptions (with expiration dates):**
- Vercel deployment of apps/web — **EXPIRES Week 0** when Hetzner Phase 0 is live
- Cloudflare Pages deployment — **EXPIRES Week 0** when Hetzner Phase 0 is live
- These exceptions exist ONLY because Phase 0 infrastructure is not yet provisioned

### Astra / ledger.ai — competes with accounting platforms

**Banned internal tools (ALL empire projects):**
- Xero ⚠️ PRIMARY COMPETITOR
- MYOB ⚠️ NZ/AU incumbent
- QuickBooks (Intuit) ⚠️ US incumbent
- FreshBooks
- Wave
- Zoho Books (less direct but still in category)
- Sage Accounting
- NetSuite (enterprise but still category)

**Allowed substitutes for the bridge period (until Astra is production-ready):**
- NZ independent chartered accountant handling books in their own back-office tool (CCH iFirm, APS, HandiSoft, MYOB AE Practice, or similar)
- Plain spreadsheet + accountant reconciles
- **Target state:** All empire books move to Astra by Week 3+ of the migration plan

### GateTest — competes with QA/testing/security tools

**Banned internal tools (for Crontech CI/QA):**
- Any commercial code review tool (CodeClimate, SonarCloud, Codacy)
- Commercial security scanners (Snyk, Mend/WhiteSource)
- Commercial AI code review (GitHub Copilot for code review, Sourcegraph Cody for review)
- OWASP commercial scanners

**Allowed (for now):**
- Biome (linter/formatter — not a competitor, complementary tool)
- GitHub Actions (CI runner, not a QA tool per se)
- Open-source OWASP tools (dependency-check, etc.)
- **Target state:** Dogfood GateTest on Crontech's own codebase when GateTest is migrated to Crontech

### voice — competes with dictation / voice-AI tools

**Banned internal tools:**
- Otter.ai
- Rev.com
- Descript (partial overlap)
- Grammarly dictation features
- Fireflies.ai
- Any AI meeting transcription tool
- Whisper-based commercial services

**Allowed:**
- Open-source Whisper self-hosted (if needed before voice is production-ready)
- **Target state:** Dogfood voice for all empire dictation needs once production-ready

### emailed — competes with email services

**Banned internal tools (unclear until Craig confirms emailed's exact positioning):**
- **Awaiting confirmation from Craig** on emailed's specific competitive target
- Suspected: transactional email services (Mailgun — currently used by Astra, flag for review), Resend (currently used by Crontech), SendGrid, Postmark, AWS SES
- OR: email marketing (Mailchimp, ConvertKit, Beehiiv, Substack)
- OR: inbox management (SuperHuman, Shortwave, Missive)

**ACTION ITEM:** Craig to confirm emailed's exact competitive wedge, then update this section.

### ledger.ai — SEE Astra section above (same project, two names)

### Zoobicon.com — competes with AI website builders

**Banned internal tools:**
- v0.dev (Vercel)
- Bolt.new (StackBlitz)
- Lovable.dev
- Replit AI
- Framer AI
- Wix ADI
- Durable AI website builder
- Webflow AI

**Current exceptions:**
- None — Crontech should never use any AI website builder to build its own pages. Components are hand-written or AI-generated via Crontech's own generative UI pipeline.

### AI-Immigration-Compliance — competes with compliance / legal tech

**Banned internal tools (unclear specifics until Craig confirms):**
- **Awaiting confirmation from Craig** on exact competitive positioning
- Suspected: immigration case management (Docketwise, INSZoom, Cerenade), compliance platforms (Vanta, Drata in compliance tooling), legal AI (Harvey AI, CoCounsel)

**ACTION ITEM:** Craig to confirm AI-Immigration-Compliance's competitive target, then update.

### Esim — empty placeholder

No competitor list until the project actually starts. Flag: "the most sophisticated AI generated eSIM website on the market" suggests competitors would include Airalo, Holafly, Nomad eSIM, Saily, GigSky, Ubigi.

## 4. The approval workflow for any new tool

Before adopting ANY third-party tool or service for the empire, Claude (as CFO) must run this check:

```
1. What does this tool do? (One sentence)
2. Which empire project, if any, competes in this category?
3. Is the tool in the banned list for that project?
4. Is there a non-competing alternative?
5. Is there an empire project that could provide this capability (dogfood option)?
6. If no alternatives exist and dogfood is not yet ready, is this tool a bridge?
   — If bridge: set an expiration date tied to the empire project's production-ready milestone
   — If not a bridge: STOP. Find another solution.
```

**Claude must run this check in-chat before recommending any tool.** Failure to run it is a doctrine breach.

## 5. Bridge tools require expiration dates

Sometimes you need a competitor's product temporarily because the empire project that would replace it is not production-ready yet. This is allowed **only as a bridge**, and every bridge must have:

1. A clearly identified end-date or milestone-based trigger
2. A tracked line in this document or the migration plan
3. A reminder to Claude to push for the migration when the trigger hits

**Current bridges with expiration dates:**

| Bridge tool | Reason | Replacement | Expires |
|---|---|---|---|
| Vercel hosting (apps/web) | Crontech Phase 0 not yet live on Hetzner | Crontech self-hosting | Phase 0 Week 0 completion |
| Cloudflare Pages hosting | Same | Same | Same |
| NZ accountant's back-office tool for books | Astra not yet production-ready for NZ GST | Astra on Crontech | Astra Week 3+ of migration plan |
| Resend for outbound email (Crontech) | emailed not yet production-ready | emailed on Crontech | emailed Week 2 of migration plan (review then) |
| Mailgun for outbound email (Astra) | Same | Same | Same |
| Whatever CI runner is used | N/A (no empire CI tool planned) | — | No expiration |
| GitHub (code hosting) | N/A (no empire GitHub replacement planned) | — | No expiration |

## 6. Tools that are ALLOWED forever (no empire competitor)

These tools do not have any empire project targeting them and are safe to use indefinitely:

- GitHub (code hosting and CI) — allowed
- Stripe (payment processing) — allowed (we are not building a Stripe competitor)
- Claude API / Anthropic SDK — allowed (we use LLMs, we don't build them)
- OpenAI API — allowed (same reason)
- Hetzner (bare metal hosting) — allowed (we are not building a bare-metal provider)
- Linux distros, PostgreSQL, Redis, nginx, Caddy — allowed (open source foundations)
- Domain registrars (Namecheap, Porkbun) — allowed
- DNS providers (Cloudflare DNS is the exception — fine as pure DNS, but never as hosting)
- Twitter/LinkedIn/etc. for marketing — allowed (distribution channels, not product competitors)

## 7. Edge cases and judgment calls

**Mailchimp for Crontech email marketing to prospects** — Is this OK if emailed isn't a marketing email tool?
— **Answer: pending Craig's confirmation of emailed's positioning.** Until then, avoid Mailchimp in favor of plain Resend or a manual workflow.

**Notion for internal docs** — Is Notion a competitor?
— **Answer: no, Crontech does not compete with Notion. Notion is allowed for internal wiki/docs.** However, when Crontech's admin area matures, consider migrating internal docs there as a dogfood exercise.

**Slack for team communication** — Competitor?
— **Answer: no, Crontech does not compete with Slack. Allowed.** Same future-dogfood consideration.

**Google Workspace for email/calendar/drive** — Competitor?
— **Answer: no, Crontech does not compete with Google Workspace at the infrastructure level. Allowed.**

**Zoom for customer calls** — Competitor?
— **Answer: no. Allowed.** (voice is dictation, not meeting video.)

## 8. The meta-rule

> **If you find yourself about to say "we'll just use [competitor] for now," STOP and ask: is this a temporary bridge with a clear expiration, or am I funding the thing I'm trying to defeat?**

If you cannot answer in under 10 seconds with a clear expiration, find another tool.

## 9. Amendment process

This rule is binding. Competitor lists may be amended by Craig as empire projects evolve their positioning. New empire projects must add a competitor section to this document on day one.

Future Claude sessions must read this file before recommending any tool. Failure to check is a doctrine breach.
