import { beforeEach, describe, expect, test } from "bun:test";
import { Dispatcher } from "./dispatcher";
import { JobRegistry } from "./registry";
import { Scheduler } from "./scheduler";
import { type ApiHandler, createApi } from "./server";

const TOKEN = "test-token";

function bootApi(): {
  api: ApiHandler;
  registry: JobRegistry;
  scheduler: Scheduler;
} {
  const registry = new JobRegistry();
  const dispatcher = new Dispatcher({
    transport: async () => ({ status: 200, body: "ok" }),
  });
  // Virtual clock so retry/backoff doesn't sleep wall-time during tests.
  const clock = {
    now: () => Date.now(),
    sleep: async () => {},
  };
  const scheduler = new Scheduler({ registry, dispatcher, clock });
  const api = createApi({ registry, scheduler, authToken: TOKEN });
  return { api, registry, scheduler };
}

function bootApiWithFailures(): { api: ApiHandler; registry: JobRegistry } {
  const registry = new JobRegistry();
  const dispatcher = new Dispatcher({
    transport: async () => ({ status: 500, body: "fail" }),
  });
  const clock = {
    now: () => Date.now(),
    sleep: async () => {},
  };
  const scheduler = new Scheduler({ registry, dispatcher, clock });
  const api = createApi({ registry, scheduler, authToken: TOKEN });
  return { api, registry };
}

function authedRequest(
  method: string,
  url: string,
  body?: unknown,
): Request {
  const init: RequestInit = {
    method,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  return new Request(url, init);
}

describe("HTTP API", () => {
  let api: ApiHandler;
  let registry: JobRegistry;

  beforeEach(() => {
    const booted = bootApi();
    api = booted.api;
    registry = booted.registry;
  });

  test("rejects requests missing the bearer token", async () => {
    const res = await api.fetch(
      new Request("http://x/jobs", { method: "GET" }),
    );
    expect(res.status).toBe(401);
  });

  test("creates a job and returns next-fire preview", async () => {
    const res = await api.fetch(
      authedRequest("POST", "http://x/jobs", {
        tenantId: "tenant-a",
        cronExpr: "@hourly",
        target: { type: "webhook", endpoint: "https://example.test/x" },
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      job: { jobId: string; nextRunAt: number | null };
      nextFires: number[];
    };
    expect(body.job.jobId).toBeTruthy();
    expect(body.nextFires).toHaveLength(5);
    expect(registry.getJob(body.job.jobId)).toBeTruthy();
  });

  test("rejects malformed cron expressions with 400", async () => {
    const res = await api.fetch(
      authedRequest("POST", "http://x/jobs", {
        tenantId: "tenant-a",
        cronExpr: "this is not cron",
        target: { type: "webhook", endpoint: "https://example.test/x" },
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_cron");
  });

  test("pause/resume/delete lifecycle", async () => {
    const created = await api.fetch(
      authedRequest("POST", "http://x/jobs", {
        tenantId: "tenant-a",
        cronExpr: "@daily",
        target: { type: "webhook", endpoint: "https://example.test/x" },
      }),
    );
    const { job } = (await created.json()) as { job: { jobId: string } };

    const paused = await api.fetch(
      authedRequest("POST", `http://x/jobs/${job.jobId}/pause`),
    );
    expect(paused.status).toBe(200);
    expect(registry.getJob(job.jobId)?.status).toBe("paused");

    const resumed = await api.fetch(
      authedRequest("POST", `http://x/jobs/${job.jobId}/resume`),
    );
    expect(resumed.status).toBe(200);
    expect(registry.getJob(job.jobId)?.status).toBe("active");

    const deleted = await api.fetch(
      authedRequest("DELETE", `http://x/jobs/${job.jobId}`),
    );
    expect(deleted.status).toBe(200);
    expect(registry.getJob(job.jobId)).toBeUndefined();
  });

  test("manual trigger executes the job", async () => {
    const created = await api.fetch(
      authedRequest("POST", "http://x/jobs", {
        tenantId: "tenant-a",
        cronExpr: "0 0 1 1 *",
        target: { type: "webhook", endpoint: "https://example.test/x" },
      }),
    );
    const { job } = (await created.json()) as { job: { jobId: string } };

    const triggered = await api.fetch(
      authedRequest("POST", `http://x/jobs/${job.jobId}/trigger`),
    );
    expect(triggered.status).toBe(202);
    const runs = registry.listRuns(job.jobId);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("ok");
  });

  test("lists runs with `since` filter", async () => {
    const created = await api.fetch(
      authedRequest("POST", "http://x/jobs", {
        tenantId: "tenant-a",
        cronExpr: "0 0 1 1 *",
        target: { type: "webhook", endpoint: "https://example.test/x" },
      }),
    );
    const { job } = (await created.json()) as { job: { jobId: string } };

    await api.fetch(
      authedRequest("POST", `http://x/jobs/${job.jobId}/trigger`),
    );
    const list = await api.fetch(
      authedRequest("GET", `http://x/jobs/${job.jobId}/runs`),
    );
    const body = (await list.json()) as { runs: { runId: string }[] };
    expect(body.runs.length).toBeGreaterThan(0);
  });

  test("dead-letter endpoint returns failures filtered by tenant", async () => {
    const failingApi = bootApiWithFailures();
    const created = await failingApi.api.fetch(
      authedRequest("POST", "http://x/jobs", {
        tenantId: "tenant-z",
        cronExpr: "0 0 1 1 *",
        target: { type: "webhook", endpoint: "https://example.test/x" },
        retryPolicy: { maxAttempts: 1, backoffMs: 0 },
      }),
    );
    const { job } = (await created.json()) as { job: { jobId: string } };
    await failingApi.api.fetch(
      authedRequest("POST", `http://x/jobs/${job.jobId}/trigger`),
    );

    const dead = await failingApi.api.fetch(
      authedRequest("GET", "http://x/dead-letter?tenantId=tenant-z"),
    );
    const body = (await dead.json()) as { deadLetter: unknown[] };
    expect(body.deadLetter).toHaveLength(1);
  });

  test("returns 404 for unknown job", async () => {
    const res = await api.fetch(
      authedRequest("GET", "http://x/jobs/does-not-exist"),
    );
    expect(res.status).toBe(404);
  });

  test("health endpoint returns 200", async () => {
    const res = await api.fetch(authedRequest("GET", "http://x/health"));
    expect(res.status).toBe(200);
  });
});
