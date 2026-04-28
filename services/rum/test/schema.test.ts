import { describe, expect, it } from "bun:test";
import { batchSchema, statsQuerySchema, timeseriesQuerySchema } from "../src/collector/schema";

describe("batchSchema", () => {
  const valid = {
    tenant: "acme",
    route: "/",
    sentAt: 1,
    viewport: [1280, 720],
    deviceMemory: 8,
    connection: "4g",
    metrics: [{ n: "LCP", v: 1000, t: 0 }],
  };

  it("accepts a valid payload", () => {
    expect(batchSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects unknown metric names", () => {
    const bad = { ...valid, metrics: [{ n: "BOGUS", v: 1, t: 0 }] };
    expect(batchSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an empty metric list", () => {
    expect(batchSchema.safeParse({ ...valid, metrics: [] }).success).toBe(false);
  });

  it("rejects an unsafe tenant id", () => {
    expect(batchSchema.safeParse({ ...valid, tenant: "../oops" }).success).toBe(false);
  });

  it("rejects negative metric values", () => {
    expect(batchSchema.safeParse({ ...valid, metrics: [{ n: "LCP", v: -1, t: 0 }] }).success).toBe(false);
  });
});

describe("statsQuerySchema", () => {
  it("coerces since into a number", () => {
    const parsed = statsQuerySchema.safeParse({ since: "100" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.since).toBe(100);
  });
});

describe("timeseriesQuerySchema", () => {
  it("requires a metric", () => {
    expect(timeseriesQuerySchema.safeParse({}).success).toBe(false);
  });
  it("defaults bucket to 1m", () => {
    const parsed = timeseriesQuerySchema.safeParse({ metric: "LCP" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.bucket).toBe("1m");
  });
});
