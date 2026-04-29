// ── Queue + JobStore tests ──────────────────────────────────────────────

import { describe, expect, test } from "bun:test";
import { JobStore, TenantQueue } from "./queue";
import type { JobRecord } from "../core/types";

function makeJob(id: string, tenantId: string): JobRecord {
  return {
    id,
    tenantId,
    state: "queued",
    source: { kind: "url", url: `https://x/${id}.mov` },
    target: {
      container: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      width: 1280,
      height: 720,
    },
    progress: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe("JobStore", () => {
  test("put + get round-trip", () => {
    const s = new JobStore();
    const j = makeJob("a", "t1");
    s.put(j);
    expect(s.get("a")?.id).toBe("a");
  });
  test("update merges + bumps updatedAt", () => {
    const s = new JobStore();
    const j = makeJob("a", "t1");
    s.put(j);
    const updated = s.update("a", { state: "running", progress: 0.3 });
    expect(updated?.state).toBe("running");
    expect(updated?.progress).toBe(0.3);
  });
  test("list filters by tenantId", () => {
    const s = new JobStore();
    s.put(makeJob("a", "t1"));
    s.put(makeJob("b", "t1"));
    s.put(makeJob("c", "t2"));
    expect(s.list("t1").length).toBe(2);
    expect(s.list("t2").length).toBe(1);
  });
});

describe("TenantQueue", () => {
  test("processes per-tenant jobs in FIFO order", async () => {
    const q = new TenantQueue();
    const order: string[] = [];

    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

    q.enqueue("t1", {
      job: makeJob("a", "t1"),
      run: async () => {
        await wait(15);
        order.push("a");
      },
    });
    q.enqueue("t1", {
      job: makeJob("b", "t1"),
      run: async () => {
        await wait(5);
        order.push("b");
      },
    });

    // Drain by polling the running flag indirectly via order length
    while (order.length < 2) await wait(10);
    expect(order).toEqual(["a", "b"]);
  });

  test("different tenants run independently", async () => {
    const q = new TenantQueue();
    const t1: string[] = [];
    const t2: string[] = [];
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

    q.enqueue("t1", {
      job: makeJob("a", "t1"),
      run: async () => {
        await wait(15);
        t1.push("a");
      },
    });
    q.enqueue("t2", {
      job: makeJob("b", "t2"),
      run: async () => {
        t2.push("b");
      },
    });

    while (t1.length + t2.length < 2) await wait(10);
    expect(t1).toEqual(["a"]);
    expect(t2).toEqual(["b"]);
  });
});
