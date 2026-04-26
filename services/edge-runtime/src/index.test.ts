// ── Edge runtime HTTP server unit tests ─────────────────────────────
// The worker is fully mocked. No real Bun Worker spawns. The dispatcher
// shape (init -> ready -> invoke -> response) is exercised through the
// mock so we cover the wire protocol without paying worker boot cost.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  type RuntimeWorker,
  type WorkerSpawner,
  parsePath,
  startEdgeRuntime,
} from "./index";
import type { WorkerMessage, WorkerReply } from "./dispatch";

const SECRET = "test-secret-123";

interface MockWorkerProgram {
  /** Reply to send when an `init` message arrives. */
  onInit: WorkerReply;
  /** Build the reply to send for an `invoke` message. */
  onInvoke: (msg: Extract<WorkerMessage, { type: "invoke" }>) => WorkerReply;
  /** Set to true to drop init replies (simulates a hung worker). */
  hangInit?: boolean;
}

function mockSpawner(program: MockWorkerProgram): WorkerSpawner {
  return () => {
    let listener: ((reply: WorkerReply) => void) | null = null;
    const worker: RuntimeWorker = {
      onMessage(handler) {
        listener = handler;
      },
      postMessage(msg) {
        // Reply on a microtask to mimic real async worker comms.
        queueMicrotask(() => {
          if (listener === null) return;
          if (msg.type === "init") {
            if (program.hangInit === true) return;
            listener(program.onInit);
          } else if (msg.type === "invoke") {
            listener(program.onInvoke(msg));
          }
        });
      },
      terminate() {
        listener = null;
      },
    };
    return worker;
  };
}

interface ServerHandle {
  port: number;
  stop: () => Promise<void>;
}

async function startServer(spawn: WorkerSpawner, timeoutMs = 1_000): Promise<ServerHandle> {
  const server = await startEdgeRuntime({
    hostname: "127.0.0.1",
    port: 0, // ask Bun to pick a free port
    secret: SECRET,
    spawnWorker: spawn,
    invokeTimeoutMs: timeoutMs,
    logger: { error: () => {}, warn: () => {}, log: () => {} },
  });
  return {
    port: server.port,
    stop: () => server.stop(),
  };
}

const okSpawn = mockSpawner({
  onInit: { type: "ready" },
  onInvoke: () => ({
    type: "response",
    response: {
      status: 200,
      statusText: "OK",
      headers: [["content-type", "application/json"]],
      bodyBase64: Buffer.from(JSON.stringify({ ran: true })).toString("base64"),
    },
  }),
});

let server: ServerHandle;

beforeEach(async () => {
  server = await startServer(okSpawn);
});

afterEach(async () => {
  await server.stop();
});

const url = (path: string): string => `http://127.0.0.1:${server.port}${path}`;
const auth = { Authorization: `Bearer ${SECRET}` };

describe("parsePath", () => {
  test("classifies known routes", () => {
    expect(parsePath("GET", "/health").kind).toBe("health");
    expect(parsePath("GET", "/admin/bundles").kind).toBe("list");
    expect(parsePath("POST", "/admin/bundles").kind).toBe("upsert");
    expect(parsePath("DELETE", "/admin/bundles/demo")).toEqual({
      kind: "delete",
      bundleId: "demo",
    });
    expect(parsePath("GET", "/run/demo")).toEqual({ kind: "run", bundleId: "demo" });
    expect(parsePath("POST", "/run/demo/sub/path")).toEqual({ kind: "run", bundleId: "demo" });
    expect(parsePath("GET", "/nope").kind).toBe("unknown");
  });
});

