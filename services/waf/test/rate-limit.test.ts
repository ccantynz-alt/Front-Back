/**
 * Rate limiter — verifies token-bucket and sliding-window with mocked clocks.
 * No timers, no flakiness.
 */
import { describe, expect, it } from "bun:test";
import { RateLimiter } from "../src/rate-limit";
import type { RateLimitConfig } from "../src/types";

describe("RateLimiter — token bucket", () => {
  const cfg: RateLimitConfig = {
    limit: 5,
    windowMs: 1000,
    scope: "ip",
    algorithm: "token-bucket",
  };

  it("allows up to limit then blocks", () => {
    const lim = new RateLimiter();
    for (let i = 0; i < 5; i++) {
      const r = lim.check("k", cfg, 0);
      expect(r.allowed).toBe(true);
    }
    const blocked = lim.check("k", cfg, 0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("refills tokens over time", () => {
    const lim = new RateLimiter();
    for (let i = 0; i < 5; i++) lim.check("k", cfg, 0);
    expect(lim.check("k", cfg, 0).allowed).toBe(false);
    // After full window, bucket fully refills.
    expect(lim.check("k", cfg, 1000).allowed).toBe(true);
  });

  it("namespaces keys by IP", () => {
    const lim = new RateLimiter();
    for (let i = 0; i < 5; i++) lim.check("a", cfg, 0);
    expect(lim.check("b", cfg, 0).allowed).toBe(true);
  });
});

describe("RateLimiter — sliding window", () => {
  const cfg: RateLimitConfig = {
    limit: 3,
    windowMs: 1000,
    scope: "ip",
    algorithm: "sliding-window",
  };

  it("rejects after limit hits within window", () => {
    const lim = new RateLimiter();
    expect(lim.check("k", cfg, 100).allowed).toBe(true);
    expect(lim.check("k", cfg, 200).allowed).toBe(true);
    expect(lim.check("k", cfg, 300).allowed).toBe(true);
    const blocked = lim.check("k", cfg, 400);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThanOrEqual(1);
  });

  it("frees a slot once an entry leaves the window", () => {
    const lim = new RateLimiter();
    lim.check("k", cfg, 100);
    lim.check("k", cfg, 200);
    lim.check("k", cfg, 300);
    expect(lim.check("k", cfg, 400).allowed).toBe(false);
    // The first entry (ts=100) drops out at now > 1100.
    expect(lim.check("k", cfg, 1101).allowed).toBe(true);
  });

  it("computes retryAfter from the oldest entry", () => {
    const lim = new RateLimiter();
    lim.check("k", cfg, 100);
    lim.check("k", cfg, 200);
    lim.check("k", cfg, 300);
    const blocked = lim.check("k", cfg, 500);
    expect(blocked.allowed).toBe(false);
    // oldest=100, window=1000 -> free at 1100, now=500 -> retry in 600ms = 1s
    expect(blocked.retryAfter).toBe(1);
  });
});
