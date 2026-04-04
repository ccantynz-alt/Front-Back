// ── AI-Driven Routing & Predictive Prefetching ──────────────────────
// Routes optimize themselves based on usage patterns and user intent.
// The system learns which pages users visit next and prefetches
// accordingly. Not static routes — living, adaptive routes.

// ── Types ────────────────────────────────────────────────────────────

interface NavigationEvent {
  from: string;
  to: string;
  timestamp: number;
  userId?: string;
  duration?: number;
}

interface RouteStats {
  path: string;
  visits: number;
  avgDuration: number;
  transitions: Map<string, number>; // path → count of transitions TO that path
}

interface PrefetchPrediction {
  path: string;
  probability: number;
}

// ── Navigation Tracker ───────────────────────────────────────────────

const MAX_HISTORY = 500;
const PREFETCH_THRESHOLD = 0.3; // 30% probability = prefetch

class SmartRouter {
  private history: NavigationEvent[] = [];
  private stats = new Map<string, RouteStats>();
  private prefetchedUrls = new Set<string>();

  /**
   * Record a navigation event.
   */
  trackNavigation(from: string, to: string, userId?: string): void {
    const event: NavigationEvent = {
      from,
      to,
      timestamp: Date.now(),
      userId,
    };

    this.history.push(event);
    if (this.history.length > MAX_HISTORY) {
      this.history.shift();
    }

    // Update stats for the source route
    this.updateStats(from, to);

    // Trigger predictive prefetch for the destination
    this.prefetchPredictedRoutes(to);
  }

  /**
   * Update route statistics with a new transition.
   */
  private updateStats(from: string, to: string): void {
    if (!this.stats.has(from)) {
      this.stats.set(from, {
        path: from,
        visits: 0,
        avgDuration: 0,
        transitions: new Map(),
      });
    }

    const stat = this.stats.get(from)!;
    stat.visits++;

    const currentCount = stat.transitions.get(to) ?? 0;
    stat.transitions.set(to, currentCount + 1);
  }

  /**
   * Predict the most likely next routes from the current page.
   */
  predictNextRoutes(currentPath: string, limit: number = 3): PrefetchPrediction[] {
    const stat = this.stats.get(currentPath);
    if (!stat || stat.visits === 0) return [];

    const predictions: PrefetchPrediction[] = [];
    for (const [path, count] of stat.transitions) {
      predictions.push({
        path,
        probability: count / stat.visits,
      });
    }

    return predictions
      .sort((a, b) => b.probability - a.probability)
      .slice(0, limit);
  }

  /**
   * Prefetch resources for predicted routes.
   * Uses the browser's <link rel="prefetch"> for zero-cost background loading.
   */
  private prefetchPredictedRoutes(currentPath: string): void {
    if (typeof document === "undefined") return;

    const predictions = this.predictNextRoutes(currentPath);

    for (const prediction of predictions) {
      if (prediction.probability < PREFETCH_THRESHOLD) continue;
      if (this.prefetchedUrls.has(prediction.path)) continue;

      // Prefetch the route's resources
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.href = prediction.path;
      link.as = "document";
      document.head.appendChild(link);

      this.prefetchedUrls.add(prediction.path);
    }
  }

  /**
   * Get route analytics for the dashboard.
   */
  getAnalytics(): {
    totalNavigations: number;
    topRoutes: Array<{ path: string; visits: number }>;
    topTransitions: Array<{ from: string; to: string; count: number }>;
  } {
    const topRoutes = Array.from(this.stats.values())
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 10)
      .map((s) => ({ path: s.path, visits: s.visits }));

    const topTransitions: Array<{ from: string; to: string; count: number }> = [];
    for (const [from, stat] of this.stats) {
      for (const [to, count] of stat.transitions) {
        topTransitions.push({ from, to, count });
      }
    }
    topTransitions.sort((a, b) => b.count - a.count);

    return {
      totalNavigations: this.history.length,
      topRoutes,
      topTransitions: topTransitions.slice(0, 10),
    };
  }

  /**
   * Reset all tracking data.
   */
  reset(): void {
    this.history = [];
    this.stats.clear();
    this.prefetchedUrls.clear();
  }
}

// ── Singleton Instance ───────────────────────────────────────────────

export const smartRouter = new SmartRouter();

/**
 * SolidJS router integration helper.
 * Call this in your root layout's onMount to auto-track navigation.
 */
export function trackPageView(path: string, previousPath?: string, userId?: string): void {
  if (previousPath) {
    smartRouter.trackNavigation(previousPath, path, userId);
  }
}
