# Attorney Review Package — Crontech, GateTest, Gluecron

**Prepared:** 2026-04-16
**Repository:** Crontech (pre-launch)
**Companion doc:** `docs/legal/pre-launch-audit.md` (page-by-page inventory)

> All copy drafts in this document are clearly labeled. They represent product intent and have not been reviewed by counsel. Please mark them up directly.

---

## 1. Executive Summary

Crontech Technologies, Inc. is preparing the coordinated pre-launch of three related products: **Crontech**, an AI-native full-stack developer platform (this repository); **GateTest**, a code-quality and security gate that runs as a GitHub App on pull requests; and **Gluecron**, a VS Code and CLI extension that ships AI-assisted code intelligence. The three products share an identity, a billing structure, and a coordinated signal bus, but they are **not coupled at the code or data level** — each is deployable independently.

All three products are currently in a pre-launch posture. A site-wide banner is live (commit `72af5c4`) informing visitors that the service is not yet production. Stripe billing procedures are disabled at the tRPC layer (commit `3169f2e`) so no payment can currently be taken. Search indexing is suppressed and no public waitlist has been published.

Counsel is being asked to review (a) the eight existing legal pages inventoried in `docs/legal/pre-launch-audit.md`; (b) five new copy drafts in §4 of this document that must be reviewed before the products go live; (c) a jurisdictional and compliance-posture gap analysis in §§5–6; and (d) a list of explicit questions in §7. A pre-launch safety-net summary is in §8.

---

## 2. The Three Products

**Crontech** is the flagship platform — an AI-native full-stack developer suite for solo developers, teams, and enterprises building AI-assisted websites and AI-assisted video products. Customers subscribe to Free, Pro, Team, or Enterprise tiers. Billing runs through Stripe (currently disabled pre-launch). Customer-facing legal surface is the eight pages audited in the companion doc. Crontech stores customer code, user-uploaded content, AI prompts, and usage telemetry.

**GateTest** is a code-quality, security, and fake-fix detection service that runs as an external GitHub App (`GateTestHQ`) installed on customer repositories. It scans pull requests across 24 modules (security, accessibility, performance, links, fake-fix detector, more). GateTest receives repository webhooks from GitHub, scans the PR diff, and posts status checks plus line-level findings. Its customers are primarily engineering teams. Billing is independent from Crontech. GateTest's cross-tenant "fix-pattern" learning (see §4.2) is the novel data flow that needs attorney review.

**Gluecron** is a VS Code extension (with a companion CLI) that provides AI-native code intelligence — completion, refactor suggestions, repo-level Q&A. It installs locally and communicates with a Gluecron backend for inference and telemetry. Customers install via the VS Code Marketplace or a one-line CLI installer. Gluecron has **zero legal pages today** (see `/home/user/Gluecron.com/docs/legal-audit.md`); §7 asks whether Gluecron should ride under the Crontech umbrella or ship standalone pages.

Coupling between the three products is **HTTP-only over a signal bus**. No shared database, no shared auth state, no shared bundle. They can be rebranded or spun off individually. Billing is fully separated — a customer can have any combination of the three subscriptions without cross-contamination.

---

## 3. Data Processors

Every third-party service that touches customer data is listed below. DPAs are either in place, in draft, or flagged as required before the service is re-enabled.

| Service | What it sees | DPA needed? |
|---|---|---|
| Anthropic (Claude API) | Code snippets and prompts during AI review / completion | Yes |
| OpenAI (via AI SDK) | AI inference prompts and responses | Yes |
| Stripe | PRE-LAUNCH — DISABLED (will process payment methods, billing address, tax jurisdiction on re-enable) | Yes (on re-enable) |
| GitHub | Repository metadata, PR diffs, installation events via GitHub App | Yes |
| Neon | Serverless Postgres — primary relational data at rest | Yes |
| Cloudflare | CDN traffic, edge compute, DDoS shield, Workers logs | Yes |
| Modal | GPU inference inputs (heavy workloads only) | Yes |
| Resend | Transactional email content and recipient lists | Yes |
| Qdrant | Vector embeddings of user content for semantic search and RAG | Yes |

