// ── AI Gateway Usage Tracker ──────────────────────────────────────────
// Pure in-memory ledger. v1 — Turso persistence behind the same `record`
// interface comes next sprint. The ledger is keyed by provider so the
// summary view is per-provider out of the box.

import type { ProviderName } from "./types";
import { PROVIDER_NAMES } from "./types";

export interface UsageRecord {
  provider: ProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costMicrodollars: number;
  ts: number;
  /** Optional customer attribution — unset when the gateway is called via control-plane secret. */
  customerId?: string;
  /** Whether the response came from a cache (and which kind). */
  cache?: "exact" | "semantic" | "miss";
}

export interface ProviderUsageSummary {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costMicrodollars: number;
}

export interface UsageSummary {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostMicrodollars: number;
  byProvider: Record<ProviderName, ProviderUsageSummary>;
}

const ledger: UsageRecord[] = [];

export function record(entry: UsageRecord): void {
  ledger.push(entry);
}

function emptyProviderRecord(): Record<ProviderName, ProviderUsageSummary> {
  const out = {} as Record<ProviderName, ProviderUsageSummary>;
  for (const p of PROVIDER_NAMES) {
    out[p] = { requests: 0, inputTokens: 0, outputTokens: 0, costMicrodollars: 0 };
  }
  return out;
}

export function summary(): UsageSummary {
  const providers = emptyProviderRecord();
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
 * land in v2 alongside per-tenant spend caps. For now we expose the math
 * so tests can exercise the recorder, and the returned value is an
 * order-of-magnitude proxy rather than authoritative billing.
 *
 * 1 microdollar = 1e-6 USD. Defaults: $1/1M input tokens, $5/1M output.
 *
 * WebGPU passthrough is special-cased to a tiny "service fee" so we
 * still get a non-zero number on the ledger (the user's GPU did the
 * inference for free, but we charge a flat per-call routing fee).
 */
export function estimateCostMicrodollars(
  inputTokens: number,
  outputTokens: number,
  provider?: ProviderName,
): number {
  if (provider === "webgpu") {
    // Flat 10 microdollar ($0.00001) routing fee — effectively free.
    return 10;
  }
  const inputRatePerToken = 1; // $1 per 1M input tokens → 1 microdollar/token
  const outputRatePerToken = 5; // $5 per 1M output tokens → 5 microdollars/token
  return inputTokens * inputRatePerToken + outputTokens * outputRatePerToken;
}
