import { describe, expect, test } from "bun:test";
import { createServer } from "../src/server";

const ADMIN = "supersecret";

function setup() {
  const now = { value: 1_700_000_000_000 };
  const srv = createServer({
    adminToken: ADMIN,
    now: () => now.value,
  });
  return { srv, now };
}

async function req(
  fetch: (r: Request) => Promise<Response>,
  method: string,
  path: string,
  init: { body?: unknown; auth?: boolean } = {},
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.auth) headers.authorization = `Bearer ${ADMIN}`;
  const r = await fetch(
    new Request(`http://test${path}`, {
      method,
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : null,
    }),
  );
  let body: unknown = null;
  const text = await r.text();
  if (text) body = JSON.parse(text);
  return { status: r.status, body };
}

describe("region admin endpoints", () => {
  test("POST /regions requires admin token", async () => {
    const { srv } = setup();
    const r = await req(srv.fetch, "POST", "/regions", {
      body: {
        id: "r1",
        code: "us",
        location: "Virginia",
        capacity: 10,
        currentLoad: 0,
        costPerHour: 0.05,
      },
    });
    expect(r.status).toBe(401);
  });

  test("POST /regions creates with valid token", async () => {
    const { srv } = setup();
    const r = await req(srv.fetch, "POST", "/regions", {
      auth: true,
      body: {
        id: "r1",
        code: "us-east",
        location: "Virginia",
        capacity: 10,
        currentLoad: 0,
        costPerHour: 0.05,
      },
    });
    expect(r.status).toBe(201);
  });

  test("GET /regions is public read", async () => {
    const { srv } = setup();
    await req(srv.fetch, "POST", "/regions", {
      auth: true,
      body: {
        id: "r1",
        code: "us-east",
        location: "Virginia",
        capacity: 10,
        currentLoad: 0,
        costPerHour: 0.05,
      },
    });
    const r = await req(srv.fetch, "GET", "/regions");
    expect(r.status).toBe(200);
    expect((r.body as { regions: unknown[] }).regions).toHaveLength(1);
  });

  test("DELETE /regions/:id requires admin", async () => {
    const { srv } = setup();
    const r = await req(srv.fetch, "DELETE", "/regions/r1");
    expect(r.status).toBe(401);
  });

  test("DELETE /regions/:id returns 404 when missing", async () => {
    const { srv } = setup();
    const r = await req(srv.fetch, "DELETE", "/regions/r1", { auth: true });
    expect(r.status).toBe(404);
  });
});

describe("service state + decision endpoints", () => {
  test("POST /services/:id/state then GET /decision", async () => {
    const { srv } = setup();
    await req(srv.fetch, "POST", "/regions", {
      auth: true,
      body: {
        id: "us",
        code: "us",
        location: "x",
        capacity: 100,
        currentLoad: 0,
        costPerHour: 1,
      },
    });
    const submit = await req(srv.fetch, "POST", "/services/svc/state", {
      body: {
        states: [
          {
            serviceId: "svc",
            regionId: "us",
            instanceCount: 1,
            lastScaleEventAt: 0,
          },
        ],
        recentTraffic: [
          {
            timestamp: 1_700_000_000_000 - 1000,
            regionId: "us",
            qps: 500,
            p95LatencyMs: 50,
          },
        ],
        latencyBudgetMs: 200,
        costBudgetUsdPerHour: 100,
        targetQpsPerInstance: 100,
      },
    });
    expect(submit.status).toBe(200);

    const dec = await req(srv.fetch, "GET", "/services/svc/decision");
    expect(dec.status).toBe(200);
    const body = dec.body as { actions: { regionId: string }[] };
    expect(body.actions.length).toBeGreaterThan(0);
  });

  test("GET /decision returns 404 when service unknown", async () => {
    const { srv } = setup();
    const r = await req(srv.fetch, "GET", "/services/nope/decision");
    expect(r.status).toBe(404);
  });

  test("GET /predictions returns series", async () => {
    const { srv } = setup();
    await req(srv.fetch, "POST", "/regions", {
      auth: true,
      body: {
        id: "us",
        code: "us",
        location: "x",
        capacity: 100,
        currentLoad: 0,
        costPerHour: 1,
      },
    });
    await req(srv.fetch, "POST", "/services/svc/state", {
      body: {
        states: [
          {
            serviceId: "svc",
            regionId: "us",
            instanceCount: 1,
            lastScaleEventAt: 0,
          },
        ],
        recentTraffic: [
          {
            timestamp: 1_700_000_000_000 - 1000,
            regionId: "us",
            qps: 50,
            p95LatencyMs: 30,
          },
        ],
        latencyBudgetMs: 200,
        costBudgetUsdPerHour: 100,
        targetQpsPerInstance: 100,
      },
    });
    const r = await req(srv.fetch, "GET", "/services/svc/predictions");
    expect(r.status).toBe(200);
    const body = r.body as { points: unknown[] };
    expect(body.points.length).toBeGreaterThan(0);
  });

  test("invalid state body rejected with 400", async () => {
    const { srv } = setup();
    const r = await req(srv.fetch, "POST", "/services/svc/state", {
      body: { not: "valid" },
    });
    expect(r.status).toBe(400);
  });

  test("unknown route returns 404", async () => {
    const { srv } = setup();
    const r = await req(srv.fetch, "GET", "/nonsense");
    expect(r.status).toBe(404);
  });
});
