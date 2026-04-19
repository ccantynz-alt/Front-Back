// ── BLK-025 Domain Search: Orchestrator Unit Tests ──────────────────

import { describe, test, expect } from "bun:test";
import {
  searchDomains,
  DomainSearchCache,
  __resetDefaultCacheForTests,
  DEFAULT_TLDS,
} from "./index";
import type { SoaResolver } from "./availability";

function mkResolver(taken: ReadonlySet<string>): SoaResolver {
  return {
    async resolveSoa(name: string): Promise<unknown> {
      if (taken.has(name)) return { nsname: "ns1.example." };
      const err = new Error("ENOTFOUND") as Error & { code: string };
      err.code = "ENOTFOUND";
      throw err;
    },
  };
}

describe("searchDomains", () => {
  test("splits results into available / taken / unknown buckets", async () => {
    __resetDefaultCacheForTests();
    const cache = new DomainSearchCache(60_000);
    const resolver = mkResolver(new Set(["nova.com"]));
    const out = await searchDomains(
      { query: "nova", tlds: ["com", "io", "ai"] },
      { resolver },
      cache,
    );
    expect(out.label).toBe("nova");
    expect(out.taken.map((r) => r.domain)).toEqual(["nova.com"]);
    expect(out.available.map((r) => r.domain).sort()).toEqual([
      "nova.ai",
      "nova.io",
    ]);
    expect(out.unknown).toEqual([]);
    expect(out.cached).toBe(false);
  });

  test("invalid query returns a polite note without throwing", async () => {
    __resetDefaultCacheForTests();
    const out = await searchDomains({ query: "..." });
    expect(out.label).toBeNull();
    expect(out.available).toEqual([]);
    expect(out.suggestionsNote).toBeDefined();
  });

  test("cache returns the second identical call", async () => {
    const cache = new DomainSearchCache(60_000);
    const resolver = mkResolver(new Set());
    let calls = 0;
    const wrapped: SoaResolver = {
      async resolveSoa(name: string) {
        calls++;
        return resolver.resolveSoa(name);
      },
    };
    const a = await searchDomains(
      { query: "cachetest", tlds: ["com"] },
      { resolver: wrapped },
      cache,
    );
    const b = await searchDomains(
      { query: "cachetest", tlds: ["com"] },
      { resolver: wrapped },
      cache,
    );
    expect(a.cached).toBe(false);
    expect(b.cached).toBe(true);
    // Second call should not have incremented the resolver count
    expect(calls).toBe(1);
  });

  test("cache respects ttl expiry", async () => {
    const cache = new DomainSearchCache(10);
    const resolver = mkResolver(new Set());
    let now = 1_000_000;
    const a = await searchDomains(
      { query: "ttltest", tlds: ["com"] },
      { resolver, now: () => now },
      cache,
    );
    expect(a.cached).toBe(false);
    // Advance past TTL
    now += 500;
    const b = await searchDomains(
      { query: "ttltest", tlds: ["com"] },
      { resolver, now: () => now },
      cache,
    );
    expect(b.cached).toBe(false);
  });

  test("different include flags produce different cache keys", async () => {
    const cache = new DomainSearchCache(60_000);
    const resolver = mkResolver(new Set());
    const a = await searchDomains(
      { query: "flags", tlds: ["com"], includeAiSuggestions: false },
      { resolver },
      cache,
    );
    const b = await searchDomains(
      { query: "flags", tlds: ["com"], includeAiSuggestions: true },
      { resolver },
      cache,
    );
    // Shared query but different shape → second call is not a cache hit
    expect(a.cached).toBe(false);
    expect(b.cached).toBe(false);
  });

  test("DEFAULT_TLDS is used when no tlds passed", async () => {
    const cache = new DomainSearchCache(60_000);
    const resolver = mkResolver(new Set());
    const out = await searchDomains(
      { query: "defaults" },
      { resolver },
      cache,
    );
    expect(out.available.length).toBe(DEFAULT_TLDS.length);
  });
});
