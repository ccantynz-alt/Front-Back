# Crontech Strategy Notes — 2026-04-22

This document captures the strategic thinking from Craig's launch-prep session on 2026-04-22. It is committed to the repo so it survives memory loss, session boundaries, Claude version changes, and anyone who joins the team later. **If you're reading this in a future session — start here.**

---

## The mission

Make it cheap and fast for **anyone** to start a business, employ people, and serve customers. The internet should be open to everyone. Crontech is how Craig intends to make a lot of money so a lot of jobs get created at a time when people are struggling.

The mission shapes every product decision. If a feature locks out a non-developer, we reconsider. If pricing keeps a bootstrapper from starting, we reconsider. If a 3% fee beats a $29/mo fixed cost for the mission, we take the 3%.

---

## The moat — four things the hyperscalers cannot copy

1. **Claude-native, not Claude-added.** Anthropic Claude is primary intelligence, OpenAI is fallback. Google leads with Gemini (behind on reasoning), Microsoft/OpenAI, AWS has a menu. We ship with the best model on the market as default. Say this plainly on the landing page: *"Powered by Claude, the most capable AI on the market."*

2. **Self-dogfooding loop.** Crontech runs on Crontech. Gluecron hosts the git. Gatetest gates the CI. AlecRae sends the email. Google doesn't visibly run Google on Google Cloud. Vercel doesn't host Vercel on Vercel. We run four products on the platform, visible to customers. This is proof nobody else has.

3. **AI loop end to end.** Prompt → deploy → auto-fix (Gatetest) → self-monitor → iterate. Google Cloud is infrastructure. Crontech is intelligence. Every layer of the platform is aware of every other layer because Claude is the glue.

4. **Founder-tier pricing.** Hyperscalers physically cannot offer lifetime deals because their finance org kills them. We can. Lean into this — first 1,000 founders get lifetime pricing is a legitimate scarcity marketing play.

---

## The positioning shift (critical — don't forget this)

Crontech is **NOT** "the developer platform for the next decade." That locks out 95% of the TAM.

Crontech IS the **platform where anyone builds anything** — online stores, restaurants, creators, agencies, real estate, SaaS founders, nonprofits, marketplaces, local services, AI apps. One platform. Every business. AI-native at every layer.

The hero should read something like: *"Build a business. We'll power the internet part."* with the AI Builder promoted so non-coders can describe their business in plain English and Claude ships it.

See `/solutions` (commit `167b182`) for the 10 vertical tiles this unlocks.

---

## Competitive frame — where we punch up vs where we lose

**We compete with Google Cloud Run / App Engine, Azure App Service, AWS Amplify in the developer-PaaS lane.** Real competition.

**We win on:**
- Claude-native (stated above)
- Opinionated, not a menu (AWS has 200+ services; Crontech has one path)
- Self-dogfooding (stated above)
- Indie speed (we ship a feature in an evening; Azure ships it in a quarter)
- Founder pricing (stated above)
- Fresh-out-of-the-gate — no legacy customers to placate, no backwards compat to maintain, no internal political battles, can ship breaking changes weekly, can make opinionated choices without justifying to 1000 enterprise customers

**We lose on:**
- Brand trust (nobody has heard of Crontech)
- Geographic footprint (hyperscalers have 100+ regions)
- Compliance (SOC 2 Type II claim on landing page is NOT YET REAL — soften to "in progress")
- Enterprise sales motion
- Free-tier depth (hyperscalers have huge free tiers that subsidise acquisition)

**Strategic posture:** Do not pitch Fortune 500 — we can't win there yet. Pitch devs + SMBs + indie agencies + non-coders who are **exhausted by hyperscaler sprawl**. Massive underserved market.

---

## The five AI features hyperscalers cannot ship

Pick these as the roadmap. They exist because we're small, fresh, and Claude-native.

1. **Self-healing deploys.** A build fails → Claude reads error + code + recent commits → proposes a fix → ships a PR back to the user's repo. Gatetest already does this for code; extending to deploys is days, not months. Azure can't do this because Azure doesn't know your code. Crontech does.

