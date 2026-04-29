// ── Crontech Worker Runtime — Exponential backoff for crash restart ──
// Math-only module (no timers) so the supervisor and tests share the
// same delay function and stay deterministic.

/** Base delay before the first restart attempt. */
export const BASE_BACKOFF_MS = 1_000;
/** Cap at 5 minutes — long enough to survive a 4xx-of-the-day, short
 * enough that a real customer outage is detected promptly. */
export const MAX_BACKOFF_MS = 5 * 60_000;

/**
 * Returns the delay, in ms, before the `attempt`-th restart. `attempt`
 * is 1-indexed (the first restart uses `attempt=1`).
 *
 * Schedule: 1s, 2s, 4s, 8s, 16s, 32s, 64s, 128s, 256s, 300s (capped)…
 */
export function computeBackoff(attempt: number): number {
  if (!Number.isFinite(attempt) || attempt < 1) return BASE_BACKOFF_MS;
  const exp = Math.min(30, attempt - 1); // guard against bit-shift overflow
  const delay = BASE_BACKOFF_MS * 2 ** exp;
  return Math.min(MAX_BACKOFF_MS, delay);
}
