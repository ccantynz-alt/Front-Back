// ── Reconnection backoff with full jitter ──────────────────────────
//
// Pure math. No I/O. Exported standalone so it is unit-testable and
// reusable from anywhere in the daemon that needs back-off semantics.
// ─────────────────────────────────────────────────────────────────────

export const INITIAL_BACKOFF_MS = 1_000;
export const MAX_BACKOFF_MS = 60_000;

/**
 * Compute the *unjittered* backoff for an attempt index.
 * `attempt = 0` is the first reconnect after the initial drop.
 */
export function computeBaseBackoffMs(attempt: number): number {
  if (attempt < 0 || !Number.isInteger(attempt)) {
    return INITIAL_BACKOFF_MS;
  }
  const doubled = INITIAL_BACKOFF_MS * 2 ** attempt;
  return Math.min(doubled, MAX_BACKOFF_MS);
}

/**
 * Compute the next reconnection delay with full jitter (AWS pattern).
 *
 * The unjittered backoff doubles every attempt up to the ceiling. The
 * jittered delay is a uniform random pick in `[0, base]`. This matters
 * because at scale (hundreds of origins reconnecting after a brief
 * edge hiccup) plain exponential backoff produces synchronised
 * thundering herds — every origin retries at exactly the same moment.
 *
 * `random` is injected so tests can pin the result deterministically.
 */
export function computeBackoffMs(
  attempt: number,
  random: () => number = Math.random,
): number {
  const base = computeBaseBackoffMs(attempt);
  const r = random();
  // Clamp to [0, 1) defensively in case a custom random misbehaves.
  const clamped = r < 0 ? 0 : r >= 1 ? 0.999_999 : r;
  return Math.floor(base * clamped);
}
