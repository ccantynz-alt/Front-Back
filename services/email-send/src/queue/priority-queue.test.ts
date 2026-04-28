import { describe, expect, test } from "bun:test";
import { PriorityQueue } from "./priority-queue.ts";

describe("PriorityQueue", () => {
  test("enqueue and pop preserves priority order within tenant", () => {
    const q = new PriorityQueue();
    q.enqueue({ messageId: "a", tenantId: "t1", priority: "low", enqueuedAt: 1 });
    q.enqueue({ messageId: "b", tenantId: "t1", priority: "high", enqueuedAt: 2 });
    q.enqueue({ messageId: "c", tenantId: "t1", priority: "normal", enqueuedAt: 3 });
    expect(q.popReady()?.messageId).toBe("b");
    expect(q.popReady()?.messageId).toBe("c");
    expect(q.popReady()?.messageId).toBe("a");
    expect(q.popReady()).toBeUndefined();
  });

  test("round-robin fairness across tenants", () => {
    const q = new PriorityQueue();
    q.enqueue({ messageId: "t1-a", tenantId: "t1", priority: "normal", enqueuedAt: 1 });
    q.enqueue({ messageId: "t1-b", tenantId: "t1", priority: "normal", enqueuedAt: 2 });
    q.enqueue({ messageId: "t2-a", tenantId: "t2", priority: "normal", enqueuedAt: 3 });
    const order: string[] = [];
    for (let i = 0; i < 3; i++) {
      const e = q.popReady();
      if (e) order.push(e.messageId);
    }
    // Two tenants alternate.
    expect(order).toContain("t1-a");
    expect(order).toContain("t2-a");
    expect(order.indexOf("t2-a")).toBeLessThan(order.indexOf("t1-b"));
  });

  test("notBefore defers a message until time advances", () => {
    const q = new PriorityQueue();
    q.enqueue({
      messageId: "later",
      tenantId: "t1",
      priority: "normal",
      enqueuedAt: 0,
      notBefore: 1000,
    });
    expect(q.popReady(0)).toBeUndefined();
    expect(q.popReady(500)).toBeUndefined();
    expect(q.popReady(1000)?.messageId).toBe("later");
  });

  test("size and tenantSize report correctly", () => {
    const q = new PriorityQueue();
    expect(q.size()).toBe(0);
    q.enqueue({ messageId: "x", tenantId: "t1", priority: "normal", enqueuedAt: 0 });
    q.enqueue({ messageId: "y", tenantId: "t2", priority: "normal", enqueuedAt: 0 });
    expect(q.size()).toBe(2);
    expect(q.tenantSize("t1")).toBe(1);
    expect(q.tenantSize("t3")).toBe(0);
  });
});
