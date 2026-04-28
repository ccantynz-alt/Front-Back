/** How long a project with no in-flight requests stays in the map
 *  so the gauge can continue emitting 0 samples. */
export const PROJECT_INFLIGHT_GRACE_MS = 5 * 60 * 1000;

export interface InflightEntry {
  count: number;
  /** Last time the count was non-zero, or 0 if it's never been touched.
   *  Populated on decrement-to-zero so we know when to prune. */
  lastActiveMs: number;
}

export const projectInflightMap = new Map<string, InflightEntry>();

/** Increment the in-flight counter for a project. Safe to call many
 *  times per request — only the entry and exit pair matters. */
export function incrementProjectInflight(projectId: string): void {
  const entry = projectInflightMap.get(projectId);
  if (entry) {
    entry.count += 1;
    entry.lastActiveMs = Date.now();
  } else {
    projectInflightMap.set(projectId, { count: 1, lastActiveMs: Date.now() });
  }
}

/** Decrement the in-flight counter for a project. If the count drops
 *  to 0 the entry stays in the map for the grace window so the gauge
 *  still emits a final "0" sample before the series goes stale. */
export function decrementProjectInflight(projectId: string): void {
  const entry = projectInflightMap.get(projectId);
  if (!entry) return;
  entry.count = Math.max(0, entry.count - 1);
  entry.lastActiveMs = Date.now();
}

/** Test-only snapshot of the internal map. */
export function _getProjectInflightSnapshot(): Map<string, InflightEntry> {
  return new Map(projectInflightMap);
}

/** Test-only reset of the internal map. */
export function _resetProjectInflight(): void {
  projectInflightMap.clear();
}
