// ── AI Cache Tests (Hook 4) ───────────────────────────────────────────

import { describe, test, expect, beforeEach } from "bun:test";
import { eq } from "drizzle-orm";
import { db, aiCache } from "@back-to-the-future/db";
import {
  buildCacheKey,
  cachedAICall,
  lookupCache,
  storeCache,
  cleanupExpiredCache,
} from "./cache";

describe("AI cache", () => {
  beforeEach(async () => {
    await db.delete(aiCache);
  });

  test("buildCacheKey is deterministic across param key order", async () => {
    const a = await buildCacheKey({
      model: "gpt-4o",
      prompt: "hello",
      params: { temperature: 0.2, top_p: 1 },
    });
    const b = await buildCacheKey({
      model: "gpt-4o",
      prompt: "hello",
      params: { top_p: 1, temperature: 0.2 },
    });
    expect(a).toBe(b);
  });

  test("buildCacheKey differs across tenants", async () => {
    const a = await buildCacheKey({
      model: "gpt-4o",
      prompt: "hello",
      tenantId: "t1",
    });
    const b = await buildCacheKey({
      model: "gpt-4o",
      prompt: "hello",
      tenantId: "t2",
    });
    expect(a).not.toBe(b);
  });

  test("cachedAICall executes fn on miss and stores the result", async () => {
    let callCount = 0;
    const result = await cachedAICall(
      { model: "test-model", prompt: "what is 2+2", tenantId: "t-cache-1" },
      async () => {
        callCount += 1;
        return { answer: 4 };
      },
    );
    expect(callCount).toBe(1);
    expect(result.cached).toBe(false);
    expect(result.value).toEqual({ answer: 4 });

    const rows = await db
      .select()
      .from(aiCache)
      .where(eq(aiCache.cacheKey, result.cacheKey));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.model).toBe("test-model");
  });

  test("cachedAICall returns cached value on second call", async () => {
    let callCount = 0;
    const fn = async (): Promise<{ n: number }> => {
      callCount += 1;
      return { n: callCount };
    };
    const opts = {
      model: "test-model",
      prompt: "deterministic prompt",
      tenantId: "t-cache-2",
    };
    const first = await cachedAICall(opts, fn);
    const second = await cachedAICall(opts, fn);

    expect(callCount).toBe(1);
    expect(second.cached).toBe(true);
    expect(second.value).toEqual(first.value);
    expect(second.cacheKey).toBe(first.cacheKey);
  });

  test("cachedAICall does not leak across tenants", async () => {
    let callCount = 0;
    const fn = async (): Promise<{ tenant: string }> => {
      callCount += 1;
      return { tenant: `call-${callCount}` };
    };
    const a = await cachedAICall(
      { model: "m", prompt: "shared", tenantId: "tenant-a" },
      fn,
    );
    const b = await cachedAICall(
      { model: "m", prompt: "shared", tenantId: "tenant-b" },
      fn,
    );
    expect(callCount).toBe(2);
    expect(a.cacheKey).not.toBe(b.cacheKey);
    expect(a.value).not.toEqual(b.value);
  });

  test("expired entries are not returned", async () => {
    const opts = {
      model: "expire-model",
      prompt: "going stale",
      tenantId: "t-exp",
    };
    const key = await buildCacheKey(opts);
    // Insert a stale entry directly
    await storeCache(key, opts, { stale: true }, { ttlMs: -1000 });

    const hit = await lookupCache<{ stale: boolean }>(key);
    expect(hit).toBeUndefined();
  });

  test("hit count increments on each cache hit", async () => {
    const opts = {
      model: "hit-model",
      prompt: "count me",
      tenantId: "t-hits",
    };
    const fn = async (): Promise<{ ok: true }> => ({ ok: true });
    const first = await cachedAICall(opts, fn);
    await cachedAICall(opts, fn);
    await cachedAICall(opts, fn);

    // Hit counter is incremented async — give it a tick.
    await new Promise((r) => setTimeout(r, 50));

    const rows = await db
      .select()
      .from(aiCache)
      .where(eq(aiCache.cacheKey, first.cacheKey));
    expect(rows[0]?.hitCount).toBeGreaterThanOrEqual(2);
  });

  test("cleanupExpiredCache removes only stale rows", async () => {
    await storeCache(
      "fresh-key",
      { model: "m", prompt: "fresh" },
      { ok: true },
      { ttlMs: 60_000 },
    );
    await storeCache(
      "stale-key",
      { model: "m", prompt: "stale" },
      { ok: true },
      { ttlMs: -1000 },
    );

    const removed = await cleanupExpiredCache();
    expect(removed).toBeGreaterThanOrEqual(1);

    const fresh = await db
      .select()
      .from(aiCache)
      .where(eq(aiCache.cacheKey, "fresh-key"));
    expect(fresh).toHaveLength(1);

    const stale = await db
      .select()
      .from(aiCache)
      .where(eq(aiCache.cacheKey, "stale-key"));
    expect(stale).toHaveLength(0);
  });
});
