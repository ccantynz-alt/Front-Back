/**
 * Route and data prefetching utilities.
 *
 * Uses requestIdleCallback to avoid blocking the main thread during
 * user interactions. Prefetching is skipped on slow connections or
 * when data-saver mode is enabled.
 */

const prefetched = new Set<string>();

const scheduleIdle =
  typeof requestIdleCallback === "function"
    ? requestIdleCallback
    : (cb: () => void) => setTimeout(cb, 1);

/** Returns true if the current connection supports prefetching. */
function canPrefetch(): boolean {
  if (typeof navigator === "undefined") return false;
  if ("connection" in navigator) {
    const conn = navigator.connection as {
      saveData?: boolean;
      effectiveType?: string;
    };
    if (conn.saveData) return false;
    if (conn.effectiveType === "slow-2g" || conn.effectiveType === "2g")
      return false;
  }
  return true;
}

/**
 * Programmatic route prefetching. Injects a `<link rel="prefetch">` for the
 * given href so the browser fetches the route chunk during idle time.
 */
export function prefetchRoute(href: string): void {
  if (prefetched.has(href) || !canPrefetch()) return;
  prefetched.add(href);

  scheduleIdle(() => {
    // Use Speculation Rules API when available (Chrome 109+)
    if (
      HTMLScriptElement.supports?.("speculationrules") &&
      typeof document !== "undefined"
    ) {
      const rules = document.createElement("script");
      rules.type = "speculationrules";
      rules.textContent = JSON.stringify({
        prefetch: [{ source: "list", urls: [href] }],
      });
      document.head.appendChild(rules);
      return;
    }

    // Fallback: link rel=prefetch
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.href = href;
    link.as = "document";
    document.head.appendChild(link);
  });
}

/**
 * Prefetch tRPC data for a route by firing a GET request that the tRPC
 * client will pick up from cache on navigation.
 */
export function prefetchData(url: string): void {
  if (prefetched.has(`data:${url}`) || !canPrefetch()) return;
  prefetched.add(`data:${url}`);

  scheduleIdle(() => {
    fetch(url, {
      method: "GET",
      credentials: "same-origin",
      priority: "low" as RequestPriority,
    }).catch(() => {
      // Prefetch failure is non-critical
    });
  });
}

/** Debounce helper — returns a function that fires after `ms` of inactivity. */
function debounce<T extends (...args: never[]) => void>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Creates event handlers for an anchor element that prefetch on
 * hover / focus with a 100ms debounce to avoid unnecessary work on
 * quick mouse passes.
 *
 * Usage in SolidJS JSX:
 * ```tsx
 * const handlers = createPrefetchHandlers("/dashboard");
 * <a href="/dashboard" {...handlers}>Dashboard</a>
 * ```
 */
export function createPrefetchHandlers(href: string): {
  onMouseEnter: () => void;
  onFocus: () => void;
  onTouchStart: () => void;
} {
  const trigger = debounce(() => prefetchRoute(href), 100);
  return {
    onMouseEnter: trigger,
    onFocus: trigger,
    onTouchStart: () => prefetchRoute(href), // No debounce on touch — user is committed
  };
}
