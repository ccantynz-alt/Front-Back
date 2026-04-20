// ── platform-siblings lib tests ─────────────────────────────────────
// Executable tests for the cross-product health fan-out. Unlike the
// route tests elsewhere in the repo (which stay static because of
// @solidjs/router side-effects), this module is a plain TS library
// with no JSX so we can exercise it directly.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  getPlatformSiblings,
  PLATFORM_SIBLING_CACHE_TTL_MS,
  PLATFORM_SIBLING_DEFAULTS,
  PLATFORM_SIBLING_ENV_KEYS,
  PLATFORM_SIBLING_FETCH_TIMEOUT_MS,
  resetPlatformSiblingsCache,
  resolveSiblingUrl,
} from "./platform-siblings";

beforeEach(() => {
  resetPlatformSiblingsCache();
});

afterEach(() => {
  delete process.env.CRONTECH_STATUS_URL;
  delete process.env.GLUECRON_STATUS_URL;
  delete process.env.GATETEST_STATUS_URL;
  resetPlatformSiblingsCache();
});

// ── Defaults + env override ─────────────────────────────────────────

describe("platform-siblings — defaults", () => {
  test("ships real domains for each sibling", () => {
    expect(PLATFORM_SIBLING_DEFAULTS.crontech).toBe(
      "https://crontech.ai/api/platform-status",
    );
    expect(PLATFORM_SIBLING_DEFAULTS.gluecron).toBe(
      "https://gluecron.com/api/platform-status",
    );
    expect(PLATFORM_SIBLING_DEFAULTS.gatetest).toBe(
      "https://gatetest.io/api/platform-status",
    );
  });

  test("ships env keys in the brief's exact spelling", () => {
    expect(PLATFORM_SIBLING_ENV_KEYS.crontech).toBe("CRONTECH_STATUS_URL");
    expect(PLATFORM_SIBLING_ENV_KEYS.gluecron).toBe("GLUECRON_STATUS_URL");
    expect(PLATFORM_SIBLING_ENV_KEYS.gatetest).toBe("GATETEST_STATUS_URL");
  });

  test("declares a 3s timeout and a 30s cache", () => {
    expect(PLATFORM_SIBLING_FETCH_TIMEOUT_MS).toBe(3_000);
    expect(PLATFORM_SIBLING_CACHE_TTL_MS).toBe(30_000);
  });
});

describe("platform-siblings — resolveSiblingUrl", () => {
  test("falls back to the default when the env var is unset", () => {
    expect(resolveSiblingUrl("crontech")).toBe(
      PLATFORM_SIBLING_DEFAULTS.crontech,
    );
  });

  test("falls back to the default when the env var is whitespace", () => {
    process.env.GLUECRON_STATUS_URL = "   ";
    expect(resolveSiblingUrl("gluecron")).toBe(
      PLATFORM_SIBLING_DEFAULTS.gluecron,
    );
  });

  test("prefers the env override when provided", () => {
    process.env.GATETEST_STATUS_URL = "https://staging.example/api/platform-status";
    expect(resolveSiblingUrl("gatetest")).toBe(
      "https://staging.example/api/platform-status",
    );
  });
});

// ── Fan-out behaviour ───────────────────────────────────────────────

function makeFetch(
  handler: (url: string) => Promise<Response> | Response,
): typeof fetch {
  return ((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    return Promise.resolve(handler(url));
  }) as typeof fetch;
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("platform-siblings — getPlatformSiblings happy path", () => {
  test("fans out to all three products and mirrors their payload", async () => {
    const calls: string[] = [];
    const fetchImpl = makeFetch(async (url) => {
      calls.push(url);
      return jsonResponse({
        product: url.includes("gluecron")
          ? "gluecron"
          : url.includes("gatetest")
            ? "gatetest"
            : "crontech",
        version: "1.2.3",
        commit: "abcdef1234",
        healthy: true,
        timestamp: "2026-04-20T12:00:00.000Z",
        siblings: {},
      });
    });

    const snapshot = await getPlatformSiblings({ fetchImpl, force: true });

    expect(snapshot.siblings).toHaveLength(3);
    expect(calls).toHaveLength(3);
    const statuses = snapshot.siblings.map((s) => s.status);
    expect(statuses.every((s) => s === "up")).toBe(true);

    const cron = snapshot.siblings.find((s) => s.product === "crontech")!;
    expect(cron.version).toBe("1.2.3");
    expect(cron.commit).toBe("abcdef1234");
    expect(cron.lastUpdated).toBe("2026-04-20T12:00:00.000Z");
    expect(cron.error).toBeNull();
  });

  test("flags non-2xx responses as down without throwing", async () => {
    const fetchImpl = makeFetch(() =>
      new Response("boom", { status: 502 }),
    );
    const snapshot = await getPlatformSiblings({ fetchImpl, force: true });
    for (const sibling of snapshot.siblings) {
      expect(sibling.status).toBe("down");
      expect(sibling.error).toBe("HTTP 502");
    }
  });

  test("flags network failures as unreachable without throwing", async () => {
    const fetchImpl = makeFetch(() => {
      throw new Error("ECONNREFUSED");
    });
    const snapshot = await getPlatformSiblings({ fetchImpl, force: true });
    for (const sibling of snapshot.siblings) {
      expect(sibling.status).toBe("unreachable");
      expect(sibling.error).toBe("unreachable");
    }
  });

  test("maps healthy:false responses to down with a descriptive error", async () => {
    const fetchImpl = makeFetch(async () =>
      jsonResponse({
        product: "crontech",
        version: "1.0.0",
        commit: "deadbeef",
        healthy: false,
        timestamp: "2026-04-20T12:00:00.000Z",
      }),
    );
    const snapshot = await getPlatformSiblings({ fetchImpl, force: true });
    for (const sibling of snapshot.siblings) {
      expect(sibling.status).toBe("down");
      expect(sibling.error).toBe("sibling reported unhealthy");
    }
  });
});

// ── Caching ────────────────────────────────────────────────────────

describe("platform-siblings — caching", () => {
  test("reuses the snapshot within the 30s cache window", async () => {
    let callCount = 0;
    const fetchImpl = makeFetch(async () => {
      callCount += 1;
      return jsonResponse({
        product: "crontech",
        version: "1",
        commit: "abc",
        healthy: true,
        timestamp: "2026-04-20T12:00:00.000Z",
      });
    });

    let now = 1_000_000;
    await getPlatformSiblings({ fetchImpl, now: () => now });
    expect(callCount).toBe(3);

    // Second call, inside the 30s window — no new fetches.
    now += 10_000;
    await getPlatformSiblings({ fetchImpl, now: () => now });
    expect(callCount).toBe(3);

    // Jump past the 30s TTL — cache expires, fan-out repeats.
    now += PLATFORM_SIBLING_CACHE_TTL_MS + 1;
    await getPlatformSiblings({ fetchImpl, now: () => now });
    expect(callCount).toBe(6);
  });

  test("force: true bypasses the cache", async () => {
    let callCount = 0;
    const fetchImpl = makeFetch(async () => {
      callCount += 1;
      return jsonResponse({
        product: "crontech",
        version: "1",
        commit: "abc",
        healthy: true,
        timestamp: "2026-04-20T12:00:00.000Z",
      });
    });

    await getPlatformSiblings({ fetchImpl });
    expect(callCount).toBe(3);

    await getPlatformSiblings({ fetchImpl, force: true });
    expect(callCount).toBe(6);
  });
});
