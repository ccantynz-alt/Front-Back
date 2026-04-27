// ── Sentinel: systemd heartbeat + flapping check ───────────────────
// Wave B2 (2026-04-27) — pairs with the Wave B2 systemd hardening pass
// in infra/bare-metal/. Every hardened crontech-* unit declares
//   OnFailure=crontech-failure-notify@%i.service
// which POSTs an event with `kind: "systemd_failure"` here.
//
// What this module owns:
//   1. POST /v1/events/heartbeat — accepts both kinds of events:
//      - kind:"alive"           → unit is healthy, refresh last-seen
//      - kind:"systemd_failure" → systemd flipped a unit to failed
//   2. A 60-second background loop:
//      - any unit whose last alive heartbeat is >5 min old → critical alert
//      - >3 systemd_failure events for one unit in 10 min  → flapping alert
//   3. Persistence to services/sentinel/data/heartbeats.json so a
//      Sentinel restart doesn't blank-slate the seen window.
//
// Alert delivery: Sentinel has no PagerDuty/Slack/email surface for
// systemd events yet (the existing alert path in alerts/types.ts is
// scoped to threat-analyzer output). Until that delivery surface
// ships, alerts go to console.error AND append to
// services/sentinel/data/alerts.jsonl with severity=critical so an
// out-of-band tail can pick them up.
//
// Registration: see registerSystemdHeartbeat() — called from index.ts
// next to startHealthServer(). The check is intentionally additive and
// does not touch the existing collector cycle.

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// ── Types ───────────────────────────────────────────────────────────

export type HeartbeatKind = "alive" | "systemd_failure";

export interface HeartbeatEvent {
  unit: string;
  host?: string;
  ts?: string;
  kind?: HeartbeatKind;
}

interface UnitState {
  lastAliveMs: number | null;
  failures: number[]; // unix-ms timestamps of recent systemd_failure events
  lastFailureAt: string | null;
  lastAliveAt: string | null;
}

interface PersistedShape {
  version: 1;
  units: Record<string, UnitState>;
  savedAt: string;
}

// ── Tunables (kept module-private; can be overridden via env later) ─

const STALE_AFTER_MS = 5 * 60 * 1000; // 5 minutes — task spec
const FLAPPING_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const FLAPPING_THRESHOLD = 3;
const SCAN_INTERVAL_MS = 60 * 1000; // 60 seconds — task spec
const DATA_DIR = resolve(process.cwd(), "services/sentinel/data");
const PERSIST_PATH = resolve(DATA_DIR, "heartbeats.json");
const ALERTS_PATH = resolve(DATA_DIR, "alerts.jsonl");

// ── State ───────────────────────────────────────────────────────────

const state = new Map<string, UnitState>();
const recentlyAlerted = new Map<string, number>(); // unit -> last-alert-at-ms
const ALERT_DEDUPE_MS = STALE_AFTER_MS; // re-alert no more than once per 5 min

function getOrCreate(unit: string): UnitState {
  let s = state.get(unit);
  if (!s) {
    s = { lastAliveMs: null, failures: [], lastFailureAt: null, lastAliveAt: null };
    state.set(unit, s);
  }
  return s;
}

// ── Persistence ─────────────────────────────────────────────────────

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadHeartbeats(): void {
  try {
    if (!existsSync(PERSIST_PATH)) return;
    const raw = readFileSync(PERSIST_PATH, "utf8");
    const parsed = JSON.parse(raw) as PersistedShape;
    if (parsed?.version !== 1 || typeof parsed.units !== "object") return;
    for (const [unit, s] of Object.entries(parsed.units)) {
      state.set(unit, {
        lastAliveMs: s.lastAliveMs ?? null,
        failures: Array.isArray(s.failures) ? s.failures : [],
        lastFailureAt: s.lastFailureAt ?? null,
        lastAliveAt: s.lastAliveAt ?? null,
      });
    }
  } catch (err) {
    console.warn(`[sentinel:heartbeat] failed to load ${PERSIST_PATH}:`, err);
  }
}

function persistHeartbeats(): void {
  try {
    ensureDataDir();
    const payload: PersistedShape = {
      version: 1,
      units: Object.fromEntries(state.entries()),
      savedAt: new Date().toISOString(),
    };
    writeFileSync(PERSIST_PATH, JSON.stringify(payload, null, 2));
  } catch (err) {
    console.warn(`[sentinel:heartbeat] failed to persist ${PERSIST_PATH}:`, err);
  }
}

// ── Event ingest ────────────────────────────────────────────────────

export function recordHeartbeat(event: HeartbeatEvent): void {
  if (typeof event.unit !== "string" || event.unit.length === 0) return;
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const s = getOrCreate(event.unit);

  if (event.kind === "systemd_failure") {
    s.failures.push(now);
    // Trim to the flapping window so the array can't grow unbounded.
    s.failures = s.failures.filter((t) => now - t <= FLAPPING_WINDOW_MS);
    s.lastFailureAt = nowIso;
    console.warn(
      `[sentinel:heartbeat] systemd_failure event for ${event.unit} (host=${event.host ?? "?"})`,
    );
  } else {
    // Default to "alive" when caller omits kind. Heartbeat collectors,
    // sidecar pings, and ad-hoc curl from operators all land here.
    s.lastAliveMs = now;
    s.lastAliveAt = nowIso;
  }

  persistHeartbeats();
}

