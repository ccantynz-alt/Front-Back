import { describe, expect, it } from "bun:test";
import { RateLimiter } from "../src/rate-limit.js";

describe("RateLimiter", () => {
  it("allows up to max in a window then denies", () => {
    let now = 1000;
    const rl = new RateLimiter({ max: 3, windowMs: 60_000, now: () => now });
    expect(rl.allow("k").allowed).toBe(true);
    expect(rl.allow("k").allowed).toBe(true);
    expect(rl.allow("k").allowed).toBe(true);
    expect(rl.allow("k").allowed).toBe(false);
    now += 61_000;
    expect(rl.allow("k").allowed).toBe(true);
  });

  it("isolates buckets per key", () => {
    let now = 0;
    const rl = new RateLimiter({ max: 1, windowMs: 60_000, now: () => now });
    expect(rl.allow("a").allowed).toBe(true);
    expect(rl.allow("b").allowed).toBe(true);
    expect(rl.allow("a").allowed).toBe(false);
    expect(rl.allow("b").allowed).toBe(false);
  });

  it("reset() clears a key", () => {
    const rl = new RateLimiter({ max: 1, windowMs: 60_000, now: () => 0 });
    rl.allow("k");
    rl.reset("k");
    expect(rl.allow("k").allowed).toBe(true);
  });
});
