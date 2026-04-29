import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { parseRoute, startWorkerRuntime, type WorkerRuntimeServer } from "../src/index";
import {
  createFakeClock,
  createFakeSpawner,
  flushMicrotasks,
  noopPrepare,
} from "./helpers";

const TOKEN = "test-token-123456";
const VALID_SHA = "c".repeat(64);

let server: WorkerRuntimeServer | null = null;

beforeEach(() => {
  server = null;
});

afterEach(async () => {
  if (server !== null) await server.stop();
});

async function startTestServer(): Promise<{
  server: WorkerRuntimeServer;
  base: string;
  spawner: ReturnType<typeof createFakeSpawner>;
  clock: ReturnType<typeof createFakeClock>;
}> {
  const spawner = createFakeSpawner();
  const clock = createFakeClock();
  const s = await startWorkerRuntime({
    hostname: "127.0.0.1",
    port: 0, // OS-assigned
    token: TOKEN,
    spawn: spawner.spawner,
    prepare: noopPrepare,
    supervisorDefaults: { timers: clock, maxRestarts: 5 },
    logger: { error: () => {}, warn: () => {}, log: () => {} },
  });
  server = s;
  return { server: s, base: `http://${s.hostname}:${s.port}`, spawner, clock };
}

function authed(extra: Record<string, string> = {}): Record<string, string> {
  return { authorization: `Bearer ${TOKEN}`, ...extra };
}

function validRegistration(workerId: string): Record<string, unknown> {
  return {
    workerId,
    tenantId: "tenant-1",
    tarballUrl: "https://cdn.example.com/build.tar.gz",
    sha256: VALID_SHA,
    command: ["./run.sh"],
    restartPolicy: "on-failure",
  };
}

describe("parseRoute", () => {
  test("identifies known routes", () => {
    expect(parseRoute("GET", "/health")).toEqual({ kind: "health" });
    expect(parseRoute("GET", "/workers")).toEqual({ kind: "list" });
    expect(parseRoute("POST", "/workers")).toEqual({ kind: "register" });
    expect(parseRoute("GET", "/workers/abc")).toEqual({
      kind: "get",
      workerId: "abc",
    });
    expect(parseRoute("DELETE", "/workers/abc")).toEqual({
      kind: "delete",
      workerId: "abc",
    });
    expect(parseRoute("POST", "/workers/abc/start")).toEqual({
      kind: "start",
      workerId: "abc",
    });
    expect(parseRoute("POST", "/workers/abc/stop")).toEqual({
      kind: "stop",
      workerId: "abc",
    });
    expect(parseRoute("POST", "/workers/abc/restart")).toEqual({
      kind: "restart",
      workerId: "abc",
    });
    expect(parseRoute("GET", "/workers/abc/logs")).toEqual({
      kind: "logs",
      workerId: "abc",
    });
  });

  test("falls through to unknown", () => {
    expect(parseRoute("GET", "/nope")).toEqual({ kind: "unknown" });
    expect(parseRoute("PATCH", "/workers/abc")).toEqual({ kind: "unknown" });
  });
});

