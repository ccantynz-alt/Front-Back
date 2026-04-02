/**
 * Server-Timing middleware.
 *
 * Records request processing time and exposes it via the standard
 * `Server-Timing` header, visible in browser DevTools Network panel.
 *
 * Additional metrics (DB queries, AI inference, etc.) can be added
 * by writing to `c.set("serverTimings", ...)` from downstream handlers.
 */

import type { MiddlewareHandler, Context } from "hono";

export interface ServerTimingMetric {
  /** Metric name (no spaces, no special chars) */
  name: string;
  /** Duration in milliseconds */
  dur?: number;
  /** Human-readable description */
  desc?: string;
}

/** Key used in Hono context to accumulate timing metrics */
const TIMING_KEY = "serverTimings";

/**
 * Add a timing metric from any downstream handler or middleware.
 *
 * Usage:
 * ```ts
 * addServerTiming(c, { name: "db", dur: 4.2, desc: "Database query" });
 * ```
 */
export function addServerTiming(c: Context, metric: ServerTimingMetric): void {
  const existing: ServerTimingMetric[] = c.get(TIMING_KEY) ?? [];
  existing.push(metric);
  c.set(TIMING_KEY, existing);
}

function formatMetric(m: ServerTimingMetric): string {
  const parts = [m.name];
  if (m.desc !== undefined) parts.push(`desc="${m.desc}"`);
  if (m.dur !== undefined) parts.push(`dur=${m.dur.toFixed(2)}`);
  return parts.join(";");
}

/**
 * Server-Timing middleware.
 *
 * Measures total request duration and collects any metrics added
 * via `addServerTiming()` by downstream handlers. All metrics are
 * serialized into the `Server-Timing` response header.
 */
export function serverTimingMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const start = performance.now();

    // Initialize the timings array
    c.set(TIMING_KEY, []);

    await next();

    const totalMs = performance.now() - start;

    // Collect all downstream metrics + add total
    const metrics: ServerTimingMetric[] = c.get(TIMING_KEY) ?? [];
    metrics.push({ name: "total", dur: totalMs, desc: "Total request time" });

    const headerValue = metrics.map(formatMetric).join(", ");
    c.header("Server-Timing", headerValue);
  };
}