2. **Prod observability in English.** "Why is checkout slow on Safari iPad?" → Claude reads metrics, traces, logs, recent deploys → answers in plain English with a PR. One feature replaces Datadog + New Relic + Sentry + a senior SRE.

3. **AI for the end-user (not just dev).** A restaurant's Crontech-hosted site gets Claude as a built-in customer chat, menu writer, and reservation handler out of the box. Every Crontech customer's customers interact with AI. Google Cloud doesn't ship this because it's not infrastructure — it's product.

4. **Weekly business insights email.** Every Crontech app auto-generates a Monday morning email: *"Conversion dropped 8% this week. Claude thinks it's the checkout button colour on Android. Here's a PR that reverts."* Replaces Shopify Analytics + Stripe Radar + GitHub Copilot + PagerDuty.

5. **Live AI demo on the landing page.** Visitor types *"build a pizzeria website"* in an input box on crontech.ai → Claude starts generating code + preview right there. Like v0.dev but for whole businesses. No other cloud landing page has this.

---

## Pricing philosophy

Current pricing: Free / Pro $29 / Enterprise $99. **This is wrong for the mission.**

A yoga teacher cannot pay $29/mo before selling a single class. That locks out the very audience the mission is built for. The pricing should be:

- **Free until you make your first $1,000.** No credit card. No time limit.
- **Then 3% of revenue** (or a fixed tier if they prefer predictability).
- **Pro and Enterprise** stay as self-service tiers for customers who want fixed costs.

This is a **massive moat vs Google Cloud** — they physically cannot offer revenue-share because finance kills it. It also means we only make money when our customers make money. That's the right alignment for the mission.

**Not implemented tonight.** Flag as highest-priority pricing change post-launch.

---

## The launch sequence (don't reverse this)

1. **Tonight — soft launch.** Crontech.ai stays on Vercel. Stripe goes live. AlecRae sends emails. Customers can sign up, pay, deploy. We protect revenue by keeping the proven hosting layer underneath.

2. **Within a week — shadow deploy.** Crontech-on-Crontech in parallel with Vercel. Run both, compare, fix anything weird.

3. **Day 10-14 — DNS cutover.** Once we have 48 hours of green on the shadow, flip DNS. Now Crontech genuinely runs itself.

4. **Month 2 — migrate Gluecron / Gatetest / AlecRae off their current hosts to Crontech.** Same staged pattern.

**Do not do step 3 or 4 on launch night.** The earlier conversation on this point: *"Stage 3 (battle-tested): migrate YOUR code off external hosts. Slowly."* Ripping yourself off Vercel tonight is how you lose launch night to a CDN config bug.

---

## The family of products

Craig owns **four** products that dogfood each other:

| Product | Role | Repo |
|---|---|---|
| **Crontech** | Hosting / DB / auth / AI / billing — the platform | `ccantynz-alt/crontech` |
| **Gluecron** | Git hosting — replaces GitHub for Crontech | `ccantynz-alt/gluecron.com` |
| **Gatetest** | CI/QA/visual regression — replaces Playwright/Cypress/Percy | `ccantynz-alt/gatetest` |
| **AlecRae** | Transactional email — replaces Resend/Mailgun | `ccantynz-alt/alecrae` (not yet in session scope) |

All four expose `/api/platform-status` with the same contract (`docs/PLATFORM_STATUS.md`). Admin dashboards of each product show live health cards for all siblings. Customers of each product see gentle cross-sell CTAs for the others.

---

## AlecRae integration spec (for Crontech)

Full spec lives in session conversation and in `docs/LAUNCH_CHECKLIST.md` §1. Short version:

- `POST https://api.alecrae.com/v1/send` with Bearer API key
- 10 templates Crontech needs: verify-email, welcome, password-reset, magic-link, waitlist-confirm, subscription-created, payment-failed, deploy-success, deploy-failure, custom-domain-verified
- Sender domain `mail.crontech.ai` (NOT `crontech.ai` — keeps primary domain reputation clean)
- Outbound webhook to `https://crontech.ai/api/alecrae/webhook` on delivered/bounce/complaint/open/click
- Per-tenant workspace (Crontech, Gluecron, Gatetest, AlecRae own-ops = four tenants)
- Env vars: `ALECRAE_API_KEY`, `ALECRAE_API_URL`, `ALECRAE_WEBHOOK_SECRET`, `EMAIL_FROM`

