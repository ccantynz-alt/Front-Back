import { describe, expect, it } from "bun:test";
import { batchSchema, eventSchema, funnelRequestSchema, statsQuerySchema } from "../src/collector/schema";

describe("schema", () => {
  it("accepts a minimal valid event", () => {
    const r = eventSchema.safeParse({
      sessionId: "abc123",
      route: "/",
      event: "$pageview",
      ts: 1,
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty event names", () => {
    const r = eventSchema.safeParse({ sessionId: "abc", route: "/", event: "", ts: 1 });
    expect(r.success).toBe(false);
  });

  it("rejects unknown extra keys via .strict()", () => {
    const r = eventSchema.safeParse({
      sessionId: "abc",
      route: "/",
      event: "x",
      ts: 1,
      somethingElse: "boom",
    });
    expect(r.success).toBe(false);
  });

  it("accepts utm sub-object", () => {
    const r = eventSchema.safeParse({
      sessionId: "abc",
      route: "/",
      event: "x",
      ts: 1,
      utm: { source: "twitter", campaign: "launch" },
    });
    expect(r.success).toBe(true);
  });

  it("rejects oversize batches", () => {
    const events = Array.from({ length: 65 }, (_, i) => ({
      sessionId: "s",
      route: "/",
      event: "x",
      ts: i,
    }));
    const r = batchSchema.safeParse({ tenant: "acme", events });
    expect(r.success).toBe(false);
  });

  it("requires at least one event in a batch", () => {
    const r = batchSchema.safeParse({ tenant: "acme", events: [] });
    expect(r.success).toBe(false);
  });

  it("validates topN bounds in stats query", () => {
    const ok = statsQuerySchema.safeParse({ topN: "5" });
    expect(ok.success).toBe(true);
    const bad = statsQuerySchema.safeParse({ topN: "9999" });
    expect(bad.success).toBe(false);
  });

  it("requires at least 2 funnel steps", () => {
    const tooFew = funnelRequestSchema.safeParse({ steps: ["a"] });
    expect(tooFew.success).toBe(false);
    const ok = funnelRequestSchema.safeParse({ steps: ["a", "b"] });
    expect(ok.success).toBe(true);
  });
});
