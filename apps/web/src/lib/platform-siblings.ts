// ── Platform Siblings ───────────────────────────────────────────────
// Server-side fetcher for the cross-repo /api/platform-status contract
// documented in docs/PLATFORM_STATUS.md. Pulls state from each sibling
// (crontech, gluecron, gatetest) so the admin console can render a
// three-card health strip without the operator leaving this product.
//
// Design constraints:
//   - Server-side only. Each URL is fetched from the SolidStart API
//     route so the browser never talks to the other products directly
//     (keeps CORS and latency honest, and lets us cache the fan-out).
//   - 3-second per-sibling timeout. A slow sibling MUST NOT block the
//     admin page. Timeouts render as `status: "unreachable"` — never
//     an error page.
//   - 30-second in-memory cache. Admin page loads are bursty (refresh
//     button + tab changes) so a short cache stops the siblings
//     getting hammered.
//   - No new dependencies. Uses the runtime's fetch + AbortSignal.

export type SiblingProduct = "crontech" | "gluecron" | "gatetest";

export type SiblingStatus = "up" | "down" | "unreachable";

export interface SiblingHealth {
  product: SiblingProduct;
  url: string;
  status: SiblingStatus;
  /** Round-trip time in milliseconds, null when the fetch never completed. */
  latencyMs: number | null;
  /** ISO-8601 timestamp from the sibling payload, null if not reported. */
  lastUpdated: string | null;
  /** App version reported by the sibling, null if unavailable. */
  version: string | null;
  /** Short commit SHA reported by the sibling, null if unavailable. */
  commit: string | null;
  /** Human-friendly one-liner when the sibling is not up. */
  error: string | null;
}

export interface SiblingsSnapshot {
  /** When this snapshot was built on our server. */
  fetchedAt: string;
  siblings: SiblingHealth[];
}

const DEFAULT_URLS: Record<SiblingProduct, string> = {
  crontech: "https://crontech.ai/api/platform-status",
  gluecron: "https://gluecron.com/api/platform-status",
  gatetest: "https://gatetest.io/api/platform-status",
};

const ENV_KEYS: Record<SiblingProduct, string> = {
  crontech: "CRONTECH_STATUS_URL",
  gluecron: "GLUECRON_STATUS_URL",
  gatetest: "GATETEST_STATUS_URL",
};

/** 3-second hard cap on each sibling fetch. */
const FETCH_TIMEOUT_MS = 3_000;
/** 30-second fan-out cache — matches the task brief. */
const CACHE_TTL_MS = 30_000;

interface ShapelessPayload {
  product?: unknown;
  version?: unknown;
  commit?: unknown;
  healthy?: unknown;
  timestamp?: unknown;
}

interface CacheEntry {
  expiresAt: number;
  snapshot: SiblingsSnapshot;
}

let cache: CacheEntry | null = null;
let inflight: Promise<SiblingsSnapshot> | null = null;

export function resolveSiblingUrl(product: SiblingProduct): string {
  const envKey = ENV_KEYS[product];
  const fromEnv = typeof process !== "undefined" ? process.env?.[envKey] : undefined;
  const trimmed = typeof fromEnv === "string" ? fromEnv.trim() : "";
  return trimmed.length > 0 ? trimmed : DEFAULT_URLS[product];
}

export function resetPlatformSiblingsCache(): void {
  cache = null;
  inflight = null;
}

export async function getPlatformSiblings(options?: {
  /** Bypass the 30s cache — used by the admin refresh button. */
  force?: boolean;
  /** Inject a fetch implementation (tests). */
  fetchImpl?: typeof fetch;
  /** Clock override (tests). */
  now?: () => number;
}): Promise<SiblingsSnapshot> {
  const now = options?.now ?? Date.now;
  const fetchImpl = options?.fetchImpl ?? fetch;

  if (!options?.force && cache && cache.expiresAt > now()) {
    return cache.snapshot;
  }

  if (inflight) return inflight;

  inflight = (async (): Promise<SiblingsSnapshot> => {
    const products: SiblingProduct[] = ["crontech", "gluecron", "gatetest"];
    const results = await Promise.all(
      products.map((product) => fetchOne(product, fetchImpl)),
    );
    const snapshot: SiblingsSnapshot = {
      fetchedAt: new Date(now()).toISOString(),
      siblings: results,
    };
    cache = { snapshot, expiresAt: now() + CACHE_TTL_MS };
    return snapshot;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

async function fetchOne(
  product: SiblingProduct,
  fetchImpl: typeof fetch,
): Promise<SiblingHealth> {
  const url = resolveSiblingUrl(product);
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetchImpl(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;

    if (!res.ok) {
      return {
        product,
        url,
        status: "down",
        latencyMs,
        lastUpdated: null,
        version: null,
        commit: null,
        error: `HTTP ${res.status}`,
      };
    }

    const payload = (await res.json().catch(() => null)) as ShapelessPayload | null;
    const version = typeof payload?.version === "string" ? payload.version : null;
    const commit = typeof payload?.commit === "string" ? payload.commit : null;
    const lastUpdated =
      typeof payload?.timestamp === "string" ? payload.timestamp : null;
    const healthy = payload?.healthy === true;

    return {
      product,
      url,
      status: healthy ? "up" : "down",
      latencyMs,
      lastUpdated,
      version,
      commit,
      error: healthy ? null : "sibling reported unhealthy",
    };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const aborted =
      err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
    return {
      product,
      url,
      status: "unreachable",
      latencyMs: aborted ? FETCH_TIMEOUT_MS : latencyMs,
      lastUpdated: null,
      version: null,
      commit: null,
      error: aborted ? "timeout" : "unreachable",
    };
  } finally {
    clearTimeout(timer);
  }
}

// Exported for tests that want to assert the default URLs without
// leaking them through resolveSiblingUrl's env-override branch.
export const PLATFORM_SIBLING_DEFAULTS = DEFAULT_URLS;
export const PLATFORM_SIBLING_ENV_KEYS = ENV_KEYS;
export const PLATFORM_SIBLING_FETCH_TIMEOUT_MS = FETCH_TIMEOUT_MS;
export const PLATFORM_SIBLING_CACHE_TTL_MS = CACHE_TTL_MS;
