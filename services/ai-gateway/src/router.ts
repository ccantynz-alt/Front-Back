// ── AI Gateway Provider Router ────────────────────────────────────────
// Pure helper: maps a model identifier to the upstream provider name.
// No I/O, no side effects — easy to unit-test.

export type ProviderName = "anthropic" | "openai";

/**
 * Resolve which upstream provider should serve a given model id.
 *
 * Rules (deterministic, lower-cased match):
 *   - anthropic/* OR claude-* OR claude.* → anthropic
 *   - gpt-* OR o1-* OR o3-* OR o4-* OR openai/* → openai
 *   - default fallback → anthropic (per CLAUDE.md §3 AI stack: Claude is primary)
 */
export function resolveProvider(model: string): ProviderName {
  const id = model.trim().toLowerCase();
  if (id.length === 0) {
    return "anthropic";
  }
  if (
    id.startsWith("anthropic/") ||
    id.startsWith("claude-") ||
    id.startsWith("claude.") ||
    id.startsWith("claude/")
  ) {
    return "anthropic";
  }
  if (
    id.startsWith("openai/") ||
    id.startsWith("gpt-") ||
    id.startsWith("o1-") ||
    id.startsWith("o3-") ||
    id.startsWith("o4-") ||
    id.startsWith("o1.") ||
    id.startsWith("o3.") ||
    id.startsWith("o4.")
  ) {
    return "openai";
  }
  return "anthropic";
}

/**
 * Pick the failover provider opposite to the primary.
 * Used when the primary returns 5xx and we retry once on the other vendor.
 */
export function failoverProvider(primary: ProviderName): ProviderName {
  return primary === "anthropic" ? "openai" : "anthropic";
}

/**
 * Decide whether a non-2xx response from a provider should trigger failover.
 * Failover ONLY on 5xx (transient infra). 4xx is the caller's fault and is
 * surfaced directly so quota/auth errors aren't masked.
 */
export function shouldFailover(status: number): boolean {
  return status >= 500 && status <= 599;
}
