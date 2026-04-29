/**
 * Linear-interpolation percentile (NIST/Excel "exclusive linear" variant —
 * matches what most observability tools display for P50/P75/P95/P99).
 *
 * For an empty array we return 0 — the caller decides whether 0 is a sentinel
 * or simply "no data". Index errors are impossible because we early-return
 * for n === 0 and clamp for n === 1.
 */
export function quantile(sorted: ReadonlyArray<number>, q: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) {
    const only = sorted[0];
    return typeof only === "number" ? only : 0;
  }
  const clamped = Math.min(1, Math.max(0, q));
  const pos = clamped * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const frac = pos - lo;
  // Hard-bound lo/hi inside [0, n-1] so noUncheckedIndexedAccess can't bite.
  const safeLo = Math.min(n - 1, Math.max(0, lo));
  const safeHi = Math.min(n - 1, Math.max(0, hi));
  const a = sorted[safeLo];
  const b = sorted[safeHi];
  const av = typeof a === "number" ? a : 0;
  const bv = typeof b === "number" ? b : 0;
  return av + (bv - av) * frac;
}

export interface Percentiles {
  p50: number;
  p75: number;
  p95: number;
  p99: number;
  count: number;
}

export function percentiles(values: ReadonlyArray<number>): Percentiles {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    p95: quantile(sorted, 0.95),
    p99: quantile(sorted, 0.99),
    count: sorted.length,
  };
}
