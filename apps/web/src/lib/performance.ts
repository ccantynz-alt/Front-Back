/**
 * Core Web Vitals collection and component performance measurement.
 *
 * Uses the PerformanceObserver API to collect LCP, FID, CLS, INP, and TTFB
 * without any third-party dependencies.
 */

export interface WebVitalMetric {
  /** Metric name */
  name: "LCP" | "FID" | "CLS" | "INP" | "TTFB" | "FCP";
  /** Metric value */
  value: number;
  /** Unit of measurement */
  unit: "ms" | "score";
  /** Rating based on Core Web Vitals thresholds */
  rating: "good" | "needs-improvement" | "poor";
  /** Raw PerformanceEntry entries that contributed to the metric */
  entries: PerformanceEntry[];
}

type OnMetric = (metric: WebVitalMetric) => void;

function rate(
  name: WebVitalMetric["name"],
  value: number,
): WebVitalMetric["rating"] {
  // Thresholds from https://web.dev/vitals/
  const thresholds: Record<
    WebVitalMetric["name"],
    [number, number]
  > = {
    LCP: [2500, 4000],
    FID: [100, 300],
    CLS: [0.1, 0.25],
    INP: [200, 500],
    TTFB: [800, 1800],
    FCP: [1800, 3000],
  };
  const [good, poor] = thresholds[name];
  if (value <= good) return "good";
  if (value <= poor) return "needs-improvement";
  return "poor";
}

function observe(
  type: string,
  callback: (entries: PerformanceEntryList) => void,
  opts?: PerformanceObserverInit,
): PerformanceObserver | undefined {
  try {
    if (!PerformanceObserver.supportedEntryTypes?.includes(type)) return;
    const observer = new PerformanceObserver((list) =>
      callback(list.getEntries()),
    );
    observer.observe({ type, buffered: true, ...opts });
    return observer;
  } catch {
    return undefined;
  }
}

/**
 * Collects and reports Core Web Vitals. Call once at application startup.
 * The `onMetric` callback fires as each metric becomes available.
 */
export function reportWebVitals(onMetric: OnMetric): void {
  if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") return;

  // --- LCP (Largest Contentful Paint) ---
  observe("largest-contentful-paint", (entries) => {
    const last = entries[entries.length - 1];
    if (!last) return;
    const value = (last as PerformanceEntry & { startTime: number }).startTime;
    onMetric({
      name: "LCP",
      value,
      unit: "ms",
      rating: rate("LCP", value),
      entries,
    });
  });

  // --- FID (First Input Delay) ---
  observe("first-input", (entries) => {
    const entry = entries[0] as PerformanceEventTiming | undefined;
    if (!entry) return;
    const value = entry.processingStart - entry.startTime;
    onMetric({
      name: "FID",
      value,
      unit: "ms",
      rating: rate("FID", value),
      entries,
    });
  });

  // --- CLS (Cumulative Layout Shift) ---
  let clsValue = 0;
  let clsEntries: PerformanceEntry[] = [];
  let sessionValue = 0;
  let sessionEntries: PerformanceEntry[] = [];
  observe("layout-shift", (entries) => {
    for (const entry of entries) {
      const lsEntry = entry as PerformanceEntry & {
        hadRecentInput: boolean;
        value: number;
      };
      if (lsEntry.hadRecentInput) continue;

      const firstEntry = sessionEntries[0] as
        | (PerformanceEntry & { startTime: number })
        | undefined;
      const prevEntry = sessionEntries[sessionEntries.length - 1] as
        | (PerformanceEntry & { startTime: number })
        | undefined;

      if (
        firstEntry &&
        prevEntry &&
        lsEntry.startTime - prevEntry.startTime < 1000 &&
        lsEntry.startTime - firstEntry.startTime < 5000
      ) {
        sessionValue += lsEntry.value;
        sessionEntries.push(lsEntry);
      } else {
        sessionValue = lsEntry.value;
        sessionEntries = [lsEntry];
      }

      if (sessionValue > clsValue) {
        clsValue = sessionValue;
        clsEntries = [...sessionEntries];
        onMetric({
          name: "CLS",
          value: clsValue,
          unit: "score",
          rating: rate("CLS", clsValue),
          entries: clsEntries,
        });
      }
    }
  });

  // --- INP (Interaction to Next Paint) ---
  const inpEntries: PerformanceEventTiming[] = [];
  observe("event", (entries) => {
    for (const entry of entries) {
      const eventEntry = entry as PerformanceEventTiming;
      if (!eventEntry.interactionId) continue;
      inpEntries.push(eventEntry);
    }
    // INP is the p98 of interaction durations
    if (inpEntries.length === 0) return;
    inpEntries.sort((a, b) => b.duration - a.duration);
    const idx = Math.min(inpEntries.length - 1, Math.floor(inpEntries.length / 50));
    const value = inpEntries[idx].duration;
    onMetric({
      name: "INP",
      value,
      unit: "ms",
      rating: rate("INP", value),
      entries: inpEntries,
    });
  }, { durationThreshold: 40 } as PerformanceObserverInit);

  // --- TTFB (Time to First Byte) ---
  observe("navigation", (entries) => {
    const nav = entries[0] as PerformanceNavigationTiming | undefined;
    if (!nav) return;
    const value = nav.responseStart - nav.requestStart;
    onMetric({
      name: "TTFB",
      value,
      unit: "ms",
      rating: rate("TTFB", value),
      entries,
    });
  });

  // --- FCP (First Contentful Paint) ---
  observe("paint", (entries) => {
    const fcp = entries.find((e) => e.name === "first-contentful-paint");
    if (!fcp) return;
    const value = fcp.startTime;
    onMetric({
      name: "FCP",
      value,
      unit: "ms",
      rating: rate("FCP", value),
      entries: [fcp],
    });
  });
}

/**
 * Measures a SolidJS component's render time using the User Timing API.
 * Wrap your component logic to get performance marks in DevTools.
 *
 * Usage:
 * ```tsx
 * const Component = () => {
 *   const end = measureComponent("MyComponent");
 *   // ... render logic ...
 *   end();
 *   return <div>...</div>;
 * };
 * ```
 */
export function measureComponent(name: string): () => void {
  const markName = `component:${name}:start`;
  const measureName = `component:${name}`;
  performance.mark(markName);
  return () => {
    performance.measure(measureName, markName);
    performance.clearMarks(markName);
  };
}

/**
 * Tracks hydration timing. Call at the top of entry-client before mount().
 * Returns the hydration duration in ms once mount completes.
 */
export function trackHydration(): { getDuration: () => number } {
  const start = performance.now();
  performance.mark("hydration:start");
  return {
    getDuration(): number {
      const duration = performance.now() - start;
      performance.measure("hydration", "hydration:start");
      performance.clearMarks("hydration:start");
      return duration;
    },
  };
}
