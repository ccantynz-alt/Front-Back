# Pre-Launch Legal Pages Audit

**Repository:** Crontech
**Branch:** `claude/setup-multi-repo-dev-BCwNQ`
**Date:** 2026-04-16
**Purpose:** Inventory the eight user-facing legal pages on the Crontech web app ahead of attorney review. Flag placeholders, pre-launch-specific adjustments, and items the attorney should review closely.

Companion document: `docs/legal/attorney-package.md` (the full attorney-review brief).

---

## Page inventory

### `/legal/privacy`

- **File:** `apps/web/src/routes/legal/privacy.tsx`
- **One-sentence summary:** Full GDPR/CCPA-aware privacy policy covering data collected, three-tier AI handling, sub-processors, retention, and user rights.
- **Sections present:** 13 sections — collection, use, client-side AI, third parties, security, GDPR rights, CCPA rights, international transfers, cookies, children, retention, changes, contact.
- **Needs attention:**
  - Physical address deferred to "available upon written request" (`privacy.tsx:151`). Attorney: confirm acceptable for GDPR Art. 13 controller identity and CCPA notice-at-collection requirements, or require posted address.
  - Retention schedule (`privacy.tsx:126-134`) must reconcile with the new retention table in the attorney package.
  - Sub-processor list names Turso, which has been dropped from the primary stack per CLAUDE.md §3 (Turso no longer appears as active). Attorney flag: list may overstate current processors.

---

### `/legal/terms`

- **File:** `apps/web/src/routes/legal/terms.tsx`
- **One-sentence summary:** Master Terms of Service binding users to Crontech Technologies, Inc., covering account, billing via Stripe, AI-output liability, Delaware-governed binding arbitration with class waiver, and 30-day opt-out.
- **Sections present:** 16 sections — acceptance, description, account, billing, AUP reference, IP, AI-specific terms, data/privacy, SLA reference, liability cap, indemnification, arbitration, termination, modifications, general provisions, contact.
- **Needs attention:**
  - Billing section (`terms.tsx:45-53`) assumes Stripe is live; pre-launch Stripe is disabled (commit `3169f2e`). Attorney: confirm language is acceptable as a forward-looking description or add a pre-launch carve-out.
  - Binding arbitration + class waiver (`terms.tsx:119-126`) — attorney should confirm enforceability across target jurisdictions and that the 30-day opt-out period + opt-out mechanism satisfies current case law.
  - Physical address again deferred (`terms.tsx:164`). Same flag as privacy.

---

### `/legal/cookies`

- **File:** `apps/web/src/routes/legal/cookies.tsx`
- **One-sentence summary:** Cookie policy listing 11 first-party cookies across essential/functional/analytics tiers with explicit "no third-party advertising, no cross-site tracking" commitments and EU opt-in model.
- **Sections present:** 11 sections — what cookies are, essential, functional, analytics, what we do NOT use, third parties, summary table, management, EU/GDPR consent, changes, contact.
- **Needs attention:**
  - Claims a consent banner exists and records consent (`cookies.tsx:116`). Attorney flag: confirm consent banner is actually deployed and recording before launch, or soften to "will deploy" language.
  - Stripe listed as active third-party cookie setter (`cookies.tsx:69`); during pre-launch with Stripe disabled this is not yet accurate. Low-risk but note.

---

### `/legal/sla`

- **File:** `apps/web/src/routes/legal/sla.tsx`
- **One-sentence summary:** Service Level Agreement committing 99.9% (Pro/Team) and 99.99% (Enterprise) monthly uptime with service-credit tiers and severity-based support response times.
- **Sections present:** 12 sections — scope, uptime commitment, calculation, exclusions, credits, claim process, monitoring, support response, scheduled maintenance, incident comms, limitations, contact.
- **Needs attention:**
  - **PRE-LAUNCH FLAG: uptime commitments are live but product is pre-launch.** Attorney should review whether to either (a) gate the SLA behind a "becomes effective on GA" clause, or (b) soften commitments to "post-launch targets" until infrastructure burn-in completes. Craig's requested "k-anonymity SLA addition" (see attorney package §4.4) is not yet present.
  - Enterprise 24/7 critical support (`sla.tsx:366`) is a staffing commitment — attorney should confirm staffing plan exists before SLA is relied upon by enterprise prospects.
  - Status page at `status.crontech.dev` is referenced multiple times (`sla.tsx:291, 388`). Attorney: confirm it is actually live before launch or the claim is deceptive.

---

### `/legal/acceptable-use`

- **File:** `apps/web/src/routes/legal/acceptable-use.tsx`
- **One-sentence summary:** AUP covering prohibited content (CSAM, malware, harassment, IP infringement, etc.), prohibited activities (reverse engineering, crypto mining on platform compute, DDoS), AI-specific rules, fair-use resource limits, and graduated enforcement with appeal process.
- **Sections present:** 6 sections — prohibited content, prohibited activities, AI-specific rules, resource limits, enforcement, contact.
- **Needs attention:**
  - AI-specific rules (§3) are strong — deepfake ban, no disinformation, no competitive-model training, no safety-control bypass, human review obligation. Attorney: confirm these are defensible and not overly broad under First Amendment / EU AI Act.
  - Appeals window is 30 days with 15-business-day response (`acceptable-use.tsx:322-332`). Attorney: confirm this aligns with EU DSA requirements for platforms of applicable size.

---

### `/legal/ai-disclosure`

