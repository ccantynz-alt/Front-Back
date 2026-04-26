// ── AI Gateway Usage Tracker ──────────────────────────────────────────
// Pure in-memory ledger. v0 only — Turso persistence comes later.

import type { ProviderName } from "./router";

export interface UsageRecord {
  provider: ProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costMicrodollars: number;
  ts: number;
}

export interface UsageSummary {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostMicrodollars: number;
  byProvider: Record<ProviderName, ProviderUsageSummary>;
}

export interface ProviderUsageSummary {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costMicrodollars: number;
}

const ledger: UsageRecord[] = [];

export function record(entry: UsageRecord): void {
  ledger.push(entry);
}

export function summary(): UsageSummary {
  const providers: Record<ProviderName, ProviderUsageSummary> = {
    anthropic: { requests: 0, inputTokens: 0, outputTokens: 0, costMicrodollars: 0 },
    openai: { requests: 0, inputTokens: 0, outputTokens: 0, costMicrodollars: 0 },
  };
  let totalIn = 0;
  let totalOut = 0;
  let totalCost = 0;

  for (const r of ledger) {
    const bucket = providers[r.provider];
    bucket.requests += 1;
    bucket.inputTokens += r.inputTokens;
    bucket.outputTokens += r.outputTokens;
    bucket.costMicrodollars += r.costMicrodollars;
    totalIn += r.inputTokens;
    totalOut += r.outputTokens;
    totalCost += r.costMicrodollars;
  }

  return {
    totalRequests: ledger.length,
    totalInputTokens: totalIn,
    totalOutputTokens: totalOut,
    totalCostMicrodollars: totalCost,
    byProvider: providers,
  };
}

/**
 * Test helper. Clears the in-memory ledger so each test starts clean.
 * Keeping this here (rather than only in tests) lets the running server
 * also offer a debug "reset usage counters" endpoint later if we want.
 */
export function resetForTesting(): void {
  ledger.length = 0;
}

/**
 * Conservative micro-dollar cost estimate. Real per-model pricing tables
 * land in v1 alongside per-tenant spend caps. For now we expose the math
 * so tests can exercise the recorder, and the returned value is an
 * order-of-magnitude proxy rather than authoritative billing.
 *
 * 1 microdollar = 1e-6 USD. Defaults: $1/1M input tokens, $5/1M output.
 */
export function estimateCostMicrodollars(inputTokens: number, outputTokens: number): number {
  const inputRatePerToken = 1; // $1 per 1M input tokens → 1 microdollar/token
  const outputRatePerToken = 5; // $5 per 1M output tokens → 5 microdollars/token
  return inputTokens * inputRatePerToken + outputTokens * outputRatePerToken;
}
