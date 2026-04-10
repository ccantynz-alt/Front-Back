# Week 4 — AI-Immigration-Compliance

> **Priority:** P0
> **Target:** AI-Immigration-Compliance vertical
> **Why this one:** First compliance-heavy workload after Astra. Immigration law is one of the highest-stakes compliance verticals — document integrity, chain of custody, and audit trails are non-negotiable. If Crontech can host this, it can host legal tech.

## Pre-flight

- [ ] Week 3 (Astra) complete and stable for ≥72h
- [ ] Audit log substrate proven in production (Astra has been running clean)
- [ ] Document storage backed by R2 with Object Lock
- [ ] NZ estate/legal lawyer engaged (not blocking but useful for compliance review)
- [ ] Second account has finished the AI-Immigration-Compliance site on its current stack (per tonight's parallel plan)

## Day 1 — Inventory

- [ ] Current site stack (framework, hosting, DB)
- [ ] User/client count
- [ ] Document inventory (what types: visas, applications, supporting docs, checklists)
- [ ] Compliance requirements for the jurisdictions served (NZ? Aus? US? EU?)
- [ ] AI workload profile: what models? What prompts? What privacy guarantees?
- [ ] Form catalog: every intake form, every client questionnaire
- [ ] Integration with government portals (INZ, USCIS, etc.)?
- [ ] Payment flow (fees, escrow, trust accounting)

## Day 2 — Compliance scaffold

Immigration is legally sensitive. The data model requires:

- [ ] Client records with full identity doc storage (passport, visa history)
- [ ] Matter/case records with status workflow
- [ ] Document records with:
  - SHA-256 hash at upload
  - Original metadata preserved
  - WORM storage in R2
  - Audit trail for every access
  - Chain of custody from upload through submission
- [ ] Submission records (when a document was filed with a government agency)
- [ ] Communication logs (every email, every client meeting)

Schema decision: Neon (complex relational data, full text search on case notes).

## Day 3 — AI pipeline

This vertical is "AI-Immigration-**Compliance**" — the AI is central, but the compliance is the moat.

- [ ] Port the AI workflows from the current site
- [ ] Every AI inference logged: prompt, model, response, timestamp, cost
- [ ] Every AI-assisted decision flagged as "AI-assisted" in the audit log (mandatory for legal tech)
- [ ] Client consent recorded before any AI processes their data
- [ ] PII redaction before prompts hit external LLMs (or use client-side WebGPU inference — zero data exfiltration)
- [ ] Model versioning: every output records which model version produced it

**Recommendation:** prefer client-side inference (WebGPU + WebLLM) for anything involving PII. The three-tier compute model exists for exactly this reason.

## Day 4 — Port pages

- [ ] Public site (landing, about, services, pricing, contact)
- [ ] Client portal (login, case status, document upload, messaging)
- [ ] Admin / case worker interface
- [ ] Document viewer (PDF, images, with annotation)
- [ ] Forms & intake workflows
- [ ] AI-assisted features (case analysis, document classification, form filling)
- [ ] Billing integration (if different from the Crontech shared billing)

## Day 5 — Data migration

- [ ] Dump old DB
- [ ] Load into Neon
- [ ] Bulk import documents to R2 with hash verification
- [ ] Backfill audit log for every historical record (marked as "imported")
- [ ] Verify every document is retrievable and matches hash
- [ ] Sample 10 cases end-to-end: every document, every status, every comm log preserved

## Day 6 — Cutover

- [ ] Deploy to `immigration-new.crontech.nz`
- [ ] Full smoke test with one live case (with client consent)
- [ ] Lower TTL on DNS
- [ ] Cutover during a scheduled maintenance window (announced to clients)
- [ ] 24h intensive monitoring

## Day 7 — Decommission

- [ ] 14-day buffer before old stack decommission
- [ ] Full archive of old docs + DB to WORM R2
- [ ] Retention: 7 years minimum (standard for legal records)
- [ ] Client notification: "We've moved to our compliance-native platform. Here's what's new."
- [ ] Flip `week-4-ai-immigration` in progress.json
- [ ] Public case study: "How we run our immigration practice on Crontech"

## Exit criteria

- [ ] Immigration site serving from Crontech
- [ ] Every historical document accessible and hash-verified
- [ ] Audit log chain intact for every client and every case
- [ ] AI workflows running (prefer client-side for PII)
- [ ] Client portal working end-to-end
- [ ] 0 dead links, 0 dead buttons
- [ ] OTel traces for every request
- [ ] `/admin/progress` shows week-4 completed

## Rollback plan

Rollback triggers:

- Any document becomes inaccessible
- Any case status is wrong after migration
- Client portal login broken
- AI pipeline leaks PII (STOP EVERYTHING)

Rollback procedure:

1. DNS flip to old stack
2. Document what failed in the audit log
3. Client comms within 1 hour of rollback
4. Root-cause post-mortem before retry

## Risks unique to immigration

- **Regulated data.** Even the schema is subject to privacy law in multiple jurisdictions.
- **Client trust.** Immigration clients are often at stressful life inflection points. Any downtime is magnified.
- **Government integrations.** Any dependency on INZ/USCIS portals adds fragility. Plan for their downtime.
- **Document integrity.** A single corrupted file can kill a visa application.
- **Bilingual content.** Likely serves clients in English + one other language. Test both.

## Compliance dividend

After Week 4:

- Crontech has proven it can host an immigration practice
- The audit log substrate has proven it can carry legal-grade chain of custody
- The WORM storage layer has proven it can preserve sensitive client data
- The AI pipeline has proven it can handle PII without leaking

This is the foundation for every future legal tech, health tech, and fintech customer.
