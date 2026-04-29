// ── git-webhook · receiver tests ────────────────────────────────────────
//
// Covers every requirement from the brief:
//   * signature validation – good and bad
//   * branch filter
//   * idempotency dedup
//   * replay rejection
//   * non-push event ignore
//   * BuildRequested schema shape
//   * health endpoint
//
// Tests use the in-memory transport so we never make a real HTTP call.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  BuildRequestedSchema,
  computeSignature,
  createReceiver,
  InMemoryDedupStore,
  InMemoryTenantConfigStore,
  InProcessTransport,
  resolveEnvironment,
  TenantWebhookConfigSchema,
  type BuildRequested,
} from "../src/index";

const TENANT = TenantWebhookConfigSchema.parse({
  tenantId: "tenant-alpha",
  repo: "ccantynz-alt/crontech",
  secret: "super-secret-test-value",
  branchEnvironments: { main: "production", staging: "preview" },
  defaultEnvironment: "preview",
});

function makePushPayload(overrides: Partial<{
  ref: string;
  after: string;
  deleted: boolean;
  pusherName: string;
  pusherEmail: string;
  repo: string;
}> = {}): string {
  const payload = {
    ref: overrides.ref ?? "refs/heads/main",
    after: overrides.after ?? "abc123def456abc123def456abc123def456abcd",
    deleted: overrides.deleted ?? false,
    pusher: {
      name: overrides.pusherName ?? "octocat",
      email: overrides.pusherEmail ?? "octo@example.com",
    },
    repository: {
      full_name: overrides.repo ?? TENANT.repo,
    },
    head_commit: { id: "abc123def456abc123def456abc123def456abcd" },
  };
  return JSON.stringify(payload);
}

interface Harness {
  app: ReturnType<typeof createReceiver>["app"];
  transport: InProcessTransport;
  received: BuildRequested[];
  fixedNow: Date;
}

function makeHarness(opts: { now?: Date } = {}): Harness {
  const transport = new InProcessTransport();
  const received: BuildRequested[] = [];
  transport.subscribe((e) => {
    received.push(e);
  });
  const tenantStore = new InMemoryTenantConfigStore([TENANT]);
  const dedupStore = new InMemoryDedupStore({ ttlMs: 60_000 });
  const fixedNow = opts.now ?? new Date("2026-04-28T12:00:00.000Z");
  const { app } = createReceiver({
    tenantStore,
    dedupStore,
    transport,
    now: () => fixedNow,
  });
  return { app, transport, received, fixedNow };
}

function buildRequest(opts: {
  body: string;
  signature?: string | undefined;
  event?: string;
  deliveryId?: string;
  tenantId?: string;
  webhookTime?: string;
  replay?: boolean;
}): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-github-event": opts.event ?? "push",
    "x-github-delivery": opts.deliveryId ?? crypto.randomUUID(),
  };
  if (opts.signature !== undefined) {
    headers["x-hub-signature-256"] = opts.signature;
  }
  if (opts.webhookTime !== undefined) {
    headers["x-crontech-webhook-time"] = opts.webhookTime;
  }
  if (opts.replay === true) {
    headers["x-crontech-replay"] = "1";
  }
  const tenantId = opts.tenantId ?? TENANT.tenantId;
  return new Request(`http://test/webhooks/github/${tenantId}`, {
    method: "POST",
    headers,
    body: opts.body,
  });
}

// ── tests ──────────────────────────────────────────────────────────────

