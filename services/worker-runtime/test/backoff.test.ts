import { describe, expect, test } from "bun:test";
import {
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
  computeBackoff,
} from "../src/backoff";

describe("computeBackoff", () => {
  test("first attempt uses the base delay", () => {
    expect(computeBackoff(1)).toBe(BASE_BACKOFF_MS);
  });

  test("doubles each attempt", () => {
    expect(computeBackoff(2)).toBe(BASE_BACKOFF_MS * 2);
    expect(computeBackoff(3)).toBe(BASE_BACKOFF_MS * 4);
    expect(computeBackoff(4)).toBe(BASE_BACKOFF_MS * 8);
  });

  test("caps at MAX_BACKOFF_MS", () => {
    expect(computeBackoff(20)).toBe(MAX_BACKOFF_MS);
    expect(computeBackoff(1_000_000)).toBe(MAX_BACKOFF_MS);
  });

  test("clamps invalid input to base", () => {
    expect(computeBackoff(0)).toBe(BASE_BACKOFF_MS);
    expect(computeBackoff(-5)).toBe(BASE_BACKOFF_MS);
    expect(computeBackoff(Number.NaN)).toBe(BASE_BACKOFF_MS);
  });
});
