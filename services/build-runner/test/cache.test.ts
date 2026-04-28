// ── cache key + cache store tests ─────────────────────────────────────

import { describe, expect, test } from "bun:test";
import { computeCacheKey } from "../src/cache";

const probeWith = (files: Record<string, Uint8Array | null>) => ({
  read: async (filepath: string) => files[filepath] ?? null,
});

describe("computeCacheKey", () => {
  test("returns null when no lockfile is present", async () => {
    const probe = probeWith({});
    const key = await computeCacheKey("/checkout", probe);
    expect(key).toBeNull();
  });

  test("computes a stable sha256 from bun.lock contents", async () => {
    const lock = new TextEncoder().encode("locked-content");
    const probe = probeWith({ "/checkout/bun.lock": lock });
    const key1 = await computeCacheKey("/checkout", probe);
    const key2 = await computeCacheKey("/checkout", probe);
    expect(key1).toEqual(key2);
    expect(key1).toMatch(/^[a-f0-9]{64}$/);
  });

  test("different lockfile content → different cache key", async () => {
    const probeA = probeWith({
      "/checkout/bun.lock": new TextEncoder().encode("a"),
    });
    const probeB = probeWith({
      "/checkout/bun.lock": new TextEncoder().encode("b"),
    });
    const ka = await computeCacheKey("/checkout", probeA);
    const kb = await computeCacheKey("/checkout", probeB);
    expect(ka).not.toEqual(kb);
  });

  test("different package managers do not collide on identical content", async () => {
    const same = new TextEncoder().encode("same-bytes");
    const probeBun = probeWith({ "/checkout/bun.lock": same });
    const probeNpm = probeWith({ "/checkout/package-lock.json": same });
    const kBun = await computeCacheKey("/checkout", probeBun);
    const kNpm = await computeCacheKey("/checkout", probeNpm);
    expect(kBun).not.toEqual(kNpm);
  });

  test("priority: bun.lock wins over package-lock.json", async () => {
    const probeBoth = probeWith({
      "/checkout/bun.lock": new TextEncoder().encode("bun"),
      "/checkout/package-lock.json": new TextEncoder().encode("npm"),
    });
    const probeNpmOnly = probeWith({
      "/checkout/package-lock.json": new TextEncoder().encode("npm"),
    });
    const kBoth = await computeCacheKey("/checkout", probeBoth);
    const kNpm = await computeCacheKey("/checkout", probeNpmOnly);
    // If bun.lock won, kBoth would be hash(bun) + "bun.lock". It must NOT
    // equal the npm-only key.
    expect(kBoth).not.toEqual(kNpm);
  });
});
