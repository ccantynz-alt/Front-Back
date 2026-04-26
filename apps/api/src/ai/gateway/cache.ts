/**
 * AI Gateway — in-memory cache + key derivation.
 *
 * v1 uses a process-local Map — good enough for a single-node deploy.
 * Future PRs can swap to Cloudflare KV / Redis without changing the
 * public surface (the `GatewayCache` shape is the contract).
 */

import type { ChatMessage } from "./schemas";
import type { ChatCompletionResponse } from "./schemas";

interface CacheEntry {
  value: ChatCompletionResponse;
  expiresAt: number;
}

/** In-memory map keyed by SHA-256(provider, model, normalized_messages). */
export class GatewayCache {
  private readonly entries = new Map<string, CacheEntry>();

  get(key: string): ChatCompletionResponse | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt < Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: ChatCompletionResponse, ttlMs: number): void {
    if (ttlMs <= 0) return;
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /** Test-only helper to wipe the cache between cases. */
  clear(): void {
    this.entries.clear();
  }
}

/**
 * Build the cache key. The hash covers provider + model + the message
 * list, normalised so that whitespace at the edges does not produce
 * cache misses for what is semantically the same prompt.
 */
export async function buildCacheKey(
  provider: string,
  model: string,
  messages: readonly ChatMessage[],
): Promise<string> {
  const normalised = messages.map((m) => ({
    role: m.role,
    content: m.content.trim(),
  }));
  const payload = JSON.stringify({ provider, model, messages: normalised });
  const bytes = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Parse the optional `x-cache-ttl` header. Bad input is treated as
 * "do not cache" rather than an error so a malformed header from a
 * client cannot fail an otherwise-valid request. Capped at 24h so an
 * attacker cannot pin garbage in cache forever.
 */
export function parseTtlHeader(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 24 * 60 * 60);
}
