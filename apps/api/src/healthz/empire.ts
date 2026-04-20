/**
 * `GET /healthz/empire` — single-pane-of-glass health probe for the
 * self-hosted Crontech stack.
 *
 * Checked components:
 *   - postgres       (SELECT 1 via the default db client)
 *   - gluecron       (HTTP /healthz against $GLUECRON_URL)
 *   - gatetest       (HTTP /healthz against $GATETEST_URL)
 *   - caddy_cert     (TLS probe to crontech.ai:443, days-until-expiry)
 *   - disk_free_pct  (statfs of / in percent)
 *
 * Top-level `ok` is AND-over-components. Critical components (postgres,
 * disk) degrading flip the HTTP status to 503 so upstream alerting treats
 * us as unhealthy. Non-critical degradations (cert nearing expiry, upstream
 * service hiccup) keep the 200 but still flag `ok: false` in the payload.
 *
 * The endpoint is auth-gated with `Authorization: Bearer $HEALTH_CHECK_TOKEN`
 * because the response leaks internal infra URLs and we don't want random
 * drive-by scanners mapping our private surfaces. Token comparison is
 * timing-safe (reused from the gluecron webhook pattern).
 */

import { Hono } from "hono";
import {
  checkPostgres,
  checkHttpHealth,
  checkCaddyCert,
  checkDiskFree,
  type PostgresCheckResult,
  type HttpCheckResult,
  type CertCheckResult,
  type DiskCheckResult,
} from "./checks";
import { timingSafeEqual } from "../webhooks/gluecron-push";

// ── Config ──────────────────────────────────────────────────────────

/** Warn threshold for Caddy cert days-until-expiry. */
const CERT_WARN_DAYS = 14;
/** Warn threshold for `/` free percentage. */
const DISK_WARN_PCT = 15;

/** Critical components — failure flips HTTP status to 503. */
const CRITICAL = new Set(["postgres", "disk_free_pct"]);

// ── Dependency seams for testing ─────────────────────────────────────

export interface EmpireHealthDeps {
  /** Accessor for the bearer token so tests can inject without mutating env. */
  getToken?: () => string | undefined;
  /** Postgres probe override. */
  checkPostgres?: () => Promise<PostgresCheckResult>;
  /** Gluecron HTTP probe override. */
  checkGluecron?: () => Promise<HttpCheckResult>;
  /** GateTest HTTP probe override. */
  checkGatetest?: () => Promise<HttpCheckResult>;
  /** Cert probe override. */
  checkCert?: () => Promise<CertCheckResult>;
  /** Disk probe override. */
  checkDisk?: () => Promise<DiskCheckResult>;
  /** Clock override for deterministic timestamps in tests. */
  now?: () => Date;
}

// ── Response shape ──────────────────────────────────────────────────

export interface EmpireHealthResponse {
  ok: boolean;
  timestamp: string;
  components: {
    postgres: PostgresCheckResult;
    gluecron: HttpCheckResult;
    gatetest: HttpCheckResult;
    caddy_cert: CertCheckResult & { warn?: boolean };
    disk_free_pct: DiskCheckResult & { warn?: boolean };
  };
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]!.trim() : null;
}

/**
 * Pure function that fans out to every component check in parallel and
 * assembles the response. Exported separately from the Hono app so
 * integration tests can exercise the logic without going through an HTTP
 * round trip.
 */
