# Anchor Customer Hunt — The First Paying Stranger

> **Status:** Draft playbook. Needs Craig's voice on ICP specifics and outreach tone.
> **Priority:** P0. This is the single highest-leverage activity after Phase 0 is live.
> **Referenced from:** `docs/migrations/week-7-zoobicon.md`, Tier 1 advantage lever #2.

---

## The definition

An **anchor customer** is the first person who pays Crontech who is not Craig, not a friend of Craig, and not someone who would use the platform as a favour. They pay because the wedge (compliance-native developer platform) solves a problem they were already trying to solve. They tell their peers about it without prompting. They would notice and complain if we shut down.

One anchor customer is worth more than 50 "interested" conversations. Until we have one, the positioning is a hypothesis. After we have one, it is evidence.

## Why this document exists

Migration Week 7 (Zoobicon) ends with the platform fully dogfooded across 7 Craig-owned verticals. That is necessary proof but insufficient revenue. **Dogfood is not product-market fit.** The anchor customer hunt is how we convert proof into revenue.

This doc is the playbook. It is intentionally narrow. We do not want to broaden positioning or chase multiple ICPs simultaneously. One wedge. One ICP. One funnel. When this playbook produces a paying customer, we write the next playbook.

---

## The ICP (Ideal Customer Profile)

### Who they are

- **Size:** 5–50 person engineering org. Big enough to have compliance obligations. Small enough that the decision maker is reachable in one conversation.
- **Vertical:** Legal tech, health tech, fintech, or any SaaS touching regulated data. The wedge only pays if compliance is a line item in their budget already.
- **Stack pain:** Currently running on AWS + compliance bolted on (Vanta, Drata, manual evidence collection) OR running on Vercel/Render and being told by their enterprise buyer that they need SOC 2 before the deal can close.
- **Trigger event:** They just lost (or are about to lose) a deal because their stack cannot produce the compliance evidence fast enough. This is the one signal that cuts through every other noise.

### Who they are NOT

- Not consumer-facing startups. Consumer doesn't buy compliance.
- Not pre-seed. No budget.
- Not post-Series B. Procurement will demand features we don't have yet.
- Not anyone who mentions "AI builder" as their primary use case. That is Zoobicon's market, not Crontech's anchor market. Keep them separate for now.
- Not anyone who just wants "Vercel but cheaper". Price isn't the wedge. Compliance is.

### The one sentence that qualifies them

> "We just lost a deal because we couldn't produce a tamper-evident audit log in the format the enterprise buyer asked for."

If they agree with that sentence, they are in ICP. If they don't, they are not.

---

## The wedge (why they'd buy)

Crontech is the only developer platform that ships:

1. **Hash-chained, RFC 3161 timestamped audit log** as a first-class primitive, not a bolt-on
2. **WORM document storage** via R2 Object Lock by default
3. **SOC 2-ready controls** pre-wired (no Vanta migration needed)
4. **Compliance evidence export** that matches the FRE 901/902 shape enterprise buyers actually ask for
5. **All of the above on day one** — not as a "we'll get you there in 6 weeks" consulting engagement

The competitor they're comparing us to is not another PaaS. It is the combined cost of Vercel + AWS + Vanta + 3 months of their senior engineer's time. Against that basket, we win on price AND speed AND technical correctness.

---

## Where to find them

### Tier 1 channels (direct, low-volume, high-trust)

1. **Craig's personal network.** Every NZ founder Craig has met in the last 5 years who runs a SaaS touching regulated data. Warm intro, not a cold email. Expected yield: 3–5 conversations, maybe 1 fit.
2. **Immigration/legal/accounting partners.** The NZ professionals we already engage for Crontech's own compliance needs. They know other founders in regulated verticals. Ask them for intros explicitly.
3. **Anchor candidates from the dogfood migration.** Astra (Week 3) and AI-Immigration (Week 4) are themselves case studies. If they work well, their own customers/partners see the result and ask "who built this?" Every Craig-owned vertical is a referral machine.

### Tier 2 channels (targeted outbound)

4. **LinkedIn search:** "CTO" + ("legal tech" | "health tech" | "fintech") + New Zealand/Australia/UK. Avoid US at this stage — US enterprise procurement is too slow for a cold outbound funnel.
5. **SOC 2 procurement posts on Reddit/HN:** Anyone publicly complaining about Vanta pricing or the evidence collection burden. Reply with a link to the audit log library, not a sales pitch.
6. **GitHub issue threads:** Any open-source compliance/audit-log project with a "this doesn't scale" issue open. Comment with the `@crontech/audit-log` repo. Soft touch.

