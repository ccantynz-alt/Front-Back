// ── Per-Customer API Key Store ────────────────────────────────────────
// In-memory key registry. Production swap: Turso / D1 backed lookup with
// bcrypt-hashed tokens and a 60s LRU in front. The interface stays the
// same — `lookup(token)` returns the key record or undefined. Nothing
// in `index.ts` depends on the storage backend.

import type { GatewayApiKey } from "./types";

export interface ApiKeyStore {
  lookup(token: string): GatewayApiKey | undefined;
  add(key: GatewayApiKey): void;
  remove(token: string): boolean;
  list(): GatewayApiKey[];
}

export class InMemoryApiKeyStore implements ApiKeyStore {
  private readonly byToken = new Map<string, GatewayApiKey>();

  constructor(initial: GatewayApiKey[] = []) {
    for (const k of initial) {
      this.byToken.set(k.token, k);
    }
  }

  lookup(token: string): GatewayApiKey | undefined {
    return this.byToken.get(token);
  }

  add(key: GatewayApiKey): void {
    this.byToken.set(key.token, key);
  }

  remove(token: string): boolean {
    return this.byToken.delete(token);
  }

  list(): GatewayApiKey[] {
    return Array.from(this.byToken.values());
  }
}

/**
 * Pull API keys from the `AI_GATEWAY_API_KEYS` env var. Format:
 *   `token1:cust_a:byok,token2:cust_b:managed`
 * Customer-supplied provider keys live in separate env vars
 * (`AI_GATEWAY_BYOK_<TOKEN>_<PROVIDER>`) so they don't end up in process
 * lists. The format is intentionally minimal — for a real deployment,
 * the orchestrator service writes records to Turso and we point the
 * store at that table.
 */
export function loadKeysFromEnv(env: Record<string, string | undefined>): GatewayApiKey[] {
  const raw = env["AI_GATEWAY_API_KEYS"];
  if (!raw) {
    return [];
  }
  const out: GatewayApiKey[] = [];
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }
    const parts = trimmed.split(":");
    const token = parts[0]?.trim();
    const customerId = parts[1]?.trim();
    const mode = parts[2]?.trim();
    if (!token || !customerId) {
      continue;
    }
    const resolvedMode: GatewayApiKey["mode"] = mode === "byok" ? "byok" : "managed";
    out.push({
      token,
      customerId,
      mode: resolvedMode,
    });
  }
  return out;
}