describe("/health", () => {
  test("is unauthenticated and returns ok", async () => {
    const res = await fetch(url("/health"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string; bundles: number };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("edge-runtime");
    expect(body.bundles).toBe(0);
  });
});

describe("/admin/bundles auth", () => {
  test("rejects requests without a bearer token", async () => {
    const res = await fetch(url("/admin/bundles"));
    expect(res.status).toBe(401);
  });

  test("rejects requests with the wrong token", async () => {
    const res = await fetch(url("/admin/bundles"), {
      headers: { Authorization: "Bearer nope" },
    });
    expect(res.status).toBe(401);
  });
});

describe("/admin/bundles CRUD", () => {
  test("POST registers a bundle, GET lists it, DELETE removes it", async () => {
    const code = "export default () => new Response('hi')";

    const create = await fetch(url("/admin/bundles"), {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ id: "demo", code, entrypoint: "worker.js" }),
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as { id: string; hash: string; codeBytes: number };
    expect(created.id).toBe("demo");
    expect(created.hash).toHaveLength(64);
    expect(created.codeBytes).toBe(code.length);

    const list = await fetch(url("/admin/bundles"), { headers: auth });
    expect(list.status).toBe(200);
    const listed = (await list.json()) as { bundles: { id: string }[] };
    expect(listed.bundles).toHaveLength(1);
    expect(listed.bundles[0]?.id).toBe("demo");

    const del = await fetch(url("/admin/bundles/demo"), { method: "DELETE", headers: auth });
    expect(del.status).toBe(204);

    const empty = await fetch(url("/admin/bundles"), { headers: auth });
    const after = (await empty.json()) as { bundles: unknown[] };
    expect(after.bundles).toHaveLength(0);
  });

  test("POST rejects malformed JSON", async () => {
    const res = await fetch(url("/admin/bundles"), {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: "not-json",
    });
    expect(res.status).toBe(400);
  });

  test("POST rejects an invalid id", async () => {
    const res = await fetch(url("/admin/bundles"), {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ id: "BAD ID", code: "x" }),
    });
    expect(res.status).toBe(400);
  });

  test("DELETE on a missing bundle returns 404", async () => {
    const res = await fetch(url("/admin/bundles/missing"), { method: "DELETE", headers: auth });
    expect(res.status).toBe(404);
  });
});

describe("/run/:id dispatch", () => {
  async function register(id: string, code = "export default () => new Response('ok')"): Promise<void> {
    const res = await fetch(url("/admin/bundles"), {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ id, code, entrypoint: "worker.js" }),
    });
    expect(res.status).toBe(201);
  }

  test("returns 404 for an unregistered bundle", async () => {
    const res = await fetch(url("/run/missing"), { headers: auth });
    expect(res.status).toBe(404);
  });

  test("dispatches to the mocked worker and returns its response", async () => {
    await register("demo");
    const res = await fetch(url("/run/demo/some/path"), { headers: auth });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ran: boolean };
    expect(body.ran).toBe(true);
  });

  test("returns 504 when the worker hangs past the timeout", async () => {
    const hangSpawn = mockSpawner({
      onInit: { type: "ready" },
      onInvoke: () => ({ type: "ready" }), // never matters; init hangs first
      hangInit: true,
    });
    const local = await startServer(hangSpawn, 50);
    try {
      // register with the local server
      const reg = await fetch(`http://127.0.0.1:${local.port}/admin/bundles`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ id: "slow", code: "x", entrypoint: "w.js" }),
      });
      expect(reg.status).toBe(201);
      const res = await fetch(`http://127.0.0.1:${local.port}/run/slow`, { headers: auth });
      expect(res.status).toBe(504);
    } finally {
      await local.stop();
    }
  });

  test("propagates a worker-reported handler error as 500", async () => {
    const errSpawn = mockSpawner({
      onInit: { type: "ready" },
      onInvoke: () => ({ type: "error", message: "boom" }),
    });
    const local = await startServer(errSpawn);
    try {
      const reg = await fetch(`http://127.0.0.1:${local.port}/admin/bundles`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ id: "boom", code: "x" }),
      });
      expect(reg.status).toBe(201);
      const res = await fetch(`http://127.0.0.1:${local.port}/run/boom`, { headers: auth });
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(text).toContain("boom");
    } finally {
      await local.stop();
    }
  });
});

describe("startEdgeRuntime config", () => {
  test("throws when the secret is missing", async () => {
    await expect(
      startEdgeRuntime({ hostname: "127.0.0.1", port: 0, secret: "" }),
    ).rejects.toThrow(/EDGE_RUNTIME_SECRET/);
  });
});
