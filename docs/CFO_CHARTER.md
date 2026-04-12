# CFO Charter

> The mission, boundaries, and non-goals of `packages/cfo-engine`.
> Binding. Read before touching the ledger.

The CFO engine is the financial nervous system of Crontech. Every dollar
that flows through the platform — customer charges, vendor payouts,
refunds, disputes, revenue recognition, tax — passes through one
double-entry ledger whose books are mathematically provable and
court-admissibly auditable.

This charter exists so that "make the billing page look nicer" never
leaks into "rewire the general ledger."

---

## Mission

Give Crontech a **trustworthy financial substrate** that:

1. Records every financial event with full double-entry discipline
   (debits === credits, always, no exceptions).
2. Denominates every value in integer minor units (BigInt), never
   floats, because floats and money are a production incident in
   waiting.
3. Writes every posted transaction to the hash-chained audit log
   (`packages/audit-log`) at the moment of posting, so the ledger and
   the audit trail cannot drift apart.
4. Exposes a narrow, Zod-first API so that call sites (billing, the
   admin console, Stripe webhooks, founding-customer discount flows)
   cannot accidentally bypass the invariants.

## Non-goals

The CFO engine is **not**:

- **Not a Stripe replacement.** Stripe processes cards. The CFO engine
  records what happened. These are different jobs. Stripe events feed
  the ledger; the ledger never pretends to be a PCI boundary.
- **Not a tax engine.** Tax calculation lives at the edge of the
  billing flow. The ledger records the result of that calculation as
  ordinary split lines, not as tax-aware rows.
- **Not a reporting tool.** Grafana, the admin page, and downstream
  BI are the reporting layer. The CFO engine's job is to make the
  underlying data defensible. Reporting is someone else's problem.
- **Not a journal entry editor.** There is no "edit transaction"
  operation. Corrections are new transactions that reverse prior
  transactions. WORM-aligned.
- **Not a general-purpose accounting SaaS.** That was scatter-gun work
  removed in commit `4dc4def`. Verticals run ON Crontech, not INSIDE.

## Invariants

These are the axioms. Breaking any of them is a P0 incident.

1. **Debits equal credits.** Every posted transaction satisfies
   `sum(debits) === sum(credits)` measured in the same currency.
   Enforced at post time, not at audit time.
2. **Money is BigInt.** The `MoneySchema` refuses `number`. The ledger
   refuses floats. Display formatting is the UI's problem.
3. **Currency is ISO 4217.** `/^[A-Z]{3}$/`, validated at the Zod
   boundary.
4. **Every posting writes to the audit log.** The returned
   `PostedTransaction.auditEntryId` is never null on success. If the
   audit write fails, the post fails.
5. **Every account has a fixed normal balance.** Asset and expense
   accounts are debit-normal; liability, equity, and revenue accounts
   are credit-normal. The `NORMAL_BALANCE` map is the single source
   of truth.
6. **No deletion.** No `deleteTransaction`. No `deleteAccount`.
   Corrections are new rows. The past is immutable.

## API surface (narrow on purpose)

Only these exports cross the package boundary:

- `MoneySchema`, `Money` — the money primitive.
- `AccountTypeSchema`, `AccountSchema`, `Account`, `openAccount`.
- `SplitSchema`, `Split`, `TransactionInputSchema`, `TransactionInput`,
  `PostedTransactionSchema`, `PostedTransaction`.
- `Ledger` — the class that owns the books.
- `createLedger(opts)` — the only constructor. Takes an audit-log
  sink. No default sink: if you forget to wire it, you get a type
  error, not a silent drop.

Anything else is internal. If a new call site needs something that is
not on this list, that is a charter conversation — not a quick export.

## Change control

- **Schema changes** to `Account`, `Split`, `TransactionInput`, or
  `PostedTransaction` are a SOFT GATE. State the migration plan.
- **Adding a new account type** beyond asset/liability/equity/revenue/
  expense is a HARD GATE. The five-type model is deliberate.
- **Changing the currency validation rule** is a HARD GATE. Crypto
  currencies, non-ISO codes, etc. are out of scope.
- **Removing any invariant above** is a HARD GATE and probably a
  resignation letter.

## Testing bar

The CFO engine test suite (`packages/cfo-engine/src/index.test.ts`)
is the *reference* for how strictly this module must be tested.

- Every invariant has a dedicated test that will fail if the invariant
  is broken.
- Every public function has at least one happy-path and one rejection
  test.
- Every Zod schema has an exhaustiveness test that pins the number of
  branches, so adding a variant forces an intentional test update.
- No flaky tests. No time-dependent tests without an injected clock.
  No network-dependent tests.

## Why this exists

Crontech earns trust in two ways: sub-5ms cold starts and ledgers that
add up. The first one the competition can eventually copy. The second
one requires discipline most platforms never pay for. This file is
that discipline written down so no future session trades it away for
a "quick fix."

The books must balance. The audit chain must hold. The future of
Crontech's credibility with founding customers lives in this package.

---

**When in doubt, the charter wins.**
