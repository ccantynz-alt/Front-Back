/**
 * Integration tests for the `/healthz/empire` Hono route.
 *
 * Exercises the full wiring (auth → parallel checks → status code derivation)
 * against an in-process Hono app with every dependency stubbed. No real
 * database, network, TLS, or filesystem access.
 */

import { describe, test, expect } from "bun:test";
import {
  createEmpireHealthApp,
  runEmpireHealthCheck,
  type EmpireHealthDeps,
} from "./empire";

function fakeDeps(overrides: Partial<EmpireHealthDeps> = {}): EmpireHealthDeps {
  return {
    getToken: () => "s3cret-token",
    checkPostgres: async () => ({ ok: true, latency_ms: 3 }),
    checkGluecron: async () => ({
      ok: true,
      url: "https://gluecron.crontech.ai/healthz",
      latency_ms: 42,
      status: 200,
    }),
    checkGatetest: async () => ({
      ok: true,
      url: "https://gatetest.ai/healthz",
      latency_ms: 120,
      status: 200,
    }),
    checkCert: async () => ({
      ok: true,
      expires: "2026-07-14",
      days_left: 86,
    }),
    checkDisk: async () => ({ ok: true, value: 82.3 }),
    now: () => new Date("2026-04-19T10:40:00Z"),
    ...overrides,
  };
}

// ── Auth ────────────────────────────────────────────────────────────

