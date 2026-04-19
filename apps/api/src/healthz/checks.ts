/**
 * Individual component health checks for the self-hosted Crontech empire.
 *
 * Each check returns a typed result with `ok`, a component-specific payload
 * (latency, expiry, etc.), and an optional `error` string when it fails.
 * Every check hard-caps its own runtime via `withTimeout` so a single hung
 * dependency can never block the `/healthz/empire` endpoint.
 *
 * All checks are exported as pure functions so they can be unit-tested in
 * isolation with injected fakes. The route handler wires them together.
 */

import { connect } from "node:tls";
import { statfs } from "node:fs";

// ── Generic helpers ──────────────────────────────────────────────────

/**
 * Race a promise against a timer. If the timer wins, reject with
 * `timeout ${ms}ms`. Used to cap every upstream call at a safe budget so
 * `/healthz/empire` cannot take longer than the sum of its timeouts.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = "operation",
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timeout ${ms}ms`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err as Error);
      },
    );
  });
}

// ── Postgres ─────────────────────────────────────────────────────────

export interface PostgresCheckResult {
  ok: boolean;
  latency_ms: number;
  error?: string;
}

/**
 * Run `SELECT 1` against the default db client with a 2-second budget.
 *
 * Accepts a dependency-injected `probe` so tests can exercise the happy
 * path, the failure path, and the timeout path without needing a real
 * database.
 */
export async function checkPostgres(
  probe?: () => Promise<void>,
  timeoutMs = 2000,
): Promise<PostgresCheckResult> {
  const run =
    probe ??
    (async (): Promise<void> => {
      // Lazy import so tests that inject a probe never hit the real db client.
      const mod = await import("@back-to-the-future/db");
      const dbAny = mod.db as unknown as {
        run?: (sql: string) => Promise<unknown>;
      };
      if (typeof dbAny.run === "function") {
        await dbAny.run("SELECT 1");
      }
    });
  const t0 = performance.now();
  try {
    await withTimeout(run(), timeoutMs, "postgres");
    return { ok: true, latency_ms: Math.round(performance.now() - t0) };
  } catch (err) {
    return {
      ok: false,
      latency_ms: Math.round(performance.now() - t0),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── HTTP healthz probe (Gluecron, GateTest) ─────────────────────────

export interface HttpCheckResult {
  ok: boolean;
  url: string;
  latency_ms: number;
  status?: number;
  error?: string;
}

/**
 * GET `<baseUrl>/healthz` and return ok/latency. `fetchImpl` is injectable
 * so tests can simulate 2xx / 5xx / network failure / timeout without
 * leaving the process.
 */
export async function checkHttpHealth(
  baseUrl: string,
  timeoutMs = 3000,
  fetchImpl: typeof fetch = fetch,
): Promise<HttpCheckResult> {
  const url = `${baseUrl.replace(/\/+$/, "")}/healthz`;
  const t0 = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      signal: controller.signal,
      // Cache-busting header so we don't get an intermediate 304 from a CDN.
      headers: { "Cache-Control": "no-cache" },
    });
    const latency = Math.round(performance.now() - t0);
    if (!res.ok) {
      return {
        ok: false,
        url,
        latency_ms: latency,
        status: res.status,
        error: `status ${res.status}`,
      };
    }
    return { ok: true, url, latency_ms: latency, status: res.status };
  } catch (err) {
    return {
      ok: false,
      url,
      latency_ms: Math.round(performance.now() - t0),
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── Caddy TLS cert ───────────────────────────────────────────────────

export interface CertCheckResult {
  ok: boolean;
  expires?: string;
  days_left?: number;
  error?: string;
}

/**
 * TLS-probe a hostname and return the cert's `notAfter` as an ISO date plus
 * the integer days-until-expiry. Warn-threshold handling lives in the route
 * handler so this function stays a pure fact-gatherer.
 *
 * `probe` is injectable so tests can fabricate an expiring cert without
 * opening a real socket.
 */
export async function checkCaddyCert(
  host = "crontech.ai",
  port = 443,
  timeoutMs = 3000,
  probe?: (host: string, port: number, timeoutMs: number) => Promise<Date>,
  now: () => Date = () => new Date(),
): Promise<CertCheckResult> {
  try {
    const notAfter = await (probe ?? tlsProbeNotAfter)(host, port, timeoutMs);
    const currentMs = now().getTime();
    const daysLeft = Math.floor(
      (notAfter.getTime() - currentMs) / (1000 * 60 * 60 * 24),
    );
    return {
      ok: daysLeft > 0,
      expires: notAfter.toISOString().slice(0, 10),
      days_left: daysLeft,
      ...(daysLeft <= 0 ? { error: "certificate expired" } : {}),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Real TLS probe. Opens a socket with SNI, reads the peer cert's `valid_to`,
 * then closes. Separated from `checkCaddyCert` so tests never need to bind
 * network resources.
 */
function tlsProbeNotAfter(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<Date> {
  return new Promise((resolve, reject) => {
    const socket = connect({
      host,
      port,
      servername: host,
      timeout: timeoutMs,
      // Allow self-signed / custom CAs — we only care about expiry, not trust.
      rejectUnauthorized: false,
    });
    const cleanup = (): void => {
      try {
        socket.end();
        socket.destroy();
      } catch {
        // best-effort; socket already closed
      }
    };
    socket.once("secureConnect", () => {
      try {
        const cert = socket.getPeerCertificate();
        if (!cert || !cert.valid_to) {
          cleanup();
          reject(new Error("no peer certificate"));
          return;
        }
        const notAfter = new Date(cert.valid_to);
        cleanup();
        resolve(notAfter);
      } catch (err) {
        cleanup();
        reject(err as Error);
      }
    });
    socket.once("error", (err) => {
      cleanup();
      reject(err);
    });
    socket.once("timeout", () => {
      cleanup();
      reject(new Error(`tls timeout ${timeoutMs}ms`));
    });
  });
}

// ── Disk free percentage ─────────────────────────────────────────────

export interface DiskCheckResult {
  ok: boolean;
  value?: number;
  error?: string;
}

/**
 * Query `statfs('/')` and return free percentage (0..100). Warn if below
 * 15% — enforced by the route handler, not here. `probe` is injectable
 * for tests so we don't depend on the host's actual disk state.
 */
export async function checkDiskFree(
  path = "/",
  probe?: (path: string) => Promise<{ blocks: number; bfree: number }>,
): Promise<DiskCheckResult> {
  try {
    const stats = await (probe ?? statfsProbe)(path);
    if (stats.blocks === 0) {
      return { ok: false, error: "statfs returned 0 blocks" };
    }
    const pct = (stats.bfree / stats.blocks) * 100;
    const rounded = Math.round(pct * 10) / 10;
    return {
      ok: rounded >= 1,
      value: rounded,
      ...(rounded < 1 ? { error: "disk critically full" } : {}),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function statfsProbe(
  path: string,
): Promise<{ blocks: number; bfree: number }> {
  return new Promise((resolve, reject) => {
    statfs(path, (err, stats) => {
      if (err) {
        reject(err);
        return;
      }
      resolve({ blocks: Number(stats.blocks), bfree: Number(stats.bfree) });
    });
  });
}
