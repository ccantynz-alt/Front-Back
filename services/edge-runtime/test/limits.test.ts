// ── runWithLimits primitive tests ───────────────────────────────────
// Pure tests against the time + memory ceiling primitive. We inject
// timer + memory readers so the suite is deterministic.

import { describe, expect, test } from "bun:test";
import { DEFAULT_LIMITS, runWithLimits } from "../src/limits";

describe("DEFAULT_LIMITS", () => {
  test("matches the documented 30s / 128MB defaults", () => {
    expect(DEFAULT_LIMITS.timeoutMs).toBe(30_000);
    expect(DEFAULT_LIMITS.memoryMb).toBe(128);
  });
});

describe("runWithLimits — happy path", () => {
  test("resolves with the value and a tiny duration", async () => {
    const result = await runWithLimits({
      limits: { timeoutMs: 500, memoryMb: 64 },
      run: async () => "hello",
    });
    expect(result.outcome.kind).toBe("ok");
    expect(result.value).toBe("hello");
    expect(result.error).toBeUndefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("captures a thrown error without crashing", async () => {
    const result = await runWithLimits({
      limits: { timeoutMs: 500, memoryMb: 64 },
      run: async () => {
        throw new Error("oops");
      },
    });
    expect(result.outcome.kind).toBe("ok");
    expect(result.error?.message).toBe("oops");
    expect(result.value).toBeUndefined();
  });
});

describe("runWithLimits — time", () => {
  test("times out a hung promise at the configured budget", async () => {
    const result = await runWithLimits({
      limits: { timeoutMs: 80, memoryMb: 64 },
      run: () => new Promise(() => {}),
    });
    expect(result.outcome.kind).toBe("timeout");
    if (result.outcome.kind === "timeout") {
      expect(result.outcome.afterMs).toBe(80);
    }
  });
});

describe("runWithLimits — memory", () => {
  test("stops the run when the injected memory reading exceeds the cap", async () => {
    let n = 0;
    const result = await runWithLimits({
      limits: { timeoutMs: 5_000, memoryMb: 1 },
      readMemory: () => {
        n += 1;
        return n === 1 ? 0 : 4 * 1024 * 1024;
      },
      run: () => new Promise(() => {}),
    });
    expect(result.outcome.kind).toBe("memory");
    if (result.outcome.kind === "memory") {
      expect(result.outcome.usedMb).toBeGreaterThanOrEqual(1);
    }
  });
});