**Attorney flag:** Privacy policy (`apps/web/src/routes/legal/privacy.tsx:55`) lists Turso as a sub-processor. Turso is no longer part of the active stack per CLAUDE.md §3 and should likely be removed from the published list. Please confirm the processor list in the privacy policy before publish.

---

## 4. New Copy Drafts — Requires Attorney Review

Each draft below is marked with the required header and is written in plain English. Legalese will be added by counsel on review.

### 4.1 Telemetry Install Modal (Gluecron VS Code extension first-run)

> **DRAFT — requires attorney review.**
>
> Gluecron collects telemetry so we can make it better. Here's exactly what happens.
>
> **Always on (metadata only).** Event counts, latencies, and the language of the file in focus. Numbers and labels, nothing more.
>
> **Opt-in per repository.** Only if you flip the switch: file-path hashes and short snippets of the suggestions Gluecron generates. Off by default. You can toggle any repo at any time.
>
> **Never captured.** Keystrokes, file contents, secrets, and clipboard data never leave your machine.
>
> **Retention.** Raw telemetry is kept 90 days. Aggregates are kept indefinitely, anonymized, and k-floored so no single user can be re-identified.
>
> **Revoke.** Go to `/settings/telemetry` to turn everything off or download what we have.

### 4.2 Fix-Pattern Privacy Insert (GateTest privacy policy addition)

> **DRAFT — requires attorney review.**
>
> When GateTest detects a fix for a known issue in a private repository, we strip the code before any cross-tenant learning happens. What crosses tenants is an abstracted pattern identifier, the language, and the severity level — never the raw code. Your private code stays inside the tenant that owns it. The learned pattern improves detection for everyone; the code that inspired it does not.

### 4.3 Prompt-Retention Opt-In (Crontech AI builder)

> **DRAFT — requires attorney review.**
>
> Prompt retention is **off by default**. Turn it on only if you want the AI builder to give you personalized suggestions and a prompt history. Opt-in scope is per session — it does not silently carry across sessions. Revoke any time from `/settings/ai`; we purge retained prompts within 30 days of revocation.

### 4.4 K-Anonymity SLA Addition

> **DRAFT — requires attorney review.**
>
> Aggregate data crosses tenant boundaries only when the aggregation pool meets a minimum size. For regular tenants, the minimum is **k = 20**. For legal-vertical tenants (law firms and in-house legal teams), the minimum is **k = 50**. Neither tier's aggregated data leaves its pool — legal-vertical aggregates are never mixed with regular aggregates.

### 4.5 Retention Schedule

| Data type | Retention |
|---|---|
| Scan results (free tier) | 30 days |
| Scan results (paid tier) | Indefinite while account is active |
| Telemetry — raw | 90 days |
| Telemetry — aggregates | Indefinite, anonymized, k-floored |
| Signal-bus events | 1 year |
| Session tokens | 30 days past last use |
| Deleted-account data | Purged within 30 days of the deletion request |

**Reconciliation flag:** the current privacy policy (`apps/web/src/routes/legal/privacy.tsx:126-134`) has a different retention schedule (90 days identifiable usage logs, 1 year security/audit, 7 years payment records, account data + 30 days). Counsel should decide whether to replace the privacy-policy schedule with this table, or keep the privacy-policy schedule and treat this table as a product-facing summary.

---

## 5. Jurisdictional Considerations