describe("health endpoint", () => {
  test("returns 200 + service identity", async () => {
    const { app } = makeHarness();
    const res = await app.fetch(new Request("http://test/health"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["status"]).toBe("ok");
    expect(body["service"]).toBe("git-webhook");
    expect(typeof body["version"]).toBe("string");
    expect(typeof body["timestamp"]).toBe("string");
  });
});

describe("signature validation", () => {
  test("accepts a correctly-signed push", async () => {
    const harness = makeHarness();
    const body = makePushPayload();
    const sig = computeSignature(TENANT.secret, body);
    const res = await harness.app.fetch(
      buildRequest({ body, signature: sig }),
    );
    expect(res.status).toBe(202);
    expect(harness.received).toHaveLength(1);
    expect(harness.received[0]?.environment).toBe("production");
  });

  test("rejects when signature is missing", async () => {
    const harness = makeHarness();
    const body = makePushPayload();
    const res = await harness.app.fetch(buildRequest({ body }));
    expect(res.status).toBe(401);
    expect(harness.received).toHaveLength(0);
  });

  test("rejects when signature is wrong", async () => {
    const harness = makeHarness();
    const body = makePushPayload();
    const sig = computeSignature("the-wrong-secret", body);
    const res = await harness.app.fetch(
      buildRequest({ body, signature: sig }),
    );
    expect(res.status).toBe(401);
    expect(harness.received).toHaveLength(0);
  });

  test("rejects when signature uses unsupported algorithm prefix", async () => {
    const harness = makeHarness();
    const body = makePushPayload();
    // sha1= prefix is the legacy GitHub format — we deliberately do not
    // accept it.
    const res = await harness.app.fetch(
      buildRequest({ body, signature: "sha1=deadbeef" }),
    );
    expect(res.status).toBe(401);
    expect(harness.received).toHaveLength(0);
  });
});

describe("branch filter", () => {
  test("drops branches not in the routing map with 202", async () => {
    const harness = makeHarness();
    const body = makePushPayload({ ref: "refs/heads/feature/foo" });
    const sig = computeSignature(TENANT.secret, body);
    const res = await harness.app.fetch(
      buildRequest({ body, signature: sig }),
    );
    expect(res.status).toBe(202);
    const j = (await res.json()) as Record<string, unknown>;
    expect(j["status"]).toBe("ignored");
    expect(j["reason"]).toBe("branch_not_routed");
    expect(harness.received).toHaveLength(0);
  });

  test("staging branch routes to preview env", async () => {
    const harness = makeHarness();
    const body = makePushPayload({ ref: "refs/heads/staging" });
    const sig = computeSignature(TENANT.secret, body);
    const res = await harness.app.fetch(
      buildRequest({ body, signature: sig }),
    );
    expect(res.status).toBe(202);
    expect(harness.received).toHaveLength(1);
    expect(harness.received[0]?.environment).toBe("preview");
    expect(harness.received[0]?.branch).toBe("staging");
  });

  test("non-branch refs (tags) are dropped", async () => {
    const harness = makeHarness();
    const body = makePushPayload({ ref: "refs/tags/v1.0.0" });
    const sig = computeSignature(TENANT.secret, body);
    const res = await harness.app.fetch(
      buildRequest({ body, signature: sig }),
    );
    expect(res.status).toBe(202);
    expect(harness.received).toHaveLength(0);
  });

  test("branch deletes are ignored", async () => {
    const harness = makeHarness();
    const body = makePushPayload({ deleted: true });
    const sig = computeSignature(TENANT.secret, body);
    const res = await harness.app.fetch(
      buildRequest({ body, signature: sig }),
    );
    expect(res.status).toBe(202);
    const j = (await res.json()) as Record<string, unknown>;
    expect(j["reason"]).toBe("branch_deleted");
    expect(harness.received).toHaveLength(0);
  });
});

describe("idempotency dedup", () => {
  test("same delivery id twice does NOT enqueue twice", async () => {
    const harness = makeHarness();
    const body = makePushPayload();
    const sig = computeSignature(TENANT.secret, body);
    const deliveryId = "dedup-delivery-id-1";

    const r1 = await harness.app.fetch(
      buildRequest({ body, signature: sig, deliveryId }),
    );
    expect(r1.status).toBe(202);
    expect(harness.received).toHaveLength(1);

    const r2 = await harness.app.fetch(
      buildRequest({ body, signature: sig, deliveryId }),
    );
    expect(r2.status).toBe(200);
    const j = (await r2.json()) as Record<string, unknown>;
    expect(j["status"]).toBe("duplicate");
    expect(harness.received).toHaveLength(1);
  });
});

describe("replay protection", () => {
  test("delivery older than the replay window is rejected", async () => {
    const harness = makeHarness({
      now: new Date("2026-04-28T12:00:00.000Z"),
    });
    const body = makePushPayload();
    const sig = computeSignature(TENANT.secret, body);
    // 10 minutes earlier — well past the 5-minute window.
    const res = await harness.app.fetch(
      buildRequest({
        body,
        signature: sig,
        webhookTime: "2026-04-28T11:50:00.000Z",
      }),
    );
    expect(res.status).toBe(408);
    expect(harness.received).toHaveLength(0);
  });

  test("operator-initiated replay header bypasses the window", async () => {
    const harness = makeHarness({
      now: new Date("2026-04-28T12:00:00.000Z"),
    });
    const body = makePushPayload();
    const sig = computeSignature(TENANT.secret, body);
    const res = await harness.app.fetch(
      buildRequest({
        body,
        signature: sig,
        webhookTime: "2026-04-28T11:50:00.000Z",
        replay: true,
      }),
    );
    expect(res.status).toBe(202);
    expect(harness.received).toHaveLength(1);
  });

  test("recent delivery within the window is accepted", async () => {
    const harness = makeHarness({
      now: new Date("2026-04-28T12:00:00.000Z"),
    });
    const body = makePushPayload();
    const sig = computeSignature(TENANT.secret, body);
    const res = await harness.app.fetch(
      buildRequest({
        body,
        signature: sig,
        webhookTime: "2026-04-28T11:58:00.000Z",
      }),
    );
    expect(res.status).toBe(202);
    expect(harness.received).toHaveLength(1);
  });
});

describe("event filtering", () => {
  test("non-push events are ignored", async () => {
    const harness = makeHarness();
    const body = makePushPayload();
    const sig = computeSignature(TENANT.secret, body);
    const res = await harness.app.fetch(
      buildRequest({ body, signature: sig, event: "pull_request" }),
    );
    expect(res.status).toBe(202);
    const j = (await res.json()) as Record<string, unknown>;
    expect(j["status"]).toBe("ignored");
    expect(harness.received).toHaveLength(0);
  });

  test("ping events return pong (200)", async () => {
    const harness = makeHarness();
    const body = makePushPayload();
    const sig = computeSignature(TENANT.secret, body);
    const res = await harness.app.fetch(
      buildRequest({ body, signature: sig, event: "ping" }),
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as Record<string, unknown>;
    expect(j["status"]).toBe("pong");
    expect(harness.received).toHaveLength(0);
  });

  test("missing required GitHub headers returns 400", async () => {
    const harness = makeHarness();
    const body = makePushPayload();
    const sig = computeSignature(TENANT.secret, body);
    const req = new Request(`http://test/webhooks/github/${TENANT.tenantId}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sig,
        // x-github-event and x-github-delivery deliberately omitted
      },
      body,
    });
    const res = await harness.app.fetch(req);
    expect(res.status).toBe(400);
  });

  test("unknown tenant returns 404", async () => {
    const harness = makeHarness();
    const body = makePushPayload();
    const sig = computeSignature(TENANT.secret, body);
    const res = await harness.app.fetch(
      buildRequest({ body, signature: sig, tenantId: "no-such-tenant" }),
    );
    expect(res.status).toBe(404);
    expect(harness.received).toHaveLength(0);
  });

  test("invalid JSON body returns 400", async () => {
    const harness = makeHarness();
    const body = "not-json{";
    const sig = computeSignature(TENANT.secret, body);
    const res = await harness.app.fetch(
      buildRequest({ body, signature: sig }),
    );
    expect(res.status).toBe(400);
  });
});

describe("BuildRequested contract", () => {
  test("emitted event matches schema and carries all required fields", async () => {
    const harness = makeHarness({
      now: new Date("2026-04-28T12:00:00.000Z"),
    });
    const body = makePushPayload({
      pusherName: "alice",
      pusherEmail: "alice@example.com",
      after: "deadbeefcafef00ddeadbeefcafef00ddeadbeef",
    });
    const sig = computeSignature(TENANT.secret, body);
    const res = await harness.app.fetch(
      buildRequest({ body, signature: sig, deliveryId: "delivery-xyz" }),
    );
    expect(res.status).toBe(202);
    expect(harness.received).toHaveLength(1);

    const event = harness.received[0];
    expect(event).toBeDefined();

    // The schema parse will throw if any field is wrong, so this is the
    // canonical contract assertion.
    const parsed = BuildRequestedSchema.parse(event);
    expect(parsed.deliveryId).toBe("delivery-xyz");
    expect(parsed.tenantId).toBe(TENANT.tenantId);
    expect(parsed.repo).toBe(TENANT.repo);
    expect(parsed.ref).toBe("refs/heads/main");
    expect(parsed.branch).toBe("main");
    expect(parsed.sha).toBe("deadbeefcafef00ddeadbeefcafef00ddeadbeef");
    expect(parsed.pusher).toEqual({
      name: "alice",
      email: "alice@example.com",
    });
    expect(parsed.environment).toBe("production");
    expect(parsed.timestamp).toBe("2026-04-28T12:00:00.000Z");
  });

  test("rejects pushes whose payload is missing required GitHub fields", async () => {
    const harness = makeHarness();
    // Has repository.full_name (required for tenant lookup) and ref but
    // lacks the rest of the push contract — this should 400 with schema
    // issues rather than silently enqueue.
    const body = JSON.stringify({
      ref: "refs/heads/main",
      // after, pusher missing
      repository: { full_name: TENANT.repo },
    });
    const sig = computeSignature(TENANT.secret, body);
    const res = await harness.app.fetch(
      buildRequest({ body, signature: sig }),
    );
    expect(res.status).toBe(400);
    expect(harness.received).toHaveLength(0);
  });
});

describe("environment resolution helper", () => {
  test("exact branch wins", () => {
    expect(resolveEnvironment(TENANT, "main")).toBe("production");
  });

  test("wildcard with explicit value", () => {
    const cfg = TenantWebhookConfigSchema.parse({
      tenantId: "t",
      repo: "o/r",
      secret: "secretsecret",
      branchEnvironments: { "*": "preview" },
    });
    expect(resolveEnvironment(cfg, "anything")).toBe("preview");
  });

  test("wildcard literal '*' falls back to defaultEnvironment", () => {
    const cfg = TenantWebhookConfigSchema.parse({
      tenantId: "t",
      repo: "o/r",
      secret: "secretsecret",
      branchEnvironments: { "*": "*" },
      defaultEnvironment: "review",
    });
    expect(resolveEnvironment(cfg, "anything")).toBe("review");
  });

  test("no match returns undefined", () => {
    expect(resolveEnvironment(TENANT, "no-such-branch")).toBeUndefined();
  });
});

describe("dedup store TTL", () => {
  let now = 0;
  const store = new InMemoryDedupStore({ ttlMs: 1_000, now: () => now });

  beforeEach(() => {
    now = 1_000_000;
  });
  afterEach(() => {
    // No teardown needed; new test resets `now`.
  });

  test("first record returns true, repeat returns false within TTL", () => {
    expect(store.recordIfFirst("a")).toBe(true);
    expect(store.recordIfFirst("a")).toBe(false);
  });

  test("same id after TTL elapses is treated as first again", () => {
    expect(store.recordIfFirst("b")).toBe(true);
    now += 10_000;
    expect(store.recordIfFirst("b")).toBe(true);
  });
});