// ── Alert sink ──────────────────────────────────────────────────────

interface SystemdAlert {
  severity: "critical";
  kind: "systemd_unit_stale" | "systemd_unit_flapping";
  unit: string;
  details: Record<string, unknown>;
  firedAt: string;
}

function fireAlert(alert: SystemdAlert): void {
  // Console first — journald picks this up via the systemd unit.
  console.error(
    `[sentinel:heartbeat] ALERT severity=${alert.severity} kind=${alert.kind} unit=${alert.unit} details=${JSON.stringify(alert.details)}`,
  );
  // Then append to data/alerts.jsonl as the durable surface until the
  // Sentinel project ships a real outbound delivery channel for systemd
  // events (PagerDuty / Slack / email). See PR description.
  try {
    ensureDataDir();
    appendFileSync(ALERTS_PATH, `${JSON.stringify(alert)}\n`);
  } catch (err) {
    console.warn(`[sentinel:heartbeat] failed to append ${ALERTS_PATH}:`, err);
  }
}

// ── Background scan ─────────────────────────────────────────────────

export function scanOnce(now = Date.now()): void {
  for (const [unit, s] of state.entries()) {
    // Stale-alive check: skip units we've never seen alive (no false
    // positives at boot before the first heartbeat lands).
    if (s.lastAliveMs !== null && now - s.lastAliveMs > STALE_AFTER_MS) {
      const lastAlertAt = recentlyAlerted.get(`stale:${unit}`) ?? 0;
      if (now - lastAlertAt > ALERT_DEDUPE_MS) {
        fireAlert({
          severity: "critical",
          kind: "systemd_unit_stale",
          unit,
          details: {
            lastAliveAt: s.lastAliveAt,
            ageMs: now - s.lastAliveMs,
            thresholdMs: STALE_AFTER_MS,
          },
          firedAt: new Date(now).toISOString(),
        });
        recentlyAlerted.set(`stale:${unit}`, now);
      }
    }

    // Flapping check: trim failures to window first, then count.
    s.failures = s.failures.filter((t) => now - t <= FLAPPING_WINDOW_MS);
    if (s.failures.length > FLAPPING_THRESHOLD) {
      const lastAlertAt = recentlyAlerted.get(`flap:${unit}`) ?? 0;
      if (now - lastAlertAt > ALERT_DEDUPE_MS) {
        fireAlert({
          severity: "critical",
          kind: "systemd_unit_flapping",
          unit,
          details: {
            failures: s.failures.length,
            windowMs: FLAPPING_WINDOW_MS,
            threshold: FLAPPING_THRESHOLD,
            lastFailureAt: s.lastFailureAt,
          },
          firedAt: new Date(now).toISOString(),
        });
        recentlyAlerted.set(`flap:${unit}`, now);
      }
    }
  }
}

// ── HTTP wiring ─────────────────────────────────────────────────────
// index.ts owns Bun.serve. Call handleHeartbeatRequest from inside the
// fetch() switch when the path matches /v1/events/heartbeat.

export async function handleHeartbeatRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const event = body as HeartbeatEvent;
  if (typeof event.unit !== "string" || event.unit.length === 0) {
    return Response.json({ error: "missing_unit" }, { status: 400 });
  }
  recordHeartbeat(event);
  return Response.json({ ok: true, unit: event.unit, kind: event.kind ?? "alive" });
}

// ── Registration ────────────────────────────────────────────────────
// Single-line entry point for index.ts. Loads persisted state and starts
// the 60s scan loop. The HTTP handler is exported separately because
// Sentinel's Bun.serve() lives in index.ts; that file inspects the path
// and dispatches to handleHeartbeatRequest().

let scanTimer: ReturnType<typeof setInterval> | null = null;

export function registerSystemdHeartbeat(): void {
  loadHeartbeats();
  if (scanTimer === null) {
    scanTimer = setInterval(() => {
      try {
        scanOnce();
      } catch (err) {
        console.error(`[sentinel:heartbeat] scan failed:`, err);
      }
    }, SCAN_INTERVAL_MS);
    // Don't keep the Bun event loop alive purely for this timer.
    if (typeof scanTimer.unref === "function") {
      scanTimer.unref();
    }
  }
  console.info(
    `[sentinel:heartbeat] registered — stale>${STALE_AFTER_MS / 1000}s, flap>${FLAPPING_THRESHOLD}/${FLAPPING_WINDOW_MS / 1000}s, scan=${SCAN_INTERVAL_MS / 1000}s`,
  );
}

// Exposed for tests / manual inspection (not used by index.ts).
export function _resetForTests(): void {
  state.clear();
  recentlyAlerted.clear();
  if (scanTimer !== null) {
    clearInterval(scanTimer);
    scanTimer = null;
  }
}

export function _snapshotForTests(): Record<string, UnitState> {
  return Object.fromEntries(state.entries());
}
