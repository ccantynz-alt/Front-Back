# Week 3 — Astra + CFO Engine (Accounting Vertical)

> **Priority:** P0
> **Target:** Astra accounting platform
> **Why this one:** The accounting vertical is Crontech's compliance-wedge bullseye. Migrating Astra gives us our first compliance-heavy, ledger-bearing workload. It also lets us launch the CFO engine as an internal tool before productizing.

## Pre-flight

- [ ] Week 2 (emailed) complete and stable for ≥72h
- [ ] Xero integration tested in Crontech (using `XeroAPI/xero-node` SDK already in tracked repos)
- [ ] `@crontech/audit-log` OSS library merged into main (hash-chained audit trail required for compliance)
- [ ] NZ chartered accountant engaged (blocks any production ledger work — legal review needed)
- [ ] Decision made: does Astra ledger data live in Turso (SQLite) or Neon (Postgres)?
  - **Recommendation:** Neon. Ledger workloads want full Postgres (transactions, advanced indexes, row-level locking). Save Turso for the read-heavy UI layer.

## Day 1 — Inventory

- [ ] Astra schema dump (tables, views, functions, triggers, indexes)
- [ ] Chart of accounts data
- [ ] User/tenant count
- [ ] Active integrations: Xero? MYOB? QuickBooks? Stripe? Bank feeds?
- [ ] Compliance obligations: GST returns? PAYE? What tax jurisdictions?
- [ ] Current audit log implementation (if any)
- [ ] Scheduled jobs (invoice reminders, reconciliation batch, etc.)
- [ ] Document templates (PDF invoices, statements)

## Day 2 — Scaffold

- [ ] Branch `migration/week-3-astra`
- [ ] `apps/astra/` workspace
- [ ] Neon database provisioned (`crontech-astra-prod`)
- [ ] Drizzle schema ported from source
- [ ] Audit log wired in at every write path (mandatory — this is the whole compliance wedge)
- [ ] RFC 3161 trusted timestamps for every ledger entry
- [ ] Env vars:
  - `ASTRA_NEON_URL`
  - `ASTRA_STRIPE_SECRET_KEY`
  - `ASTRA_XERO_CLIENT_ID`
  - `ASTRA_XERO_CLIENT_SECRET`
  - `ASTRA_AUDIT_SIGNING_KEY` (HSM-backed in prod)

## Day 3 — Audit log foundation

This is the differentiator. Every ledger write goes through the audit log:

- [ ] Integrate `@crontech/audit-log` into Astra's write path
- [ ] Every transaction, every approval, every reconciliation gets:
  - SHA-256 hash
  - RFC 3161 timestamp from trusted TSA
  - Previous entry hash (chain)
  - Actor ID + session
  - Full before/after diff
  - Signature
- [ ] WORM storage configured (R2 Object Lock — Compliance Mode)
- [ ] Audit log UI: admins can view the full chain for any record
- [ ] Export to PDF with FRE 902(14) certification for legal use

## Day 4 — Data migration

- [ ] Freeze writes on old Astra (maintenance mode)
- [ ] Dump old DB
- [ ] Load into Neon
- [ ] Backfill audit log: every existing record gets an "imported" audit entry with source hash
- [ ] Verify row counts, balances, and ledger integrity
- [ ] Run full-book trial balance on both old and new — they must match to the cent
- [ ] Re-enable writes on old (briefly)

## Day 5 — CFO Engine

The internal tool that becomes a product later:

- [ ] `/admin/cfo/` dashboard: live P&L, cash flow, runway, burn rate
- [ ] Weekly CFO report generator (markdown → PDF → email to Craig)
- [ ] Monthly CFO report generator (full financial review)
- [ ] Quarterly strategic report generator (aligned with CFO templates)
- [ ] Data sources: Astra ledger + Stripe + bank feeds
- [ ] Auto-delivery to Craig's inbox on schedule

**This is the seed of a future SaaS product — treat the code quality accordingly.**

## Day 6 — Parallel run + cutover

- [ ] Deploy to `astra-new.crontech.nz`
- [ ] Run parallel ledgers for 3 days: every transaction on old Astra replicates to new
- [ ] Daily balance check: old vs new must match
- [ ] Once 3 days of clean parallel ops, flip DNS
- [ ] Monitor for 48h with extreme paranoia

## Day 7 — Decommission (with extra caution)

- [ ] 14-day buffer before decommission (accounting data is sacred)
- [ ] Full backup of old DB archived to R2 WORM bucket
- [ ] Backup retained for 7 years minimum (statutory requirement for NZ financial records)
- [ ] Flip `week-3-astra` in progress.json to completed
- [ ] Flip `cfo-engine` entry to in_progress (productization is a separate track)

## Exit criteria

- [ ] Astra serving from Crontech
- [ ] Every historical ledger entry preserved exactly (penny-perfect)
- [ ] Audit log chain verifies without gaps
- [ ] Xero integration working (test sync: create invoice in Astra, confirm in Xero)
- [ ] CFO engine producing daily dashboard, weekly report, monthly report
- [ ] Full backup of old DB archived to WORM
- [ ] NZ accountant has reviewed the migration and signed off
- [ ] `/admin/progress` shows week-3 completed

## Rollback plan

**Accounting data is not something we can gamble with.** If ANY of the following happen, roll back immediately:

- Trial balance doesn't match old system
- Any ledger entry missing
- Audit chain break
- Xero sync failure
- Any user reports missing or incorrect data

Rollback procedure:

1. DNS flip back to old Astra
2. Any new transactions made on Crontech side get exported + manually re-entered in old system
3. Full post-mortem before retry
4. NZ accountant review before second attempt

## Risks unique to Astra

- **Financial data is legally sensitive.** Mistakes are not just embarrassing, they can be criminal.
- **Tax period deadlines.** Don't migrate during GST return week or EOY close.
- **Xero OAuth refresh.** Confirm the refresh token flow works on Crontech before cutover.
- **Multi-tenancy (if applicable).** If Astra serves multiple clients, tenant isolation must be bulletproof.
- **Compliance evidence.** Every step of this migration becomes part of the SOC 2 audit trail later.

## The compliance story

Week 3 is where Crontech earns its "compliance-native" positioning. By the end of this week we should be able to say, publicly:

> "Crontech runs our own accounting on the same hash-chained, RFC 3161 timestamped, WORM-stored audit substrate that we sell to our customers. We dogfood the thing that makes our positioning true."

That one sentence is worth the entire week.
