/**
 * Crontech RUM beacon.
 *
 * Privacy-first: no cookies, no localStorage, no fingerprinting.
 * Captures Web Vitals (LCP, CLS, INP, FCP, TTFB) plus navigation timing
 * and the device's coarse capability hints, batches them, and sends a
 * single keepalive POST on `pagehide` (with `visibilitychange` fallback).
 *
 * Footprint target: under 2 KB gzipped.
 */

// Minimal browser globals declared inline so the TS build does not require
// a DOM lib that the rest of the monorepo wires through tsconfig — the file
// is consumed by browsers, not Node.
declare const window: {
  __RUM__?: { endpoint?: string; tenant?: string; sample?: number };
  innerWidth: number;
  innerHeight: number;
  location: { pathname: string };
  addEventListener: (e: string, cb: () => void, o?: unknown) => void;
};
declare const document: {
  visibilityState: string;
  addEventListener: (e: string, cb: () => void) => void;
};
declare const navigator: {
  deviceMemory?: number;
  connection?: { effectiveType?: string };
  sendBeacon?: (url: string, data: string) => boolean;
};
declare const fetch: (url: string, init?: { method: string; body: string; keepalive: boolean; headers: Record<string, string> }) => Promise<unknown>;
declare const performance: {
  now: () => number;
  getEntriesByType: (t: string) => Array<{ startTime: number; responseStart?: number; requestStart?: number }>;
};
declare const PerformanceObserver: {
  new (cb: (l: { getEntries: () => Array<Record<string, number>> }) => void): {
    observe: (init: { type: string; buffered: boolean }) => void;
  };
};

type MetricName = "LCP" | "CLS" | "INP" | "FCP" | "TTFB";

interface Metric {
  n: MetricName;
  v: number;
  t: number;
}

interface Batch {
  tenant: string;
  route: string;
  sentAt: number;
  viewport: [number, number];
  deviceMemory: number | null;
  connection: string | null;
  metrics: Metric[];
}

const cfg = (typeof window !== "undefined" && window.__RUM__) || {};
const ENDPOINT = cfg.endpoint || "/rum/v1/collect";
const TENANT = cfg.tenant || "default";
const SAMPLE = typeof cfg.sample === "number" ? cfg.sample : 1;

// Sample gate – random throw, so the page-load decision is sticky.
const sampled = Math.random() < SAMPLE;

const metrics: Metric[] = [];
const push = (n: MetricName, v: number): void => {
  if (!sampled) return;
  metrics.push({ n, v, t: Math.round(performance.now()) });
};

// Web Vitals – we keep it small by reading PerformanceObserver entries directly.
const observe = (type: string, fn: (e: Record<string, number>) => void): void => {
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) fn(e);
    }).observe({ type, buffered: true });
  } catch {
    /* ignore – older browsers */
  }
};

// LCP – take the latest entry.
let lcp = 0;
observe("largest-contentful-paint", (e) => {
  if (typeof e.startTime === "number") lcp = e.startTime;
});

// CLS – sum of session-window layout-shift values, dropping shifts with input.
let cls = 0;
observe("layout-shift", (e) => {
  if (e.hadRecentInput) return;
  if (typeof e.value === "number") cls += e.value;
});

// INP – take the worst (max) interaction duration as the running INP estimate.
let inp = 0;
observe("event", (e) => {
  if (typeof e.duration === "number" && e.duration > inp) inp = e.duration;
});

// FCP – first paint of any content.
observe("paint", (e) => {
  if (typeof e.startTime === "number" && (e as { name?: string }).name === "first-contentful-paint") {
    push("FCP", e.startTime);
  }
});

// TTFB – derived from the navigation entry, captured eagerly.
const navEntries = performance.getEntriesByType("navigation");
const nav = navEntries[0];
if (nav && typeof nav.responseStart === "number" && typeof nav.requestStart === "number") {
  push("TTFB", nav.responseStart - nav.requestStart);
}

const flush = (): void => {
  if (!sampled || metrics.length === 0) return;
  // Fold the streaming metrics into the batch.
  if (lcp > 0) push("LCP", lcp);
  push("CLS", cls);
  if (inp > 0) push("INP", inp);

  const batch: Batch = {
    tenant: TENANT,
    route: window.location.pathname,
    sentAt: Date.now(),
    viewport: [window.innerWidth, window.innerHeight],
    deviceMemory: typeof navigator.deviceMemory === "number" ? navigator.deviceMemory : null,
    connection:
      navigator.connection && typeof navigator.connection.effectiveType === "string"
        ? navigator.connection.effectiveType
        : null,
    metrics: metrics.splice(0),
  };
  const body = JSON.stringify(batch);
  // sendBeacon is the right tool because it survives unload.
  if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, body)) return;
  // Fallback – keepalive fetch keeps the request alive across unload.
  fetch(ENDPOINT, {
    method: "POST",
    body,
    keepalive: true,
    headers: { "content-type": "application/json" },
  }).catch(() => {
    /* swallow – we've done our best */
  });
};

// pagehide is the canonical "page is going away" event. visibilitychange is
// the iOS Safari fallback because pagehide isn't always reliable there.
window.addEventListener("pagehide", flush);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flush();
});

export {};
