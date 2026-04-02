// @refresh reload
import { StartClient, mount } from "@solidjs/start/client";
import { reportWebVitals } from "./lib/performance";

// Mount the application
mount(() => <StartClient />, document.getElementById("app")!);

// Track hydration timing — measures time from navigation start to interactive
const hydrationEnd = performance.now();
const navigationStart =
  performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
if (navigationStart) {
  const hydrationTime = hydrationEnd - navigationStart.responseEnd;
  // biome-ignore lint/suspicious/noConsoleLog: performance telemetry
  console.log(`[perf] Hydration completed in ${hydrationTime.toFixed(1)}ms`);
}

// Initialize Core Web Vitals reporting
reportWebVitals((metric) => {
  // biome-ignore lint/suspicious/noConsoleLog: performance telemetry
  console.log(`[perf] ${metric.name}: ${metric.value.toFixed(1)}${metric.unit}`);

  // In production, send to analytics endpoint via navigator.sendBeacon
  if (import.meta.env.PROD && navigator.sendBeacon) {
    navigator.sendBeacon(
      "/api/vitals",
      JSON.stringify(metric),
    );
  }
});

// Defer non-critical initialization to idle time
const scheduleIdle =
  typeof requestIdleCallback === "function"
    ? requestIdleCallback
    : (cb: () => void) => setTimeout(cb, 1);

scheduleIdle(() => {
  // Prefetch likely next routes after idle
  if ("connection" in navigator) {
    const conn = navigator.connection as { saveData?: boolean; effectiveType?: string };
    // Skip prefetching on slow connections or data-saver mode
    if (conn.saveData || conn.effectiveType === "slow-2g") return;
  }

  // Register service worker for offline support (PWA)
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Service worker registration failed — non-critical
    });
  }
});
