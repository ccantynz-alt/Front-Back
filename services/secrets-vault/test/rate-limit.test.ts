import { describe, expect, it } from "bun:test";
import { RateLimiter } from "../src/rate-limit";

describe("RateLimiter", () => {
  it("allows up to maxRequests per window", () => {
    let now = 0;
    const limiter = new RateLimiter({ windowMs: 1000, maxRequests: 3, clock: () => now });
    expect(limiter.check("t1")).toBe(true);
    expect(limiter.check("t1")).toBe(true);
    expect(limiter.check("t1")).toBe(true);
    expect(limiter.check("t1")).toBe(false); // 4th — over limit
  });

  it("resets after the window slides", () => {
    let now = 0;
    const limiter = new RateLimiter({ windowMs: 1000, maxRequests: 2, clock: () => now });
    expect(limiter.check("t1")).toBe(true);
    expect(limiter.check("t1")).toBe(true);
    expect(limiter.check("t1")).toBe(false);
    // Advance past the window.
    now = 1500;
    expect(limiter.check("t1")).toBe(true);
  });

  it("isolates buckets per tenant", () => {
    let now = 0;
    const limiter = new RateLimiter({ windowMs: 1000, maxRequests: 1, clock: () => now });
    expect(limiter.check("t1")).toBe(true);
    expect(limiter.check("t1")).toBe(false);
    // Different tenant has its own bucket.
    expect(limiter.check("t2")).toBe(true);
  });

  it("remaining() decreases as tokens consumed", () => {
    let now = 0;
    const limiter = new RateLimiter({ windowMs: 1000, maxRequests: 5, clock: () => now });
    expect(limiter.remaining("t1")).toBe(5);
    limiter.check("t1");
    expect(limiter.remaining("t1")).toBe(4);
  });
});
