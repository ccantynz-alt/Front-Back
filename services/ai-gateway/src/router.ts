// ── AI Gateway Provider Router ────────────────────────────────────────
// Pure helpers: map a model identifier to the upstream provider name and
// build/walk fallback chains. No I/O, no side effects — easy to unit-test.

import type { ProviderName } from "./types";

// Re-exported so callers don't reach into types.ts for a single name.
export type { ProviderName } from "./types";

interface PrefixRule {
  prefix: string;
  provider: ProviderName;
}

/**
 * Provider routing table. Order matters — the first match wins. Lower-cased
 * comparison. Update this list (NOT the function body) to onboard a model.
 */
const PROVIDER_PREFIX_RULES: readonly PrefixRule[] = [
  { prefix: "anthropic/", provider: "anthropic" },
  { prefix: "claude-", provider: "anthropic" },
  { prefix: "claude.", provider: "anthropic" },
  { prefix: "claude/", provider: "anthropic" },
  { prefix: "openai/", provider: "openai" },
  { prefix: "gpt-", provider: "openai" },
  { prefix: "o1-", provider: "openai" },
  { prefix: "o3-", provider: "openai" },
  { prefix: "o4-", provider: "openai" },
  { prefix: "o1.", provider: "openai" },
  { prefix: "o3.", provider: "openai" },
  { prefix: "o4.", provider: "openai" },
  { prefix: "google/", provider: "google" },
  { prefix: "gemini-", provider: "google" },
  { prefix: "gemini/", provider: "google" },
  { prefix: "groq/", provider: "groq" },
  { prefix: "llama3-groq", provider: "groq" },
  { prefix: "llama-3.1-", provider: "groq" },
  { prefix: "llama-3.3-", provider: "groq" },
  { prefix: "mixtral-", provider: "groq" },
  { prefix: "mistral/", provider: "mistral" },
  { prefix: "mistral-", provider: "mistral" },
  { prefix: "open-mistral", provider: "mistral" },
  { prefix: "open-mixtral", provider: "mistral" },
  { prefix: "codestral-", provider: "mistral" },
  { prefix: "webgpu/", provider: "webgpu" },
  { prefix: "local/", provider: "webgpu" },
];

/**
 * Resolve which upstream provider should serve a given model id.
 *
 * Default fallback → anthropic (per CLAUDE.md §3 AI stack: Claude is primary).
 */
export function resolveProvider(model: string): ProviderName {
  const id = model.trim().toLowerCase();
  if (id.length === 0) {
    return "anthropic";
  }
  for (const rule of PROVIDER_PREFIX_RULES) {
    if (id.startsWith(rule.prefix)) {
      return rule.provider;
    }
  }
  return "anthropic";
}

/**
 * Pick the failover provider opposite to the primary (legacy v0 behaviour
 * preserved for backwards compat with the old single-hop path).
 *
 * For v1 multi-step chains, prefer `nextInChain`.
 */
export function failoverProvider(primary: ProviderName): ProviderName {
  return primary === "anthropic" ? "openai" : "anthropic";
}

/**
 * Decide whether a non-2xx response from a provider should trigger failover.
 * Failover ONLY on 5xx (transient infra) or network/timeout errors (status 0).
 * 4xx is the caller's fault and is surfaced directly so quota/auth errors
 * aren't masked.
 */
export function shouldFailover(status: number): boolean {
  if (status === 0) {
    return true; // network error / timeout
  }
  return status >= 500 && status <= 599;
}

/**
 * Given the primary provider and an optional configured fallback chain,
 * return the de-duplicated ordered list of providers to try.
 *
 * Examples:
 *   buildFallbackChain("anthropic", ["openai", "groq", "anthropic"])
 *   → ["anthropic", "openai", "groq"]
 *   buildFallbackChain("anthropic", undefined)
 *   → ["anthropic", "openai"]    // v0 opposite-vendor default
 *
 * The primary is always first; duplicates are removed; the WebGPU virtual
 * provider is filtered out of automatic fallback (it's a passthrough sink,
 * not a fallback target). When no chain is configured, we fall back to the
 * v0 opposite-vendor single hop so customers without explicit config still
 * get failover for free.
 */
export function buildFallbackChain(
  primary: ProviderName,
  configured: readonly ProviderName[] | undefined,
): ProviderName[] {
  const out: ProviderName[] = [primary];
  const seen = new Set<ProviderName>([primary]);

  if (configured === undefined || configured.length === 0) {
    // Default: opposite-vendor single hop (v0-compatible).
    if (primary !== "webgpu") {
      const opposite: ProviderName = primary === "anthropic" ? "openai" : "anthropic";
      if (!seen.has(opposite)) {
        seen.add(opposite);
        out.push(opposite);
      }
    }
    return out;
  }

  for (const p of configured) {
    if (seen.has(p)) {
      continue;
    }
    if (p === "webgpu") {
      continue;
    }
    seen.add(p);
    out.push(p);
  }
  return out;
}