---

## What NOT to claim on the landing page (yet)

- "SOC 2 Type II" — soften to "SOC 2 Type II in progress" until the audit is actually complete. Claiming certification without it is a lawsuit magnet once paying customers arrive.
- "330+ cities" — depends on Cloudflare Workers as hosting primitive. If that's genuinely true, keep it; if it's aspirational, soften.
- "Self-hostable" — only true if we actually ship a docker-compose customers can run. Don't promise what doesn't exist.
- "Hash-chained audit log" — carry-over from the old SOC 2 pitch. Remove if not real.

Err on the side of understated claims + overdelivered reality. Easier to upsell than to retract.

---

## What landed on the branch `claude/plan-platform-architecture-kkN4y` in this session

By commit SHA, chronological (most recent at top):

- `167b182` — feat(marketing): `/solutions` page with 10 vertical tiles (every business)
- `17962142` — feat(checkout): `/checkout/:plan` auth-gated Stripe handoff
- `5e46035` — feat(pricing): per-plan CTAs route at `/checkout/:plan` instead of waitlist
- `76c1791` — docs: `docs/LAUNCH_CHECKLIST.md` — one-page go-live guide
- `b242c77` — docs(env): label AlecRae PRIMARY, Resend FALLBACK
- `e61d3a2` — docs(env): Stripe price-ID vars with launch instructions
- `e4cbf4c` — feat(billing): drive Stripe price IDs from env, gate missing-price checkout
- `efc49f4` — feat(auth): email verification pipeline (migration 0025, tokens, /verify-email, welcome email, 9 tests)
- `6591f82` — docs: 5 real Getting Started quickstart articles
- `0eac49b` — fix(landing): iPad-landscape stats grid, tech strip, hero rhythm (via GateTest dogfood)
- `a516c3c` — revert: remove Playwright — use GateTest for visual QA (Craig's own product)
- plus 10 earlier commits for cross-product health widget + platform-siblings fan-out + cross-sell card

Gluecron and Gatetest each received matching cross-product widget + cross-sell card commits on the same branch name.

---

## Known blockers / follow-ups Craig must handle outside the code

- Create real Stripe prices in dashboard, paste IDs into Vercel, flip `STRIPE_ENABLED=true`
- Provision AlecRae tenant, create 10 templates, add `mail.crontech.ai` DNS records
- Decide where the orchestrator actually runs in prod (`ORCHESTRATOR_URL` currently defaults to `127.0.0.1:9000` — unreachable in prod)
- Soften SOC 2 claim on landing page (I ran out of session time before doing this cleanly; a broken merge from Main mangled `index.tsx`, see next section)

---

## Known issue — `index.tsx` is in a broken merge state

The merge `46c4844` from Main at 19:09Z mashed two versions of the landing page together without resolving conflicts. Symptoms:
- Two opening `<div>` tags for the hero container
- Two tech strips in a row
- Two stats sections competing
- References to `signals`, `SignalBlock`, `problems`, `ProblemCard` that aren't defined
- Two `<h2>` tags stacked in the pillars section

**The branch probably won't build right now.** Action required: revert `index.tsx` to a clean version (either `0eac49b` = SOC-2 compliance pitch, or take Main's developer-platform pitch, or — best — write a clean rewrite matching the "every business" positioning above). I recommend the clean rewrite so the landing page matches the mission.

---

## The three questions to answer before every future decision

1. **Does this serve the mission?** (Make the internet open. Create jobs. Let strugglers start businesses.)
2. **Does it widen the moat?** (Claude-native, self-dogfood, AI loop, founder pricing)
3. **Does it raise the win rate against Google / Microsoft / AWS for devs + SMBs exhausted by hyperscaler sprawl?**

If the answer to all three is yes, ship it. If not, reconsider.

---

*Last updated: 2026-04-22. This document is canonical. Update it, don't replace it.*
