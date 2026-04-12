// ── CFO Engine Types ────────────────────────────────────────────────
// Core types for the double-entry ledger. All schemas are Zod-first:
// the schema is the source of truth, TypeScript types derived via
// z.infer, runtime guards via safeParse. Matches the monorepo-wide
// Zod discipline.

import { z } from "zod";

import { MoneySchema } from "./money";

// ── Account types + normal balances ────────────────────────────────
// Five account types per standard double-entry accounting. Each has
// a "normal balance" side — debit or credit — that the ledger uses
// to compute running balances.
//
//   ASSET     : debit normal   (cash, A/R, inventory, fixed assets)
//   LIABILITY : credit normal  (A/P, loans, accrued)
//   EQUITY    : credit normal  (owner contributions, retained earnings)
//   REVENUE   : credit normal  (sales, fees, interest income)
//   EXPENSE   : debit normal   (COGS, salaries, rent)

export const AccountTypeSchema = z.enum([
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
]);

export type AccountType = z.infer<typeof AccountTypeSchema>;

export function isAccountType(value: unknown): value is AccountType {
  return AccountTypeSchema.safeParse(value).success;
}

export const NORMAL_BALANCE: Record<AccountType, "debit" | "credit"> = {
  asset: "debit",
  liability: "credit",
  equity: "credit",
  revenue: "credit",
  expense: "debit",
};

// ── Account ─────────────────────────────────────────────────────────

export const AccountSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  type: AccountTypeSchema,
  currency: z.string().regex(/^[A-Z]{3}$/),
  parentId: z.string().nullable().default(null),
  active: z.boolean().default(true),
});

export type Account = z.infer<typeof AccountSchema>;

// ── Split ───────────────────────────────────────────────────────────
// A single debit or credit line inside a transaction. Amount is
// always a positive Money value; the `side` field carries the sign.

export const SplitSideSchema = z.enum(["debit", "credit"]);
export type SplitSide = z.infer<typeof SplitSideSchema>;

export const SplitSchema = z.object({
  accountId: z.string().min(1),
  side: SplitSideSchema,
  amount: MoneySchema,
  memo: z.string().nullable().default(null),
});

export type Split = z.infer<typeof SplitSchema>;

// ── Transaction (journal entry) ─────────────────────────────────────
// A full double-entry journal entry. The ledger validates that the
// sum of debits equals the sum of credits (per currency) before
// accepting it.

export const TransactionInputSchema = z.object({
  date: z.string().datetime({ offset: true }),
  description: z.string().min(1),
  reference: z.string().nullable().default(null),
  splits: z.array(SplitSchema).min(2),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type TransactionInput = z.infer<typeof TransactionInputSchema>;

export const PostedTransactionSchema = TransactionInputSchema.extend({
  id: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  postedAt: z.string().datetime({ offset: true }),
  postedBy: z.string().min(1),
  auditEntryId: z.string().nullable(),
});

export type PostedTransaction = z.infer<typeof PostedTransactionSchema>;

export function isPostedTransaction(value: unknown): value is PostedTransaction {
  return PostedTransactionSchema.safeParse(value).success;
}

// ── Trial balance row + report ─────────────────────────────────────

export interface TrialBalanceRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  currency: string;
  debitTotal: bigint;
  creditTotal: bigint;
  balance: bigint;
  balanceSide: "debit" | "credit";
}

export interface TrialBalance {
  asOf: string;
  currency: string;
  rows: TrialBalanceRow[];
  totalDebits: bigint;
  totalCredits: bigint;
  balanced: boolean;
}