- **GDPR (EEA/UK) — applicability: likely.** The privacy policy already claims GDPR compliance, lists a DPO email, and references SCCs; before launch we must confirm the DPO and a posted controller address satisfy Art. 13 notice requirements.
- **CCPA/CPRA (California) — applicability: likely.** We intend to offer the service to California residents and will cross the $25M revenue / 100K consumer thresholds if launch succeeds; the privacy policy already contains CCPA rights language.
- **HIPAA — applicability: conditional.** Not applicable to the general Crontech, GateTest, or Gluecron user base. It becomes applicable the moment a legal-vertical or healthcare-vertical tenant processes PHI through the platform. Counsel should confirm whether a BAA template is required before those tenants sign.
- **SOC 2 — applicability: not yet applicable as a certification, but procurement pressure is imminent.** AmLaw 200 firms and enterprise prospects will ask for a Type II report; CLAUDE.md §5A.5 already flags it as mandatory. Counsel: advise on whether to start the audit pipeline pre-launch (see §7).

**Legal-vertical tenants may expect a HIPAA BAA even when they are not processing PHI**, because their clients may. Whether Crontech is willing to sign a BAA — and under what conditions — is a strategic decision counsel should weigh in on before the first legal-vertical prospect asks.

---

## 6. Compliance Posture Check

`CLAUDE.md` §5A claims a high-stakes compliance posture: court admissibility under FRE 901 and 902 (SHA-256 hashing, RFC 3161 timestamps, hash-chained audit logs), FIPS 140-3 validated cryptographic modules for encryption in transit / at rest / in use, and WORM storage for evidence artifacts. These claims support a legal-vertical go-to-market. Counsel should independently verify that the **current implementation** (not the aspirational architecture doc) actually delivers these properties before any marketing copy, SOC 2 attestation, or customer contract asserts them. If the implementation is partial, counsel should advise whether the compliance language must be softened to forward-looking intent until the gaps close.

---

## 7. Questions for the Attorney

1. Is the pre-launch banner language acceptable as placed? Does it need a stronger "no contract formed" statement?
2. Which U.S. states or non-U.S. countries, if any, should we geo-block at signup before launch (e.g., OFAC-sanctioned jurisdictions, states with restrictive AI regulations)?
3. Is the Terms of Service binding-arbitration + class-action-waiver clause (`apps/web/src/routes/legal/terms.tsx:119-126`) defensible in California, Massachusetts, and the EU, and is the 30-day written-notice opt-out mechanism sufficient?
4. Do we need a HIPAA BAA template ready for day-one legal-vertical conversations, or is it acceptable to defer until a tenant requests it?
5. Should the SOC 2 Type II pipeline start pre-launch (longer runway, better enterprise story) or post-launch (less cost pre-revenue, risk of a stall in enterprise sales)?
6. For the pre-launch waitlist once published, what CAN-SPAM and GDPR-compliance checkpoints must the signup form and launch email sequence satisfy?
7. Is our DMCA designated agent actually registered with the U.S. Copyright Office DMCA Designated Agent Directory? If not, we must file before the `/legal/dmca` claim at `apps/web/src/routes/legal/dmca.tsx:310-313` is live, or safe-harbor protection does not attach.
8. Does Gluecron need its own standalone legal pages (Terms, Privacy, AUP, DMCA) before public launch, or can it ride under Crontech Technologies, Inc.'s umbrella Terms and Privacy Policy via an explicit naming-and-scope clause?
9. The AI disclosure page (`apps/web/src/routes/legal/ai-disclosure.tsx:215`) claims "regular bias and safety audits" by independent assessors. If no audit partner is retained, this statement is misleading. Should we remove the claim, soften to "planned," or commission the audit?
10. The beta disclaimer caps liability at $50 (`apps/web/src/routes/legal/beta-disclaimer.tsx:76`); the main Terms cap at $100. Is a lower beta-tier cap enforceable against paid beta users, and is the notice of that lower cap sufficient?
11. The Stripe billing language in the Terms (`apps/web/src/routes/legal/terms.tsx:45-53`) reads as if billing is active. Should we carve out a "pre-launch — no charges will be taken" rider until Stripe is re-enabled?
12. Does the cross-tenant fix-pattern flow described in §4.2 satisfy GDPR "data minimization" and Art. 28 processor obligations, and what notice must GateTest customers see before their first scan?

