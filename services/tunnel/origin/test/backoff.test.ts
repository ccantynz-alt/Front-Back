import { describe, expect, test } from "bun:test";
import {
  INITIAL_BACKOFF_MS,
  MAX_BACKOFF_MS,
  computeBackoffMs,
  computeBaseBackoffMs,
} from "../src/backoff";

describe("origin/backoff: base backoff", () => {
  test("attempt 0 yields the initial backoff", () => {
    expect(computeBaseBackoffMs(0)).toBe(INITIAL_BACKOFF_MS);
  });
  test("doubles each attempt", () => {
    expect(computeBaseBackoffMs(1)).toBe(INITIAL_BACKOFF_MS * 2);
    expect(computeBaseBackoffMs(2)).toBe(INITIAL_BACKOFF_MS * 4);
    expect(computeBaseBackoffMs(3)).toBe(INITIAL_BACKOFF_MS * 8);
  });
  test("clamps at the configured maximum", () => {
    expect(computeBaseBackoffMs(20)).toBe(MAX_BACKOFF_MS);
    expect(computeBaseBackoffMs(99)).toBe(MAX_BACKOFF_MS);
  });
  test("rejects bogus inputs by falling back to initial", () => {
    expect(computeBaseBackoffMs(-1)).toBe(INITIAL_BACKOFF_MS);
    expect(computeBaseBackoffMs(1.5)).toBe(INITIAL_BACKOFF_MS);
  });
});

describe("origin/backoff: jittered backoff", () => {
  test("0 jitter yields 0 ms (lower bound)", () => {
    expect(computeBackoffMs(0, () => 0)).toBe(0);
    expect(computeBackoffMs(5, () => 0)).toBe(0);
  });
  test("max jitter approaches the base ceiling", () => {
    const highJitter = computeBackoffMs(0, () => 0.99);
    expect(highJitter).toBeGreaterThan(0);
    expect(highJitter).toBeLessThan(INITIAL_BACKOFF_MS);
  });
  test("clamps abusive random values to the [0,1) range", () => {
    expect(computeBackoffMs(0, () => -1)).toBe(0);
    expect(computeBackoffMs(0, () => 5)).toBeLessThan(INITIAL_BACKOFF_MS);
  });
});
