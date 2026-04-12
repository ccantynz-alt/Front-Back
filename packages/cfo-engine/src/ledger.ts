// ── Ledger ──────────────────────────────────────────────────────────
// Double-entry general ledger. Posts transactions only if:
//   1. Every split references a known, active account.
//   2. All splits share the same currency (one transaction =
//      one currency — cross-currency needs an explicit FX bridge).
//   3. Sum of debits === sum of credits.
//   4. Amounts are strictly positive (zero-value splits are invalid).
//
// On every successful post, an audit log entry is written via the
// injected AuditLog. The audit entry's id is stored back on the
// PostedTransaction so consumers can link transactions to the
// tamper-evident chain.

import { AuditLog } from "@crontech/audit-log";
import { randomUUID } from "node:crypto";

import type { AccountStore } from "./chart-of-accounts";
import {
  PostedTransactionSchema,
  TransactionInputSchema,
  type PostedTransaction,
  type Split,
  type TransactionInput,
  type TrialBalance,
  type TrialBalanceRow,
} from "./types";
import { NORMAL_BALANCE, type Account } from "./types";

export interface LedgerOptions {
  accounts: AccountStore;
  auditLog: AuditLog;
  /** Override clock for deterministic tests. */
  now?: () => Date;
  idGenerator?: () => string;
}

export interface PostContext {
  /** The actor posting the transaction. Forwarded to the audit log. */
  actor: {
    id: string;
    displayName: string;
    role: string;
    ip?: string | null;
    userAgent?: string | null;
    sessionId?: string | null;
  };
}

export class Ledger {
  private readonly accounts: AccountStore;
  private readonly auditLog: AuditLog;
  private readonly now: () => Date;
  private readonly idGenerator: () => string;
  private readonly transactions: PostedTransaction[] = [];

  constructor(opts: LedgerOptions) {
    this.accounts = opts.accounts;
    this.auditLog = opts.auditLog;
    this.now = opts.now ?? (() => new Date());
    this.idGenerator = opts.idGenerator ?? (() => randomUUID());
  }

  /**
   * Post a new transaction to the ledger. Validates input, enforces
   * double-entry balance, records an audit log entry, and returns
   * the fully-sealed PostedTransaction.
   */
  async post(
    input: TransactionInput,
    ctx: PostContext,
  ): Promise<PostedTransaction> {
    const validated = TransactionInputSchema.parse(input);
    this.assertSplitsAreValid(validated.splits);

    const sequence = this.transactions.length;
    const txId = this.idGenerator();
    const postedAt = this.now().toISOString();

    const auditEntry = await this.auditLog.append({
      actor: {
        id: ctx.actor.id,
        displayName: ctx.actor.displayName,
        role: ctx.actor.role,
        ip: ctx.actor.ip ?? null,
        userAgent: ctx.actor.userAgent ?? null,
        sessionId: ctx.actor.sessionId ?? null,
      },
      action: "CREATE",
      resource: {
        type: "ledger_transaction",
        id: txId,
        label: validated.description,
      },
      result: "success",
      detail: {
        sequence,
        reference: validated.reference,
        splitCount: validated.splits.length,
        splits: validated.splits.map((s) => ({
          accountId: s.accountId,
          side: s.side,
          amount: s.amount.amount.toString(),
          currency: s.amount.currency,
        })),
        description: validated.description,
      },
      errorCode: null,
    });

    const posted: PostedTransaction = PostedTransactionSchema.parse({
      ...validated,
      id: txId,
      sequence,
      postedAt,
      postedBy: ctx.actor.id,
      auditEntryId: auditEntry.id,
    });

    this.transactions.push(posted);
    return posted;
  }

  /** Return all posted transactions in sequence order (defensive copy). */
  listTransactions(): PostedTransaction[] {
    return this.transactions.slice();
  }

  /**
   * Compute the running balance of a single account as a signed
   * bigint expressed in the account's normal side. An asset with
   * +100 means +100 debit; a liability with +100 means +100 credit.
   * A negative value indicates the account is "contra" to its normal
   * side, which is a valid but unusual state.
   */
  balanceOf(accountId: string): bigint {
    const account = this.accounts.get(accountId);
    if (account === null) {
      throw new Error(`balanceOf: unknown account ${accountId}`);
    }
    const normal = NORMAL_BALANCE[account.type];

    let total = 0n;
    for (const tx of this.transactions) {
      for (const split of tx.splits) {
        if (split.accountId !== accountId) continue;
        if (split.side === normal) {
          total += split.amount.amount;
        } else {
          total -= split.amount.amount;
        }
      }
    }
    return total;
  }

  /**
   * Build a trial balance report across all accounts of the given
   * currency. `balanced` is true iff sum of all debit balances
   * equals sum of all credit balances — the defining invariant of
   * a healthy double-entry book.
   */
  trialBalance(currency: string): TrialBalance {
    const accounts = this.accounts.list().filter((a) => a.currency === currency);
    const rows: TrialBalanceRow[] = [];
    let totalDebits = 0n;
    let totalCredits = 0n;

    for (const account of accounts) {
      const { debitTotal, creditTotal } = this.sidesForAccount(account);
      const normal = NORMAL_BALANCE[account.type];
      const balance = normal === "debit" ? debitTotal - creditTotal : creditTotal - debitTotal;
      rows.push({
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        accountType: account.type,
        currency: account.currency,
        debitTotal,
        creditTotal,
        balance,
        balanceSide: normal,
      });
      totalDebits += debitTotal;
      totalCredits += creditTotal;
    }

    return {
      asOf: this.now().toISOString(),
      currency,
      rows,
      totalDebits,
      totalCredits,
      balanced: totalDebits === totalCredits,
    };
  }

  private sidesForAccount(account: Account): {
    debitTotal: bigint;
    creditTotal: bigint;
  } {
    let debitTotal = 0n;
    let creditTotal = 0n;
    for (const tx of this.transactions) {
      for (const split of tx.splits) {
        if (split.accountId !== account.id) continue;
        if (split.amount.currency !== account.currency) continue;
        if (split.side === "debit") {
          debitTotal += split.amount.amount;
        } else {
          creditTotal += split.amount.amount;
        }
      }
    }
    return { debitTotal, creditTotal };
  }

  private assertSplitsAreValid(splits: readonly Split[]): void {
    if (splits.length < 2) {
      throw new Error("transaction must have at least two splits");
    }

    const firstCurrency = splits[0]?.amount.currency;
    if (firstCurrency === undefined) {
      throw new Error("transaction has no splits");
    }

    let debits = 0n;
    let credits = 0n;

    for (const split of splits) {
      if (split.amount.currency !== firstCurrency) {
        throw new Error(
          `multi-currency transaction detected: ${firstCurrency} vs ${split.amount.currency}`,
        );
      }
      if (split.amount.amount <= 0n) {
        throw new Error(
          `split amount must be strictly positive; got ${split.amount.amount.toString()}`,
        );
      }
      const account = this.accounts.get(split.accountId);
      if (account === null) {
        throw new Error(`unknown account: ${split.accountId}`);
      }
      if (!account.active) {
        throw new Error(`account ${account.code} is inactive`);
      }
      if (account.currency !== split.amount.currency) {
        throw new Error(
          `account ${account.code} is ${account.currency}, split is ${split.amount.currency}`,
        );
      }
      if (split.side === "debit") {
        debits += split.amount.amount;
      } else {
        credits += split.amount.amount;
      }
    }

    if (debits !== credits) {
      throw new Error(
        `transaction unbalanced: debits ${debits.toString()} !== credits ${credits.toString()}`,
      );
    }
  }
}