---

## 8. Pre-Launch Safety Net

Current controls confirm the pre-launch posture:

- **Stripe billing disabled** at the tRPC layer — no payment method can be captured and no charge can be attempted (commit `3169f2e`).
- **Pre-launch banner live** across all routes informing visitors the service is not production (commit `72af5c4`).
- **Search indexing suppressed** — `robots.txt` and per-page meta prevent indexing; this must stay in place until launch.
- **No public waitlist yet** — no email addresses have been collected, so no CAN-SPAM / GDPR-consent footprint exists at this time. When the waitlist ships, §7 Q6 applies.

---

## 9. Five Flagged Issues — Status

Each of the five pre-launch blockers previously flagged in §7 has been addressed in draft form. All edits are labeled "DRAFT — requires attorney review." Counsel is asked to confirm enforceability, tune legalese, and flag any remaining exposure.

| # | Issue | File | Change |
|---|---|---|---|
| 1 | DMCA registration claim | `apps/web/src/routes/legal/dmca.tsx` (§7) | Replaced the false "registered with USCO" claim with a "we intend to register" statement; flagged as DRAFT pending actual USCO registration before accepting paid customer uploads. |
| 2 | Sub-processor list mismatch | `apps/web/src/routes/legal/privacy.tsx` (§4) | Updated sub-processor list to match the stack per CLAUDE.md §3: Turso (primary), Neon, Qdrant, Cloudflare, Stripe (disabled pre-launch), Anthropic, OpenAI, Modal, Fly.io, Resend. Turso retained because it is in active use. |
| 3 | AI audit language | `apps/web/src/routes/legal/ai-disclosure.tsx` (Regulatory Compliance) | Replaced "regular bias and safety audits" assertion with "we intend to engage independent AI safety auditors prior to general availability." Marked DRAFT pending attorney review and audit-partner retention. |
| 4 | $50 vs $100 liability mismatch | `apps/web/src/routes/legal/beta-disclaimer.tsx` (§§8, 12) | Beta cap explicitly stated as a pre-launch limit below the main Terms' $100 cap. New §12 added: "In case of conflict between this Beta Disclaimer and the Terms of Service during pre-launch phase, the Beta Disclaimer's lower cap controls." DRAFT — attorney sign-off on enforceability. |
| 5 | Gluecron legal stance | `apps/web/src/routes/legal/privacy.tsx` (§14) | New §14 added stating Crontech, GateTest, and Gluecron are separately operated; Crontech Privacy Policy governs Crontech only; Gluecron use is governed by its own policy (link placeholder). DRAFT — pending Gluecron legal page creation. |

---

## 10. Aggressive Protection Posture — Drafted Clauses

Authorized by Craig on 2026-04-16: "most aggressive legal compliance and protection possible." The following protection clauses have been drafted across the eight legal pages. Every clause is labeled "DRAFT — requires attorney review" and phrased as "we intend to" rather than "we will." Counsel is asked to confirm enforceability, tune legalese, and advise on any jurisdictional carve-outs.

Existing protections (pre-existing in `terms.tsx` Sections 5–15, `dmca.tsx`, `acceptable-use.tsx`, and elsewhere) have been reaffirmed and cross-referenced from the new aggressive-protection sections. No existing protection has been weakened. Additive only.

### Clause-by-page matrix