- **File:** `apps/web/src/routes/legal/ai-disclosure.tsx`
- **One-sentence summary:** AI transparency page describing seven AI capabilities, the three-tier compute model (client/edge/cloud), data commitments ("we do not train on your content"), limitations, model provider disclosure, user controls, and compliance framework alignment (NIST AI RMF, EU AI Act).
- **Sections present:** 9 sections — commitment, how AI powers Crontech, three-tier compute, data & AI, limitations, models & providers, user controls, regulatory compliance, contact.
- **Needs attention:**
  - Claims "regular bias and safety audits" by independent assessors (`ai-disclosure.tsx:215`). Attorney flag: do not publish this without documented audit cadence + audit partner. Currently reads as aspirational; risks misrepresentation liability.
  - User controls (`ai-disclosure.tsx:185-210`) promise Settings-page features (disable AI, per-device disable, tier preferences, delete history, export) — attorney: confirm these controls ship before the page is live.
  - "We do NOT train on your content" commitment (`ai-disclosure.tsx:143`) must be backed by DPAs with OpenAI/Anthropic/Modal forbidding training. See attorney package §3.

---

### `/legal/beta-disclaimer`

- **File:** `apps/web/src/routes/legal/beta-disclaimer.tsx`
- **One-sentence summary:** Beta/early-access supplement to the Terms, flagging that features change without notice, AI is as-is, data may not migrate, pricing may change, and capping liability at the greater of 12-month fees or $50.
- **Sections present:** 11 sections — beta status, feature changes, AI features disclaimer, independent verification, service interruptions, data during beta, pricing, acceptance, relationship to ToS, feedback license, contact.
- **Needs attention:**
  - Liability cap here ($50) is lower than the main Terms ($100) — attorney: confirm the lower cap is enforceable and that users receive clear notice of the beta-specific cap at signup.
  - Feedback license (`beta-disclaimer.tsx:90-92`) is "worldwide, perpetual, irrevocable, royalty-free" — broad. Attorney: confirm acceptable for enterprise prospects.

---

### `/legal/dmca`

- **File:** `apps/web/src/routes/legal/dmca.tsx`
- **One-sentence summary:** DMCA 512 takedown and counter-notice policy with repeat-infringer language, AI-generated-content notice, safe harbor statement, and designated-agent contact.
- **Sections present:** 11 sections — commitment, takedown notice, processing, counter-notice, repeat infringer, AI-generated content, designated agent, safe harbor, misrepresentation warning, modifications, contact.
- **Needs attention:**
  - **PLACEHOLDER-ADJACENT:** Claims the designated agent "is registered with the U.S. Copyright Office in accordance with 17 U.S.C. §512(c)(2)" (`dmca.tsx:310-313`). Attorney + ops flag: verify registration is actually filed with the USCO DMCA Designated Agent Directory before launch. If not registered, this statement is false and forfeits safe harbor.
  - Only an email contact is provided (`dmca.tsx:303`); §512(c)(2) registration requires a physical mailing address. Attorney flag: an address must exist for the filing even if not prominently posted here.

---

## Cross-repo note: Gluecron has zero legal pages

A separate pre-launch legal-pages audit was performed on the Gluecron repository and is archived at `/home/user/Gluecron.com/docs/legal-audit.md`. Summary of that audit's findings:

- **Zero user-facing legal pages exist in the Gluecron codebase.** No `/legal/*` routes, no Terms, no Privacy, no Cookie, no DMCA, no AUP.
- The Gluecron footer currently links to nothing legal.
- Two defensible postures were identified for attorney decision:
  - **Scenario A** — Gluecron rides under the Crontech umbrella Terms/Privacy/AUP/DMCA by reference. Requires Crontech pages to explicitly name Gluecron and its data flows (git clone/push logs, SSH key retention, webhook payloads, AI ingestion of hosted code) as in-scope.
  - **Scenario B** — Gluecron ships independent legal pages before public launch. Requires standalone Terms/Privacy/AUP/DMCA drafted to Gluecron's specific data model.
- This is one of the explicit questions raised in `attorney-package.md` §7.

The Gluecron audit file itself lives outside this repo; reproducing it here would duplicate content. Reference the path above when briefing the attorney.

---

## Summary of attorney-review flags (prioritized)

1. **HIGH — DMCA designated agent:** confirm USCO registration is filed, obtain the physical address, or soften/remove the "registered" claim before launch (`dmca.tsx:310-313`).
2. **HIGH — AI audit claim:** either commission an independent AI audit and document cadence, or rewrite §8 of ai-disclosure to be forward-looking (`ai-disclosure.tsx:215`).
3. **HIGH — SLA pre-launch posture:** decide whether SLA commitments are effective on GA only, or adjust uptime percentages to reflect burn-in period.
4. **MEDIUM — Stripe references:** verify billing language is acceptable given Stripe is currently disabled (`terms.tsx:45-53`, `cookies.tsx:69`).
5. **MEDIUM — Sub-processor list in privacy:** reconcile with actual current processors (Turso listed, may be stale).
6. **MEDIUM — Physical address:** decide posting posture across Terms, Privacy, and DMCA contact blocks.
7. **LOW — Liability cap differential:** confirm $50 beta cap enforceability vs. $100 main cap.
8. **LOW — Consent banner and status-page claims:** ensure referenced surfaces (`status.crontech.dev`, cookie banner, Settings AI controls) ship before pages go live.

---

*Prepared to support the attorney-review package at `docs/legal/attorney-package.md`.*
