import { describe, expect, test } from "bun:test";
import { CallQuota } from "../src/quota/quota.ts";

describe("CallQuota", () => {
  test("allows up to limit, then denies", () => {
    const q = new CallQuota({ windowMs: 1000, maxCallsPerWindow: 2 });
    expect(q.consume("t", 1000)).toBe(true);
    expect(q.consume("t", 1100)).toBe(true);
    expect(q.consume("t", 1200)).toBe(false);
  });

  test("expires entries outside window", () => {
    const q = new CallQuota({ windowMs: 1000, maxCallsPerWindow: 1 });
    expect(q.consume("t", 1000)).toBe(true);
    expect(q.consume("t", 1500)).toBe(false);
    expect(q.consume("t", 2500)).toBe(true);
  });

  test("isolates tenants", () => {
    const q = new CallQuota({ windowMs: 1000, maxCallsPerWindow: 1 });
    expect(q.consume("a", 1000)).toBe(true);
    expect(q.consume("b", 1000)).toBe(true);
    expect(q.consume("a", 1100)).toBe(false);
  });

  test("remaining reflects usage", () => {
    const q = new CallQuota({ windowMs: 1000, maxCallsPerWindow: 5 });
    q.consume("t", 1000);
    q.consume("t", 1100);
    expect(q.remaining("t", 1200)).toBe(3);
  });
});
