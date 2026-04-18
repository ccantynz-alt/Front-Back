/**
 * Unit tests for the Gluecron push-notification receiver.
 *
 * Follows the conventions established in `dispatcher.test.ts`:
 *   - real drizzle client pointed at the test sqlite DB (the bunfig preload
 *     wipes + re-migrates before the suite runs).
 *   - inject overrides via `createGluecronPushApp({ ... })` so we can mock
 *     the orchestrator `deploy` trigger and the bearer secret without
 *     mutating global state.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db, tenantGitRepos, tenants } from "@back-to-the-future/db";
import {
  createGluecronPushApp,
  timingSafeEqual,
  type GluecronHookDeps,
} from "./gluecron-push";

// ── Fixture helpers ─────────────────────────────────────────────────

const SECRET = "whsec_gluecron_test_secret_1234567890";
const REPO = "ccantynz-alt/example-app";
const VALID_SHA = "a".repeat(40);

async function resetTables(): Promise<void> {
  await db.delete(tenantGitRepos);
  await db.delete(tenants);
}

async function ensureTenant(id = "tenant-test"): Promise<string> {
  const existing = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  if (existing.length === 0) {
    await db.insert(tenants).values({
      id,
      name: "Test Tenant",
      slug: `slug-${id}`,
      plan: "free",
      ownerEmail: "owner@example.test",
      status: "active",
      createdAt: new Date(),
    });
  }
  return id;
}

async function seedRepo(
  overrides: Partial<{
    repository: string;
    autoDeploy: boolean;
    envVars: string | null;
    runtime: string;
  }> = {},
): Promise<string> {
  const tenantId = await ensureTenant();
  const id = crypto.randomUUID();
  await db.insert(tenantGitRepos).values({
    id,
    tenantId,
    repository: overrides.repository ?? REPO,
    appName: "example-app",
    branch: "main",
    domain: "example-app.crontech.ai",
    port: 3000,
    runtime: overrides.runtime ?? "bun",
    envVars: overrides.envVars ?? JSON.stringify({ FOO: "bar" }),
    autoDeploy: overrides.autoDeploy ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return id;
}

interface DeployCall {
  appName: string;
  repoUrl: string;
  branch: string;
  runtime: string;
}

const NO_SECRET = Symbol("NO_SECRET");

function makeDeps(
  overrides: {
    deployResult?: { containerId: string };
    deployError?: Error;
    secret?: string | typeof NO_SECRET;
  } = {},
): { deps: GluecronHookDeps; calls: DeployCall[] } {
  const calls: DeployCall[] = [];
  const deps: GluecronHookDeps = {
    db,
    getSecret: () => {
      if (overrides.secret === NO_SECRET) return undefined;
      if (overrides.secret === undefined) return SECRET;
      return overrides.secret;
    },
    deploy: async (input) => {
      calls.push({
        appName: input.appName,
        repoUrl: input.repoUrl,
        branch: input.branch,
        runtime: input.runtime,
      });
      if (overrides.deployError) throw overrides.deployError;
      return overrides.deployResult ?? { containerId: "ctr_fake_123" };
    },
  };
  return { deps, calls };
}

function validPayload(overrides: Partial<Record<string, unknown>> = {}): string {
  return JSON.stringify({
    repository: REPO,
    sha: VALID_SHA,
    branch: "main",
    ref: "refs/heads/main",
    source: "gluecron",
    timestamp: "2026-04-15T12:00:00Z",
    ...overrides,
  });
}

function makeRequest(body: string, auth?: string): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth !== undefined) headers["Authorization"] = auth;
  return new Request("http://localhost/hooks/gluecron/push", {
    method: "POST",
    headers,
    body,
  });
}

// ── Tests ───────────────────────────────────────────────────────────

describe("timingSafeEqual", () => {
  test("returns true for equal strings", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
  });
  test("returns false for different same-length strings", () => {
    expect(timingSafeEqual("abc", "abd")).toBe(false);
  });
  test("returns false for different-length strings", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});

describe("POST /hooks/gluecron/push — auth", () => {
  beforeEach(async () => {
    await resetTables();
  });

  test("401 when Authorization header is missing", async () => {
    const { deps } = makeDeps();
    const app = createGluecronPushApp(deps);
    const res = await app.fetch(makeRequest(validPayload()));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthorized");
  });

  test("401 when Bearer token is wrong", async () => {
    const { deps } = makeDeps();
    const app = createGluecronPushApp(deps);
    const res = await app.fetch(
      makeRequest(validPayload(), "Bearer wrong_secret_xxx"),
    );
    expect(res.status).toBe(401);
  });

  test("401 when secret is unset on the server", async () => {
    const { deps } = makeDeps({ secret: NO_SECRET });
    const app = createGluecronPushApp(deps);
    const res = await app.fetch(
      makeRequest(validPayload(), `Bearer ${SECRET}`),
    );
    expect(res.status).toBe(401);
  });

  test("accepts a correct bearer token", async () => {
    await seedRepo();
    const { deps } = makeDeps();
    const app = createGluecronPushApp(deps);
    const res = await app.fetch(
      makeRequest(validPayload(), `Bearer ${SECRET}`),
    );
    expect(res.status).toBe(200);
  });
});

describe("POST /hooks/gluecron/push — payload validation", () => {
  beforeEach(async () => {
    await resetTables();
  });

  test("400 when body is not JSON", async () => {
    const { deps } = makeDeps();
    const app = createGluecronPushApp(deps);
    const res = await app.fetch(
      makeRequest("not-json-at-all", `Bearer ${SECRET}`),
    );
    expect(res.status).toBe(400);
  });

  test("400 when required fields are missing", async () => {
    const { deps } = makeDeps();
    const app = createGluecronPushApp(deps);
    const res = await app.fetch(
      makeRequest(JSON.stringify({ repository: REPO }), `Bearer ${SECRET}`),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid payload");
  });

  test("400 when sha is not 40 hex chars", async () => {
    const { deps } = makeDeps();
    const app = createGluecronPushApp(deps);
    const res = await app.fetch(
      makeRequest(validPayload({ sha: "short" }), `Bearer ${SECRET}`),
    );
    expect(res.status).toBe(400);
  });

  test("400 when repository is not owner/name shape", async () => {
    const { deps } = makeDeps();
    const app = createGluecronPushApp(deps);
    const res = await app.fetch(
      makeRequest(validPayload({ repository: "justaname" }), `Bearer ${SECRET}`),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /hooks/gluecron/push — lookup + deploy", () => {
  beforeEach(async () => {
    await resetTables();
  });

  test("404 when repository is not configured", async () => {
    const { deps, calls } = makeDeps();
    const app = createGluecronPushApp(deps);
    const res = await app.fetch(
      makeRequest(
        validPayload({ repository: "unknown/repo" }),
        `Bearer ${SECRET}`,
      ),
    );
    expect(res.status).toBe(404);
    expect(calls.length).toBe(0);
  });

  test("200 skipped when autoDeploy is false", async () => {
    await seedRepo({ autoDeploy: false });
    const { deps, calls } = makeDeps();
    const app = createGluecronPushApp(deps);
    const res = await app.fetch(
      makeRequest(validPayload(), `Bearer ${SECRET}`),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      status: string;
      deploymentId: string;
    };
    expect(body.ok).toBe(true);
    expect(body.status).toBe("skipped");
    expect(body.deploymentId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(calls.length).toBe(0);
  });

  test("200 queued when autoDeploy is true, invokes orchestrator", async () => {
    await seedRepo({ autoDeploy: true });
    const { deps, calls } = makeDeps();
    const app = createGluecronPushApp(deps);
    const res = await app.fetch(
      makeRequest(validPayload(), `Bearer ${SECRET}`),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      status: string;
      deploymentId: string;
    };
    expect(body.ok).toBe(true);
    expect(body.status).toBe("queued");
    expect(body.deploymentId.length).toBeGreaterThan(10);

    // Orchestrator was called with the stored config values.
    expect(calls.length).toBe(1);
    expect(calls[0]!.appName).toBe("example-app");
    expect(calls[0]!.branch).toBe("main");
    expect(calls[0]!.runtime).toBe("bun");
    expect(calls[0]!.repoUrl).toBe(`https://github.com/${REPO}.git`);
  });

  test("502 when orchestrator deploy throws", async () => {
    await seedRepo({ autoDeploy: true });
    const { deps, calls } = makeDeps({
      deployError: new Error("orchestrator unreachable"),
    });
    const app = createGluecronPushApp(deps);
    const res = await app.fetch(
      makeRequest(validPayload(), `Bearer ${SECRET}`),
    );
    expect(res.status).toBe(502);
    expect(calls.length).toBe(1);
  });
});