| Clause | terms | privacy | cookies | sla | acceptable-use | ai-disclosure | beta-disclaimer | dmca |
|---|---|---|---|---|---|---|---|---|
| Binding individual arbitration (AAA/JAMS) | §17.1 existing+strengthened | §15 reaffirms | §12 reaffirms | §13 reaffirms | §7 reaffirms | §8.5 reaffirms | §13 new | §7.5 reaffirms |
| Class-action waiver | §17.2 existing+strengthened | §15 reaffirms | §12 reaffirms | §13 reaffirms | §7 reaffirms | §8.5 reaffirms | §13 new | §7.5 reaffirms |
| 30-day arbitration opt-out | §17.3 existing+strengthened | §15 reaffirms | §12 reaffirms | §13 reaffirms | §7 reaffirms | §8.5 reaffirms | §13 new | §7.5 reaffirms |
| Small-claims carve-out | §17.4 existing+strengthened | §15 reaffirms | §12 reaffirms | §13 reaffirms | §7 reaffirms | §8.5 reaffirms | §13 new | §7.5 reaffirms |
| Liability cap ($100 / 12 mo fees, $50 beta) | §17.5 reaffirms §10 | §15 reaffirms | §12 reaffirms | §13 reaffirms | §7 reaffirms | §8.5 reaffirms | §§8, 12, 13 new | §7.5 reaffirms |
| No consequential damages | §17.6 reaffirms §10 | §15 reaffirms | §12 reaffirms | §13 reaffirms | §7 reaffirms | §8.5 reaffirms | §13 new | §7.5 reaffirms |
| AS-IS / AS-AVAILABLE | §17.7 reaffirms §10 | §15 reaffirms | §12 reaffirms | §13 reaffirms | §7 reaffirms | §8.5 reaffirms | §13 new | §7.5 reaffirms |
| AI output disclaimer (informational, not professional advice) | §17.8 reaffirms §7 | §15 reaffirms | §12 reaffirms | §13 reaffirms | §7 reaffirms | §8.5 reaffirms | §13 new | §7.5 reaffirms |
| Customer indemnification | §17.9 reaffirms §11 | §15 reaffirms | §12 reaffirms | §13 reaffirms | §7 reaffirms | §8.5 reaffirms | §13 new | §7.5 reaffirms |
| Unilateral suspension / termination | §17.10 reaffirms §13 | §15 reaffirms | §12 reaffirms | §13 reaffirms | §7 reaffirms | §8.5 reaffirms | §13 new | §7.5 reaffirms |
| Reverse engineering prohibited | §17.11 new | §15 reaffirms | §12 reaffirms | §13 reaffirms | §7 reaffirms (AUP §2.2) | §8.5 reaffirms | §13 new | §7.5 reaffirms |
| Force majeure | §17.12 reaffirms §15 | §15 reaffirms | §12 reaffirms | §13 reaffirms | §7 reaffirms | §8.5 reaffirms | §13 new | §7.5 reaffirms |
| Severability + entire agreement | §17.13 reaffirms §15 | §15 reaffirms | §12 reaffirms | §13 reaffirms | §7 reaffirms | §8.5 reaffirms | §13 new | §7.5 reaffirms |
| Governing law: New Zealand | §17.14 new (supersedes Delaware per §12 for international enforcement) | §15 new | §12 new | §13 new | §7 new | §8.5 new | §13 new | §7.5 reaffirms |
| Export controls / US sanctions | §17.15 new | §15 new | §12 reaffirms | §13 reaffirms | §7 reaffirms (AUP §1.1) | §8.5 reaffirms | §13 new | §7.5 reaffirms |
| Age requirement: 18+ | §17.16 new (supersedes age-13 platform use while retaining child-privacy statutory text) | §15 new | §12 new | §13 new | §7 new | §8.5 new | §13 new | §7.5 reaffirms |
| 30-day notice for terms changes | §17.17 reaffirms §14 | §15 reaffirms | §12 reaffirms | §13 reaffirms | §7 reaffirms | §8.5 reaffirms | §13 new | §7.5 reaffirms |

### Attorney review items for §10

