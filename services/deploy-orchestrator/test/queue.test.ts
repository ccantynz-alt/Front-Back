import { describe, expect, test } from "bun:test";
import { TenantQueue } from "../src/queue";

describe("TenantQueue", () => {
  test("serialises tasks for the same tenant", async () => {
    const q = new TenantQueue<number>();
    const order: string[] = [];

    const t1 = q.enqueue("tenant_a", async () => {
      order.push("a1-start");
      await new Promise((r) => setTimeout(r, 20));
      order.push("a1-end");
      return 1;
    });
    const t2 = q.enqueue("tenant_a", async () => {
      order.push("a2-start");
      await new Promise((r) => setTimeout(r, 5));
      order.push("a2-end");
      return 2;
    });

    expect(await t1).toBe(1);
    expect(await t2).toBe(2);
    expect(order).toEqual(["a1-start", "a1-end", "a2-start", "a2-end"]);
  });

  test("runs tasks for different tenants in parallel", async () => {
    const q = new TenantQueue<number>();
    const startedAt: Record<string, number> = {};

    const ta = q.enqueue("tenant_a", async () => {
      startedAt.a = Date.now();
      await new Promise((r) => setTimeout(r, 30));
      return 1;
    });
    const tb = q.enqueue("tenant_b", async () => {
      startedAt.b = Date.now();
      await new Promise((r) => setTimeout(r, 30));
      return 2;
    });

    await Promise.all([ta, tb]);
    expect(Math.abs((startedAt.a ?? 0) - (startedAt.b ?? 0))).toBeLessThan(15);
  });

  test("a failing task does not block subsequent tasks for the same tenant", async () => {
    const q = new TenantQueue<number>();
    const failing = q.enqueue("tenant_a", async () => {
      throw new Error("boom");
    });
    await expect(failing).rejects.toThrow("boom");

    const next = await q.enqueue("tenant_a", async () => 42);
    expect(next).toBe(42);
  });

  test("activeKeys reflects in-flight tenants", async () => {
    const q = new TenantQueue<number>();
    let release: ((value: number) => void) | undefined;
    const ready = new Promise<number>((r) => {
      release = r;
    });
    const blocked = q.enqueue("tenant_a", () => ready);
    expect(q.activeKeys()).toContain("tenant_a");
    release?.(7);
    expect(await blocked).toBe(7);
  });
});
