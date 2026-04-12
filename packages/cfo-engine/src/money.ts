// ── Money ───────────────────────────────────────────────────────────
// Every monetary value is stored as an integer number of minor units
// (cents, satoshi, etc.). Floating-point dollars are a bug factory
// in double-entry systems — 0.1 + 0.2 !== 0.3 blows up trial balance
// reconciliation in the worst possible way.
//
// A Money value is a tagged struct: { amount: bigint, currency: string }.
// Arithmetic is exposed through add/subtract/negate/sum helpers so
// the ledger never touches raw bigints in business logic.
//
// BigInt is used for amount so we can represent amounts larger than
// Number.MAX_SAFE_INTEGER minor units — important for funds,
// high-volume payment rails, and year-over-year aggregates.

import { z } from "zod";

export const MoneySchema = z.object({
  amount: z.bigint(),
  currency: z.string().regex(/^[A-Z]{3}$/, "currency must be ISO 4217 (3 upper letters)"),
});

export type Money = z.infer<typeof MoneySchema>;

export function money(amount: bigint | number, currency: string): Money {
  const asBigInt = typeof amount === "bigint" ? amount : BigInt(amount);
  return MoneySchema.parse({ amount: asBigInt, currency });
}

export function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(
      `currency mismatch: ${a.currency} vs ${b.currency}. Cross-currency arithmetic must go through an FX rate.`,
    );
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: a.amount + b.amount, currency: a.currency };
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: a.amount - b.amount, currency: a.currency };
}

export function negate(a: Money): Money {
  return { amount: -a.amount, currency: a.currency };
}

export function isZero(a: Money): boolean {
  return a.amount === 0n;
}

export function isPositive(a: Money): boolean {
  return a.amount > 0n;
}

export function sum(values: readonly Money[], currency: string): Money {
  let total = 0n;
  for (const v of values) {
    if (v.currency !== currency) {
      throw new Error(
        `sum: expected ${currency}, got ${v.currency}. All values must share one currency.`,
      );
    }
    total += v.amount;
  }
  return { amount: total, currency };
}

/**
 * Format a Money value as a string for display/logs. Does not round
 * — all amounts are exact minor units. Use this only for
 * human-readable output, never for further arithmetic.
 */
export function formatMoney(value: Money, minorUnitsPerMajor = 100): string {
  const sign = value.amount < 0n ? "-" : "";
  const abs = value.amount < 0n ? -value.amount : value.amount;
  const divisor = BigInt(minorUnitsPerMajor);
  const major = abs / divisor;
  const minor = abs % divisor;
  const minorStr = minor.toString().padStart(
    String(minorUnitsPerMajor - 1).length,
    "0",
  );
  return `${sign}${major.toString()}.${minorStr} ${value.currency}`;
}
