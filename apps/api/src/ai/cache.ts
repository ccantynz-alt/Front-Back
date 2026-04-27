// ── AI Response Cache (Hook 4) ────────────────────────────────────────
// Content-addressable cache for any LLM/embedding call. Wraps an
// async fn so the caller writes:
//
//   const result = await cachedAICall({ model, prompt, params, tenantId },
//     () => client.chat.completions.create({ max_tokens: 256, ...opts }));
//
// On a cache hit, the wrapped fn is never invoked — the caller pays
// nothing and gets a sub-millisecond response. On a miss, we run the
// fn, stash the response, and serve it next time. Tenant-scoped so
// hits cannot leak across customers.

import { eq, lt, sql } from "drizzle-orm";
import { db, aiCache } from "@back-to-the-future/db";
import { sha256Hex, stableStringify } from "../trpc/middleware/idempotency";

// Default TTL: 7 days. Tunable per call via opts.ttlMs.
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface CacheKeyInput {
  model: string;
  prompt: string;
  params?: Record<string, unknown>;
  tenantId?: string | null;
}

export interface CacheCallOpts<T> extends CacheKeyInput {
  ttlMs?: number;
  /** Estimated tokens used by this call — recorded for cost analytics. */
  tokensUsed?: number;
  /** Estimated cost in USD micros (1e-6 dollars) — recorded for analytics. */
  costUsdMicros?: number;
  /**
   * If false, treat this as a "compute only" call: skip cache lookup
   * but still write the result. Useful when re-running an experiment
   * but you want the next call to short-circuit.
   */
  read?: boolean;
  serializer?: (value: T) => string;
  deserializer?: (raw: string) => T;
}

/**
 * Build the deterministic cache key. Same model + same prompt +
 * same params (key order independent) + same tenant → same key.
 */
export async function buildCacheKey(input: CacheKeyInput): Promise<string> {
  const payload = stableStringify({
    model: input.model,
    prompt: input.prompt,
    params: input.params ?? {},
    tenantId: input.tenantId ?? null,
  });
  return await sha256Hex(payload);
}

/**
 * Look up a cache entry by key. Returns the deserialized response on
 * hit (and increments the hit counter), undefined on miss.
 */
export async function lookupCache<T>(
  cacheKey: string,
  deserializer: (raw: string) => T = JSON.parse,
): Promise<T | undefined> {
  try {
    const rows = await db
      .select()
      .from(aiCache)
      .where(eq(aiCache.cacheKey, cacheKey))
      .limit(1);
    const row = rows[0];
    if (!row) return undefined;
    if (row.expiresAt.getTime() < Date.now()) {
      // Expired — delete and miss
      await db.delete(aiCache).where(eq(aiCache.cacheKey, cacheKey));
      return undefined;
    }
    // Bump hit count + last hit timestamp (fire and forget)
    void db
      .update(aiCache)
      .set({
        hitCount: sql`${aiCache.hitCount} + 1`,
        lastHitAt: new Date(),
      })
      .where(eq(aiCache.cacheKey, cacheKey))
      .catch((err) => {
        console.warn("[ai-cache] hit counter update failed:", err);
      });
    return deserializer(row.responseJson);
  } catch (err) {
    console.warn("[ai-cache] lookup failed:", err);
    return undefined;
  }
}

/**
 * Store a value in the cache. Idempotent on cacheKey conflict —
 * existing entries are replaced (newer responses are likely better).
 */
export async function storeCache<T>(
  cacheKey: string,
  input: CacheKeyInput,
  value: T,
  opts: {
    ttlMs?: number;
    tokensUsed?: number;
    costUsdMicros?: number;
    serializer?: (value: T) => string;
  } = {},
): Promise<void> {
  const serializer = opts.serializer ?? JSON.stringify;
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const promptHash = await sha256Hex(input.prompt);
  try {
    await db
      .insert(aiCache)
      .values({
        cacheKey,
        tenantId: input.tenantId ?? null,
        model: input.model,
        promptHash,
        responseJson: serializer(value),
        tokensUsed: opts.tokensUsed ?? 0,
        costUsd: opts.costUsdMicros ?? 0,
        hitCount: 0,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + ttlMs),
      })
      .onConflictDoUpdate({
        target: aiCache.cacheKey,
        set: {
          responseJson: serializer(value),
          tokensUsed: opts.tokensUsed ?? 0,
          costUsd: opts.costUsdMicros ?? 0,
          expiresAt: new Date(Date.now() + ttlMs),
        },
      });
  } catch (err) {
    console.warn("[ai-cache] store failed:", err);
  }
}

/**
 * Cache-aware AI call wrapper. Use this for every LLM/embedding call
 * that has deterministic-ish output. The fn is only invoked on miss.
 */
export async function cachedAICall<T>(
  opts: CacheCallOpts<T>,
  fn: () => Promise<T>,
): Promise<{ value: T; cached: boolean; cacheKey: string }> {
  const cacheKey = await buildCacheKey(opts);
  const deserializer = opts.deserializer ?? (JSON.parse as (raw: string) => T);

  if (opts.read !== false) {
    const hit = await lookupCache<T>(cacheKey, deserializer);
    if (hit !== undefined) {
      return { value: hit, cached: true, cacheKey };
    }
  }

  const value = await fn();
  const storeOpts: {
    ttlMs?: number;
    tokensUsed?: number;
    costUsdMicros?: number;
    serializer?: (value: T) => string;
  } = {};
  if (opts.ttlMs !== undefined) storeOpts.ttlMs = opts.ttlMs;
  if (opts.tokensUsed !== undefined) storeOpts.tokensUsed = opts.tokensUsed;
  if (opts.costUsdMicros !== undefined)
    storeOpts.costUsdMicros = opts.costUsdMicros;
  if (opts.serializer !== undefined) storeOpts.serializer = opts.serializer;
  await storeCache(cacheKey, opts, value, storeOpts);
  return { value, cached: false, cacheKey };
}

/**
 * Best-effort cleanup of expired cache rows. Call from a periodic
 * background job (or piggyback on idempotency cleanup).
 */
export async function cleanupExpiredCache(): Promise<number> {
  try {
    const now = new Date();
    const rows = await db
      .select({ key: aiCache.cacheKey })
      .from(aiCache)
      .where(lt(aiCache.expiresAt, now));
    if (rows.length === 0) return 0;
    await db.delete(aiCache).where(lt(aiCache.expiresAt, now));
    return rows.length;
  } catch (err) {
    console.warn("[ai-cache] cleanup failed:", err);
    return 0;
  }
}