export async function runEmpireHealthCheck(
  deps: EmpireHealthDeps = {},
): Promise<{
  body: EmpireHealthResponse;
  status: 200 | 503;
}> {
  const gluecronUrl =
    process.env["GLUECRON_URL"] ?? "https://gluecron.crontech.ai";
  const gatetestUrl =
    process.env["GATETEST_URL"] ?? "https://gatetest.ai";

  const postgresFn = deps.checkPostgres ?? (() => checkPostgres());
  const gluecronFn =
    deps.checkGluecron ?? (() => checkHttpHealth(gluecronUrl));
  const gatetestFn =
    deps.checkGatetest ?? (() => checkHttpHealth(gatetestUrl));
  const certFn = deps.checkCert ?? (() => checkCaddyCert());
  const diskFn = deps.checkDisk ?? (() => checkDiskFree());

  // Promise.allSettled so one check crashing does not nuke the whole
  // response — each check is already supposed to catch its own errors,
  // this is belt-and-braces.
  const [pg, gc, gt, cert, disk] = await Promise.allSettled([
    postgresFn(),
    gluecronFn(),
    gatetestFn(),
    certFn(),
    diskFn(),
  ]);

  const pgR: PostgresCheckResult =
    pg.status === "fulfilled"
      ? pg.value
      : { ok: false, latency_ms: 0, error: String(pg.reason) };
  const gcR: HttpCheckResult =
    gc.status === "fulfilled"
      ? gc.value
      : { ok: false, url: gluecronUrl, latency_ms: 0, error: String(gc.reason) };
  const gtR: HttpCheckResult =
    gt.status === "fulfilled"
      ? gt.value
      : { ok: false, url: gatetestUrl, latency_ms: 0, error: String(gt.reason) };
  const certR: CertCheckResult =
    cert.status === "fulfilled"
      ? cert.value
      : { ok: false, error: String(cert.reason) };
  const diskR: DiskCheckResult =
    disk.status === "fulfilled"
      ? disk.value
      : { ok: false, error: String(disk.reason) };

  const certWarn =
    certR.ok &&
    typeof certR.days_left === "number" &&
    certR.days_left < CERT_WARN_DAYS;
  const diskWarn =
    diskR.ok &&
    typeof diskR.value === "number" &&
    diskR.value < DISK_WARN_PCT;

  const components: EmpireHealthResponse["components"] = {
    postgres: pgR,
    gluecron: gcR,
    gatetest: gtR,
    caddy_cert: { ...certR, ...(certWarn ? { warn: true } : {}) },
    disk_free_pct: { ...diskR, ...(diskWarn ? { warn: true } : {}) },
  };

  const componentOk: Record<string, boolean> = {
    postgres: pgR.ok,
    gluecron: gcR.ok,
    gatetest: gtR.ok,
    caddy_cert: certR.ok,
    disk_free_pct: diskR.ok,
  };

  const allOk = Object.values(componentOk).every(Boolean);
  const criticalDown = Object.entries(componentOk).some(
    ([name, ok]) => !ok && CRITICAL.has(name),
  );

  const now = deps.now ?? ((): Date => new Date());
  const body: EmpireHealthResponse = {
    ok: allOk,
    timestamp: now().toISOString(),
    components,
  };

  return { body, status: criticalDown ? 503 : 200 };
}

/**
 * Build the Hono sub-app that owns `/healthz/empire`. Factory shape so the
 * test file can stub deps (db probe, HTTP fetches, cert, disk) without
 * touching the real network or filesystem.
 */
export function createEmpireHealthApp(deps: EmpireHealthDeps = {}): Hono {
  const getToken =
    deps.getToken ?? ((): string | undefined => process.env["HEALTH_CHECK_TOKEN"]);
  const app = new Hono();

  app.get("/healthz/empire", async (c) => {
    // ── Auth: bearer token ────────────────────────────────────────
    // We deliberately do NOT log the token, the provided header, or even
    // the fact that auth failed with a specific token suffix. The response
    // body is intentionally generic to avoid giving scanners a signal that
    // the endpoint exists at all beyond the 401.
    const secret = getToken();
    const provided = extractBearer(c.req.header("Authorization"));
    if (!secret || !provided || !timingSafeEqual(provided, secret)) {
      return c.json({ ok: false, error: "unauthorized" }, 401);
    }

    // ── Run the checks in parallel ───────────────────────────────
    const { body, status } = await runEmpireHealthCheck(deps);
    // Never cache this response — health must always be fresh.
    c.header("Cache-Control", "no-cache, no-store, must-revalidate");
    return c.json(body, status);
  });

  return app;
}
