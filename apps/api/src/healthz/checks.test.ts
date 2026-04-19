/**
 * Unit tests for the individual component health checks.
 *
 * Every check is exercised with injected fakes so we cover the happy path,
 * the failure path, and the timeout path without touching the real db,
 * network, filesystem, or TLS stack.
 */

import { describe, test, expect } from "bun:test";
import {
  checkPostgres,
  checkHttpHealth,
  checkCaddyCert,
  checkDiskFree,
  withTimeout,
} from "./checks";

// ── withTimeout ──────────────────────────────────────────────────────

describe("withTimeout", () => {
  test("resolves with value when promise wins", async () => {
    const result = await withTimeout(Promise.resolve("ok"), 100, "x");
    expect(result).toBe("ok");
  });

  test("rejects with labeled timeout when timer wins", async () => {
    const slow = new Promise<string>((resolve) =>
      setTimeout(() => resolve("late"), 200),
    );
    try {
      await withTimeout(slow, 20, "probe");
      throw new Error("expected timeout");
    } catch (err) {
      expect((err as Error).message).toContain("probe");
      expect((err as Error).message).toContain("timeout");
    }
  });

  test("propagates the underlying rejection when the promise loses", async () => {
    const failing = Promise.reject(new Error("boom"));
    try {
      await withTimeout(failing, 100, "x");
      throw new Error("expected reject");
    } catch (err) {
      expect((err as Error).message).toBe("boom");
    }
  });
});

// ── Postgres ─────────────────────────────────────────────────────────

describe("checkPostgres", () => {
  test("returns ok=true with a latency when probe resolves", async () => {
    const result = await checkPostgres(async () => {
      // no-op
    });
    expect(result.ok).toBe(true);
    expect(typeof result.latency_ms).toBe("number");
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
  });

  test("returns ok=false with error when probe rejects", async () => {
    const result = await checkPostgres(async () => {
      throw new Error("connection refused");
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("connection refused");
  });

  test("returns ok=false with a timeout error when probe hangs", async () => {
    const result = await checkPostgres(
      () => new Promise<void>(() => {
        /* hang forever */
      }),
      20,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("postgres");
    expect(result.error).toContain("timeout");
  });
});

// ── HTTP healthz ─────────────────────────────────────────────────────

describe("checkHttpHealth", () => {
  test("returns ok=true when upstream returns 2xx", async () => {
    const fakeFetch = (async () => {
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    const result = await checkHttpHealth(
      "https://example.test",
      1000,
      fakeFetch,
    );
    expect(result.ok).toBe(true);
    expect(result.url).toBe("https://example.test/healthz");
    expect(result.status).toBe(200);
  });

  test("strips trailing slashes before appending /healthz", async () => {
    let observed = "";
    const fakeFetch = (async (url: string | URL | Request) => {
      observed = url.toString();
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;
    await checkHttpHealth("https://example.test///", 1000, fakeFetch);
    expect(observed).toBe("https://example.test/healthz");
  });

  test("returns ok=false with status when upstream returns 5xx", async () => {
    const fakeFetch = (async () => {
      return new Response("oops", { status: 503 });
    }) as unknown as typeof fetch;
    const result = await checkHttpHealth(
      "https://example.test",
      1000,
      fakeFetch,
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
    expect(result.error).toContain("503");
  });

  test("returns ok=false when fetch throws (network failure)", async () => {
    const fakeFetch = (async () => {
      throw new Error("ENOTFOUND");
    }) as unknown as typeof fetch;
    const result = await checkHttpHealth(
      "https://nope.test",
      1000,
      fakeFetch,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("ENOTFOUND");
  });

  test("honors the timeout via AbortController", async () => {
    const fakeFetch = ((
      _url: string | URL | Request,
      init?: RequestInit,
    ) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new Error("aborted"));
        });
      })) as unknown as typeof fetch;
    const result = await checkHttpHealth(
      "https://example.test",
      10,
      fakeFetch,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ── Caddy cert ───────────────────────────────────────────────────────

describe("checkCaddyCert", () => {
  test("returns days_left and expires for a future notAfter", async () => {
    const fakeNow = new Date("2026-04-19T00:00:00Z");
    const notAfter = new Date("2026-07-14T00:00:00Z");
    const probe = async (): Promise<Date> => notAfter;
    const result = await checkCaddyCert(
      "example.test",
      443,
      1000,
      probe,
      () => fakeNow,
    );
    expect(result.ok).toBe(true);
    expect(result.expires).toBe("2026-07-14");
    expect(result.days_left).toBe(86);
  });

  test("returns ok=false when cert is already expired", async () => {
    const fakeNow = new Date("2026-04-19T00:00:00Z");
    const notAfter = new Date("2026-04-01T00:00:00Z");
    const probe = async (): Promise<Date> => notAfter;
    const result = await checkCaddyCert(
      "example.test",
      443,
      1000,
      probe,
      () => fakeNow,
    );
    expect(result.ok).toBe(false);
    expect(result.days_left).toBeLessThanOrEqual(0);
    expect(result.error).toContain("expired");
  });

  test("returns ok=false when probe rejects", async () => {
    const probe = async (): Promise<Date> => {
      throw new Error("tls handshake failed");
    };
    const result = await checkCaddyCert(
      "example.test",
      443,
      1000,
      probe,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe("tls handshake failed");
  });
});

// ── Disk free ────────────────────────────────────────────────────────

describe("checkDiskFree", () => {
  test("returns percentage rounded to one decimal", async () => {
    const probe = async () => ({ blocks: 1000, bfree: 823 });
    const result = await checkDiskFree("/", probe);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(82.3);
  });

  test("returns ok=false when stats report zero blocks", async () => {
    const probe = async () => ({ blocks: 0, bfree: 0 });
    const result = await checkDiskFree("/", probe);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("0 blocks");
  });

  test("flags critical-full (<1%) as not ok", async () => {
    const probe = async () => ({ blocks: 10_000, bfree: 5 });
    const result = await checkDiskFree("/", probe);
    expect(result.ok).toBe(false);
    expect(result.value).toBeLessThan(1);
  });

  test("returns ok=false when probe rejects", async () => {
    const probe = async (): Promise<{ blocks: number; bfree: number }> => {
      throw new Error("ENOENT");
    };
    const result = await checkDiskFree("/", probe);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("ENOENT");
  });
});