describe("GET /healthz/empire — auth", () => {
  test("returns 401 when no Authorization header is present", async () => {
    const app = createEmpireHealthApp(fakeDeps());
    const res = await app.request("/healthz/empire");
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
  });

  test("returns 401 when bearer token is wrong", async () => {
    const app = createEmpireHealthApp(fakeDeps());
    const res = await app.request("/healthz/empire", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });

  test("returns 401 when HEALTH_CHECK_TOKEN is unset even if a token is provided", async () => {
    const app = createEmpireHealthApp(
      fakeDeps({ getToken: () => undefined }),
    );
    const res = await app.request("/healthz/empire", {
      headers: { Authorization: "Bearer anything" },
    });
    expect(res.status).toBe(401);
  });

  test("returns 200 when bearer token matches", async () => {
    const app = createEmpireHealthApp(fakeDeps());
    const res = await app.request("/healthz/empire", {
      headers: { Authorization: "Bearer s3cret-token" },
    });
    expect(res.status).toBe(200);
  });

  test("never logs or echoes the token in the response body", async () => {
    const app = createEmpireHealthApp(fakeDeps());
    const res = await app.request("/healthz/empire", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    const text = await res.text();
    expect(text).not.toContain("s3cret-token");
    expect(text).not.toContain("wrong-token");
  });
});

// ── Happy path ──────────────────────────────────────────────────────

describe("GET /healthz/empire — all green", () => {
  test("returns 200 and ok=true with every component ok", async () => {
    const app = createEmpireHealthApp(fakeDeps());
    const res = await app.request("/healthz/empire", {
      headers: { Authorization: "Bearer s3cret-token" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      timestamp: string;
      components: Record<string, { ok: boolean }>;
    };
    expect(body.ok).toBe(true);
    expect(body.timestamp).toBe("2026-04-19T10:40:00.000Z");
    expect(body.components.postgres?.ok).toBe(true);
    expect(body.components.gluecron?.ok).toBe(true);
    expect(body.components.gatetest?.ok).toBe(true);
    expect(body.components.caddy_cert?.ok).toBe(true);
    expect(body.components.disk_free_pct?.ok).toBe(true);
  });

  test("sets cache-control: no-cache to keep health responses fresh", async () => {
    const app = createEmpireHealthApp(fakeDeps());
    const res = await app.request("/healthz/empire", {
      headers: { Authorization: "Bearer s3cret-token" },
    });
    expect(res.headers.get("cache-control")).toContain("no-cache");
  });
});

// ── Critical component failures → 503 ───────────────────────────────

describe("GET /healthz/empire — critical failures", () => {
  test("returns 503 when postgres is down", async () => {
    const app = createEmpireHealthApp(
      fakeDeps({
        checkPostgres: async () => ({
          ok: false,
          latency_ms: 0,
          error: "connection refused",
        }),
      }),
    );
    const res = await app.request("/healthz/empire", {
      headers: { Authorization: "Bearer s3cret-token" },
    });
    expect(res.status).toBe(503);
    const body = (await res.json()) as {
      ok: boolean;
      components: { postgres: { ok: boolean; error?: string } };
    };
    expect(body.ok).toBe(false);
    expect(body.components.postgres.ok).toBe(false);
    expect(body.components.postgres.error).toBe("connection refused");
  });

  test("returns 503 when disk is reported as bad", async () => {
    const app = createEmpireHealthApp(
      fakeDeps({
        checkDisk: async () => ({
          ok: false,
          error: "disk critically full",
        }),
      }),
    );
    const res = await app.request("/healthz/empire", {
      headers: { Authorization: "Bearer s3cret-token" },
    });
    expect(res.status).toBe(503);
  });
});

// ── Non-critical failures → 200 with ok=false ───────────────────────

describe("GET /healthz/empire — non-critical failures", () => {
  test("returns 200 with ok=false when gluecron is down but postgres+disk are up", async () => {
    const app = createEmpireHealthApp(
      fakeDeps({
        checkGluecron: async () => ({
          ok: false,
          url: "https://gluecron.crontech.ai/healthz",
          latency_ms: 3000,
          error: "timeout",
        }),
      }),
    );
    const res = await app.request("/healthz/empire", {
      headers: { Authorization: "Bearer s3cret-token" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      components: { gluecron: { ok: boolean; error?: string } };
    };
    expect(body.ok).toBe(false);
    expect(body.components.gluecron.ok).toBe(false);
  });

  test("returns 200 with ok=false when gatetest is unreachable", async () => {
    const app = createEmpireHealthApp(
      fakeDeps({
        checkGatetest: async () => ({
          ok: false,
          url: "https://gatetest.ai/healthz",
          latency_ms: 3000,
          error: "ENOTFOUND",
        }),
      }),
    );
    const res = await app.request("/healthz/empire", {
      headers: { Authorization: "Bearer s3cret-token" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(false);
  });

  test("returns 200 with ok=false when caddy cert is expired", async () => {
    const app = createEmpireHealthApp(
      fakeDeps({
        checkCert: async () => ({
          ok: false,
          expires: "2026-04-01",
          days_left: -18,
          error: "certificate expired",
        }),
      }),
    );
    const res = await app.request("/healthz/empire", {
      headers: { Authorization: "Bearer s3cret-token" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      components: { caddy_cert: { ok: boolean; days_left?: number } };
    };
    expect(body.ok).toBe(false);
    expect(body.components.caddy_cert.days_left).toBeLessThan(0);
  });
});

// ── Warn flags ─────────────────────────────────────────────────────

describe("GET /healthz/empire — warn flags", () => {
  test("flags cert warn=true when days_left < 14 but cert still valid", async () => {
    const app = createEmpireHealthApp(
      fakeDeps({
        checkCert: async () => ({
          ok: true,
          expires: "2026-04-26",
          days_left: 7,
        }),
      }),
    );
    const res = await app.request("/healthz/empire", {
      headers: { Authorization: "Bearer s3cret-token" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      components: { caddy_cert: { ok: boolean; warn?: boolean } };
    };
    expect(body.ok).toBe(true);
    expect(body.components.caddy_cert.warn).toBe(true);
  });

  test("flags disk warn=true when free pct < 15 but > 1", async () => {
    const app = createEmpireHealthApp(
      fakeDeps({
        checkDisk: async () => ({ ok: true, value: 8.4 }),
      }),
    );
    const res = await app.request("/healthz/empire", {
      headers: { Authorization: "Bearer s3cret-token" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      components: { disk_free_pct: { warn?: boolean } };
    };
    expect(body.components.disk_free_pct.warn).toBe(true);
  });
});

// ── Direct runEmpireHealthCheck() shape ─────────────────────────────

describe("runEmpireHealthCheck() — shape contract", () => {
  test("emits the exact component keys named in the spec", async () => {
    const { body } = await runEmpireHealthCheck(fakeDeps());
    const keys = Object.keys(body.components).sort();
    expect(keys).toEqual(
      [
        "caddy_cert",
        "disk_free_pct",
        "gatetest",
        "gluecron",
        "postgres",
      ].sort(),
    );
  });

  test("returns status=503 only when a critical component is down", async () => {
    const allOk = await runEmpireHealthCheck(fakeDeps());
    expect(allOk.status).toBe(200);

    const nonCritDown = await runEmpireHealthCheck(
      fakeDeps({
        checkGluecron: async () => ({
          ok: false,
          url: "https://gluecron.crontech.ai/healthz",
          latency_ms: 0,
          error: "down",
        }),
      }),
    );
    expect(nonCritDown.status).toBe(200);
    expect(nonCritDown.body.ok).toBe(false);

    const critDown = await runEmpireHealthCheck(
      fakeDeps({
        checkPostgres: async () => ({
          ok: false,
          latency_ms: 0,
          error: "down",
        }),
      }),
    );
    expect(critDown.status).toBe(503);
  });

  test("survives a check that throws (Promise.allSettled safety net)", async () => {
    const { body } = await runEmpireHealthCheck(
      fakeDeps({
        checkPostgres: () => Promise.reject(new Error("thrown synchronously")),
      }),
    );
    expect(body.ok).toBe(false);
    expect(body.components.postgres.ok).toBe(false);
    expect(body.components.postgres.error).toContain("thrown synchronously");
  });
});
