import { describe, expect, it } from "bun:test";
import { DEFAULT_RATE_PER_SEC, PerNumberRateLimiter } from "./rate-limiter.ts";

function makeClock(): { now: () => number; tick(ms: number): void } {
  const state = { ts: 0 };
  return {
    now: () => state.ts,
    tick(ms: number): void {
      state.ts += ms;
    },
  };
}

describe("PerNumberRateLimiter", () => {
  it("respects long-code 1/sec cap", () => {
    const clock = makeClock();
    const limiter = new PerNumberRateLimiter(clock);
    expect(limiter.tryConsume("+15550001111", "long-code")).toBe(true);
    expect(limiter.tryConsume("+15550001111", "long-code")).toBe(false);
    clock.tick(1000);
    expect(limiter.tryConsume("+15550001111", "long-code")).toBe(true);
  });

  it("respects short-code 30/sec cap", () => {
    const clock = makeClock();
    const limiter = new PerNumberRateLimiter(clock);
    for (let i = 0; i < DEFAULT_RATE_PER_SEC["short-code"]; i += 1) {
      expect(limiter.tryConsume("12345", "short-code")).toBe(true);
    }
    expect(limiter.tryConsume("12345", "short-code")).toBe(false);
  });

  it("isolates buckets per number", () => {
    const clock = makeClock();
    const limiter = new PerNumberRateLimiter(clock);
    expect(limiter.tryConsume("+15550001111", "long-code")).toBe(true);
    expect(limiter.tryConsume("+15550002222", "long-code")).toBe(true);
  });

  it("can be reset", () => {
    const clock = makeClock();
    const limiter = new PerNumberRateLimiter(clock);
    expect(limiter.tryConsume("+15550001111", "long-code")).toBe(true);
    limiter.reset();
    expect(limiter.tryConsume("+15550001111", "long-code")).toBe(true);
  });
});