describe("Worker runtime HTTP control plane", () => {
  test("rejects when WORKER_RUNTIME_TOKEN is empty", async () => {
    await expect(
      startWorkerRuntime({ hostname: "127.0.0.1", port: 0, token: "" }),
    ).rejects.toThrow("WORKER_RUNTIME_TOKEN");
  });

  test("/health is unauthenticated and returns ok", async () => {
    const { base } = await startTestServer();
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { service: string; workers: number };
    expect(json.service).toBe("worker-runtime");
    expect(json.workers).toBe(0);
  });

  test("authenticated routes reject missing bearer", async () => {
    const { base } = await startTestServer();
    const res = await fetch(`${base}/workers`);
    expect(res.status).toBe(401);
  });

  test("authenticated routes reject wrong token", async () => {
    const { base } = await startTestServer();
    const res = await fetch(`${base}/workers`, {
      headers: { authorization: "Bearer nope" },
    });
    expect(res.status).toBe(401);
  });

  test("registration validates input", async () => {
    const { base } = await startTestServer();
    const res = await fetch(`${base}/workers`, {
      method: "POST",
      headers: authed({ "content-type": "application/json" }),
      body: JSON.stringify({ bogus: true }),
    });
    expect(res.status).toBe(400);
  });

  test("registration rejects malformed JSON", async () => {
    const { base } = await startTestServer();
    const res = await fetch(`${base}/workers`, {
      method: "POST",
      headers: authed({ "content-type": "application/json" }),
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  test("end-to-end CRUD + start + stop + logs", async () => {
    const { base, spawner, clock } = await startTestServer();
    // register
    const reg = await fetch(`${base}/workers`, {
      method: "POST",
      headers: authed({ "content-type": "application/json" }),
      body: JSON.stringify(validRegistration("worker-a")),
    });
    expect(reg.status).toBe(201);
    const created = (await reg.json()) as { workerId: string };
    expect(created.workerId).toBe("worker-a");

    // duplicate register returns 409
    const dup = await fetch(`${base}/workers`, {
      method: "POST",
      headers: authed({ "content-type": "application/json" }),
      body: JSON.stringify(validRegistration("worker-a")),
    });
    expect(dup.status).toBe(409);

    // list
    const list = await fetch(`${base}/workers`, { headers: authed() });
    expect(list.status).toBe(200);
    const lr = (await list.json()) as { workers: { workerId: string }[] };
    expect(lr.workers).toHaveLength(1);

    // start
    const start = await fetch(`${base}/workers/worker-a/start`, {
      method: "POST",
      headers: authed(),
    });
    expect(start.status).toBe(200);
    await flushMicrotasks();
    expect(spawner.processes).toHaveLength(1);

    // emit a log line via the fake process
    spawner.processes[0]?.emitStdout("alive");
    await flushMicrotasks();

    // logs (snapshot mode)
    const logs = await fetch(`${base}/workers/worker-a/logs`, {
      headers: authed(),
    });
    const logsBody = (await logs.json()) as {
      count: number;
      lines: { text: string; stream: string }[];
    };
    expect(logsBody.count).toBeGreaterThan(0);
    expect(logsBody.lines[0]?.text).toBe("alive");

    // get detail
    const det = await fetch(`${base}/workers/worker-a`, { headers: authed() });
    const detail = (await det.json()) as { state: { status: string } };
    expect(detail.state.status).toBe("running");

    // stop (cooperative exit)
    const stopPromise = fetch(`${base}/workers/worker-a/stop`, {
      method: "POST",
      headers: authed(),
    });
    spawner.processes[0]?.exit(0);
    const stop = await stopPromise;
    expect(stop.status).toBe(200);

    // delete
    const del = await fetch(`${base}/workers/worker-a`, {
      method: "DELETE",
      headers: authed(),
    });
    expect(del.status).toBe(204);

    // get-after-delete is 404
    const after = await fetch(`${base}/workers/worker-a`, {
      headers: authed(),
    });
    expect(after.status).toBe(404);
    // clock unused beyond setup but referenced for harness completeness.
    expect(clock.now()).toBeGreaterThanOrEqual(0);
  });

  test("logs endpoint validates `since`", async () => {
    const { base } = await startTestServer();
    await fetch(`${base}/workers`, {
      method: "POST",
      headers: authed({ "content-type": "application/json" }),
      body: JSON.stringify(validRegistration("worker-b")),
    });
    const res = await fetch(`${base}/workers/worker-b/logs?since=bogus`, {
      headers: authed(),
    });
    expect(res.status).toBe(400);
  });

  test("get/start/stop/restart/logs return 404 for unknown worker", async () => {
    const { base } = await startTestServer();
    for (const path of [
      "/workers/missing",
      "/workers/missing/logs",
    ]) {
      const r = await fetch(`${base}${path}`, { headers: authed() });
      expect(r.status).toBe(404);
    }
    for (const verb of ["start", "stop", "restart"]) {
      const r = await fetch(`${base}/workers/missing/${verb}`, {
        method: "POST",
        headers: authed(),
      });
      expect(r.status).toBe(404);
    }
    const del = await fetch(`${base}/workers/missing`, {
      method: "DELETE",
      headers: authed(),
    });
    expect(del.status).toBe(404);
  });
});