### Tier 3 channels (do NOT use yet)

- ❌ Paid ads. Wasted money before we have a qualified landing page conversion funnel.
- ❌ Cold email sequencers (Apollo, Instantly, etc.). Too noisy for compliance buyers who already distrust cold outreach.
- ❌ Conference sponsorships. Too slow, too expensive, wrong stage.
- ❌ Influencer partnerships. Not how compliance buyers make decisions.

---

## The outreach cadence

### Touch 1 — Warm intro or targeted reply

- Context: they said or posted something that matches the qualifying sentence above
- Action: 1 message, <80 words, with exactly one link (to the OSS `@crontech/audit-log` README)
- Ask: "mind if I send you a 3-min screen recording showing how this would look on your stack?"
- Do NOT: attach a PDF, mention pricing, mention competitors by name (per POSITIONING.md polite tone rule)

### Touch 2 — The screen recording (if they say yes)

- 3 minutes max
- Show: the audit log primitive, the compliance evidence export, one real audit log row with the hash chain
- Close with: "if this looks useful, I can set up a sandbox on your domain in 30 minutes. No commitment. You either see it working on your data or you don't."

### Touch 3 — The sandbox

- Sandbox must be provisioned within 24 hours of their yes
- Sandbox must use their real domain on a subdomain (e.g. `crontech-trial.theirdomain.com`)
- Sandbox must have at least one realistic compliance export ready to download by the time they log in
- Do NOT drip-feed features. Show everything. They are judging whether the platform is real.

### Touch 4 — The offer

- Price: NZD $499/month for the first anchor. We are not trying to maximise ARPU. We are trying to get a logo and a case study.
- Term: Month-to-month. No annual lock-in for the first customer. Low-risk yes.
- Included: everything the platform ships, with a direct Slack channel to Craig for the first 90 days. Founder-led support is the weapon here.
- Documented: a written "anchor customer promise" PDF with SLA, rollback guarantees, data export guarantee, and what happens if Crontech goes away (open-source fallback plan).

### Touch 5 — The case study

- Within 30 days of them going live, interview them and write the case study
- Publish it (with their permission) on `/customers/<slug>`
- Co-market: a joint LinkedIn post from Craig + them announcing the move. This is how touch 1 for the next 10 conversations happens.

---

## Qualifying criteria — say NO fast

The worst outcome is spending weeks courting a customer who is not in ICP. Say no when any of these are true:

| Red flag | Reason |
|---|---|
| They ask for a feature that isn't on the roadmap for the next 90 days | We do not custom-build for anchor customers. Too distracting. |
| Their budget authority is "the board" | Too slow. Move on. |
| They want a POC that runs in parallel with their existing stack for 6+ months | Paid pilot is fine. 6-month unpaid POC is not. |
| They ask "do you integrate with X?" where X is an obscure legacy tool | Integration work scales badly. Save it for post-anchor. |
| They mention AI website builder use case | Redirect to Zoobicon. Different product, different buying cycle. |
| They are based in the US and need FedRAMP Moderate | Right ICP, wrong timing. Park them for 2027. |
| The decision maker cannot be on a call within 2 weeks of first contact | Not a real opportunity. |

**Craig has the final call on any close call.** When in doubt, Claude flags it, Craig decides.

---

## Deal structure

### The $499/month anchor offer (binding)

- **Monthly, month-to-month, cancellable with 30 days notice**
- Includes: all compute + storage + auth + audit log + support for up to 100k requests/day and 10GB storage
- Overage: if they blow past the limits, we eat the cost for the first anchor. Do not bill.
- Success milestone: if they are still on the platform 90 days later, we record it as anchor-customer-locked and start the case study process

### What we ask for in exchange (not money, asks)

1. **Case study rights** — we can name them on the `/customers` page and write up their story
2. **Quote rights** — we can use 2–3 lines from the CTO for marketing
3. **Reference calls** — they agree to take up to 2 reference calls per quarter for prospects we send their way
4. **Feedback loop** — weekly 30-min check-ins for the first 6 weeks, then monthly

These asks are worth more than the $499/month. We are trading price for social proof.

