// ── Predictive Data Prefetcher ───────────────────────────────────────
// Tracks which tRPC procedures are called on each route, then predicts
// and prefetches data needs when the user navigates. Persists pattern
// data to localStorage. Fully SSR-safe.

const STORAGE_KEY = "btf:data-patterns";

/** Route pattern -> list of tRPC procedure names fetched on that route. */
type DataPatternMap = Record<string, string[]>;

let patterns: DataPatternMap = {};
let loaded = false;

// ── Persistence ─────────────────────────────────────────────────────

function loadPatterns(): void {
  if (loaded) return;
  loaded = true;
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      patterns = JSON.parse(raw) as DataPatternMap;
    }
  } catch {
    patterns = {};
  }
}

function persistPatterns(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patterns));
  } catch {
    // Storage full or unavailable — silently ignore.
  }
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Record that `procedure` was fetched while the user was on `route`.
 * Deduplicates: each procedure is recorded at most once per route.
 */
export function trackDataAccess(route: string, procedure: string): void {
  loadPatterns();
  if (!patterns[route]) {
    patterns[route] = [];
  }
  if (!patterns[route].includes(procedure)) {
    patterns[route].push(procedure);
    persistPatterns();
  }
}

/**
 * Return the list of tRPC procedures historically fetched on `route`.
 * Can be used to speculatively prefetch data before the route renders.
 */
export function getPredictedData(route: string): string[] {
  loadPatterns();
  return patterns[route] ? [...patterns[route]] : [];
}

/**
 * Trigger prefetch for the given tRPC procedure names.
 *
 * This is a placeholder that logs the intent. In production, replace
 * the body with actual tRPC client `prefetchQuery` calls, e.g.:
 *
 * ```ts
 * for (const proc of procedures) {
 *   trpc[proc].prefetch();
 * }
 * ```
 */
export function prefetchData(procedures: string[]): void {
  if (typeof window === "undefined") return;
  for (const procedure of procedures) {
    // Placeholder: in production wire this to tRPC's prefetch utility.
    // eslint-disable-next-line no-console
    console.debug(`[data-prefetcher] prefetching procedure: ${procedure}`);
  }
}

/**
 * Clear all recorded data access patterns. Useful for testing.
 */
export function resetDataPatterns(): void {
  patterns = {};
  loaded = true;
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage errors.
    }
  }
}