1. **Governing law switch (Delaware → New Zealand)** — §17.14 of the Terms of Service now identifies New Zealand as the governing-law jurisdiction, inferred from the solo operator's handle (`ccantynz`) and NZ-brand-safe posture. The Delaware language in §12 is retained as an internal-US fallback. Counsel to confirm enforceability against US, EU, and UK consumers; advise on US-specific carve-outs where NZ law cannot validly govern (consumer protection, California class-action rules, Massachusetts 93A, EU mandatory law).
2. **Age-18 requirement layered over age-13 child-privacy language** — §17.16 of the Terms states the platform's operational age requirement is 18+, while retaining the existing age-13 / age-16-EEA language for child-privacy statutory obligations. Counsel to confirm this layered approach does not create enforceability gaps under COPPA, GDPR-K, or UK Children's Code.
3. **Beta $50 cap conflict rule** — §12 of the Beta Disclaimer explicitly states that where Beta Terms and main Terms conflict, the lower $50 cap controls. Counsel to confirm this is enforceable against paid beta users and that the notice of the lower cap is sufficient.
4. **Reverse-engineering prohibition** — added to all eight pages. Counsel to confirm enforceability in jurisdictions that permit reverse engineering for interoperability (EU Software Directive Art. 6, Australia Copyright Act s47D).
5. **Export controls / US sanctions representation** — added to all eight pages. Counsel to advise whether the user representation alone is sufficient or whether signup-time geo-blocking of OFAC-comprehensive-sanctioned jurisdictions is also required (see §7 Q2).
6. **Class-action waiver severability-at-Crontech's-election** — §17.2 of the Terms. Counsel to confirm this unilateral-severability form is enforceable, or whether mutual severability is safer.
7. **Arbitrator decides arbitrability** — §17.1 of the Terms gives the arbitrator (not a court) authority over enforceability, arbitrability, and scope. Counsel to confirm this delegation clause is enforceable post-*Henry Schein* and *Coinbase v. Bielski*.
8. **Gluecron scope statement in Crontech Privacy Policy** — §14 of the privacy policy now explicitly disclaims that Crontech's Privacy Policy governs Gluecron. Link placeholder pending. Counsel to advise whether Gluecron needs standalone legal pages before any Gluecron installer or marketing surface goes live (see §7 Q8).
9. **AI audit language softened to "intent"** — the AI disclosure page now states audits have "not yet commenced" and "we do not currently have a contracted external audit partner." Counsel to confirm this wording fully cures the prior misrepresentation exposure.
10. **DMCA designated-agent softened to "intent"** — DMCA §7 now states registration is intended prior to accepting paid customer uploads. Counsel to confirm the safe-harbor claim is withdrawn for pre-registration use and to advise on the actual USCO filing timeline.

### Files modified in this sprint

- `apps/web/src/routes/legal/terms.tsx` — §17 added (aggressive protection consolidation, governing-law-NZ override, age 18+, export controls, reverse engineering)
- `apps/web/src/routes/legal/privacy.tsx` — sub-processor list corrected (§4); §14 added (Gluecron / GateTest scope); §15 added (aggressive protections)
- `apps/web/src/routes/legal/cookies.tsx` — §12 added (aggressive protections)
- `apps/web/src/routes/legal/sla.tsx` — §13 added (aggressive protections, service-credits-are-exclusive-remedy reaffirmed)
- `apps/web/src/routes/legal/acceptable-use.tsx` — §7 added (aggressive protections, enforcement-rights reaffirmed)
- `apps/web/src/routes/legal/ai-disclosure.tsx` — AI-audits language corrected; §8.5 added (aggressive protections, model-provider force majeure)
- `apps/web/src/routes/legal/beta-disclaimer.tsx` — §§8, 12, 13 updated/added (beta $50 cap explicit, conflict rule, beta aggressive protections)
- `apps/web/src/routes/legal/dmca.tsx` — designated-agent claim corrected (§7); §7.5 added (aggressive protections)

---

*End of package. Line-item replies welcome — all drafts above can be edited in place.*