---

## What Craig needs to do

Execution belongs to Craig (for now). Claude cannot make outbound calls or decide close-call ICP qualifying. Claude can:

- Maintain this playbook and evolve it based on what Craig learns in live conversations
- Draft outreach copy, screen recording scripts, and the sandbox provisioning scripts
- Run the sandbox tech side (provision, monitor, support)
- Triage inbound leads against the qualifying criteria and produce a yes/no/maybe triage for Craig to review
- Write the case study once the customer is live

Craig does:

- The actual outreach messages (Claude drafts, Craig personalises and sends)
- The video calls with prospects
- The pricing negotiation (anchor price is fixed, but term flexibility requires Craig's judgement)
- The go/no-go call on every anchor opportunity
- The case study interview

---

## Exit criteria for the hunt

The anchor customer hunt is complete when **all of the following are true**:

- [ ] At least one customer outside Craig's personal network has paid at least 30 days of the anchor offer
- [ ] That customer is in ICP (matches the qualifying sentence)
- [ ] That customer has given case study and reference rights in writing
- [ ] A case study is published on `/customers/<slug>` with their approval
- [ ] At least one inbound lead has arrived citing the case study as the reason for reaching out

When all five are true, we declare anchor lock. The next playbook (`docs/ANCHOR_TO_TEN.md` — unwritten) governs the transition from one anchor to ten.

---

## Rollback and failure modes

### If the hunt stalls for 60 days with zero qualified conversations

Likely causes and responses:

| Cause | Response |
|---|---|
| ICP is too narrow | **Do not widen the ICP.** Broaden the channel list instead. |
| Outreach volume is too low | Measure actual send rate. If <10 touches/week, the hunt isn't real yet. |
| The wedge isn't resonating | Talk to 5 ex-prospects. Figure out what they ACTUALLY bought instead. Update the wedge wording. |
| Phase 0/dogfood not yet complete | The hunt cannot meaningfully start until we have a live sandbox to point prospects at. Delay is acceptable here. |

### If we get a qualified conversation but they walk away

- Write the loss down in a loss log (`docs/ANCHOR_HUNT_LOG.md` — to be created the first time this happens)
- Record: who, when, stage they walked, the reason in their words, what we would change
- Review every 10 losses. If the same reason appears 3+ times, the playbook needs a revision

### If the first anchor customer churns within 30 days

This is a platform failure, not a sales failure. Full post-mortem. Do not pursue a second anchor until the root cause is fixed. A churned first anchor is worse than no anchor at all — the story becomes "they tried it and it didn't work" and the next 10 conversations die before they start.

---

## Why this is the highest-leverage thing

- Every hour spent on the anchor hunt converts platform capability into market evidence
- Every hour not spent on the anchor hunt is an hour the platform drifts further from product-market fit
- The Tier 1 advantage lever framework puts this second only to the wedge lock itself
- A single anchor customer unblocks: pricing confidence, hiring confidence, Tier 2 design partners, SOC 2 evidence collection, and the founder brand cadence doctrine

Everything else on the roadmap is easier once this is done. Nothing else on the roadmap is meaningful until this is done.

---

## Doctrine

1. **One wedge, one ICP, one funnel.** No broadening until the first anchor is locked.
2. **Founder-led sales only.** No SDRs. No AEs. Craig does it. Claude drafts and supports.
3. **Say no fast.** Red flags are not obstacles to overcome. They are signals to move on.
4. **The first anchor is a case study investment, not a revenue line.** Revenue comes from the second anchor onward.
5. **The sandbox is the close.** If the prospect sees it working on their data, they close themselves.
6. **Polite tone rules apply.** See `docs/POSITIONING.md`. No naming competitors in outreach copy.

---

## Next actions (live checklist)

- [ ] Craig: confirm ICP wording (legal tech / health tech / fintech / regulated SaaS)
- [ ] Craig: confirm the $499/month anchor offer terms
- [ ] Craig: list 10 people in his network who might know a fit
- [ ] Claude: draft touch-1 outreach copy (3 variants) for Craig to pick from
- [ ] Claude: write the sandbox provisioning script (depends on Phase 0 live)
- [ ] Claude: write the "anchor customer promise" PDF template
- [ ] Both: review this playbook every 2 weeks until the first anchor is locked

---

**This is the top of the funnel. Nothing matters more. Build with that priority.**
