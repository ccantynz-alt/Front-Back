/**
 * Rule evaluation pipeline.
 *
 * Order (CLAUDE.md §0.5 — Aggressor: cheap checks first, expensive last):
 *   1. IP allowlist  → terminal allow
 *   2. IP denylist   → terminal deny
 *   3. Scanner UA    → terminal deny (sqlmap, nikto, etc.)
 *   4. Per-route rules in priority order:
 *        - rule.allow  → terminal allow
 *        - rule.deny   → terminal deny
 *        - method check → 403 if not in rule.methods
 *        - bodyDenyPatterns → terminal deny on hit
 *   5. OWASP defaults: SQLi, XSS, traversal across pathname + query + body
 *   6. Bot UA + allowed-bot whitelist (rate-limit only — never deny)
 *   7. requireAuth — 401 if not authenticated
 *   8. Rate limit (rule-level rateLimit takes precedence over none)
 *   9. Default allow
 *
 * Returns a single Outcome — the caller wires it to a 200/401/403/429 response.
 */
import {
  ALLOWED_BOTS,
  BOT_UA,
  SCANNER_UA,
  SQLI_PATTERNS,
  TRAVERSAL_PATTERNS,
  XSS_PATTERNS,
  matchAny,
  uaContains,
} from "./owasp";
import { type RateLimiter, buildKey } from "./rate-limit";
import type { RuleStore } from "./store";
import type { Outcome, RequestContext, Rule } from "./types";

export interface EngineOptions {
  /** Globally allowed IPs across all tenants (e.g. internal monitoring). */
  globalAllowIps?: readonly string[];
  /**
   * Default rate limit applied when no rule provides one. Optional — leave
   * undefined to skip default limiting.
   */
  defaultRateLimit?: import("./types").RateLimitConfig;
  /** When true (default), apply OWASP default pack. */
  enableOwaspDefaults?: boolean;
}

export class WafEngine {
  constructor(
    private readonly rules: RuleStore,
    private readonly limiter: RateLimiter,
    private readonly opts: EngineOptions = {},
  ) {}

  evaluate(ctx: RequestContext): Outcome {
    const now = ctx.now ?? Date.now();
    const enableOwasp = this.opts.enableOwaspDefaults !== false;

    if (this.opts.globalAllowIps?.includes(ctx.ip)) {
      return { decision: "allow", reason: "ip-allowlist" };
    }

    const tenantRules = this.rules.list(ctx.tenantId);
    const matched = matchRules(tenantRules, ctx);

    // 1. IP allowlist from any matched rule overrides global denies.
    for (const r of matched) {
      if (r.ipAllowlist?.includes(ctx.ip)) {
        return { decision: "allow", reason: "ip-allowlist", ruleId: r.id };
      }
    }

    // 2. IP denylist.
    for (const r of matched) {
      if (r.ipDenylist?.includes(ctx.ip)) {
        return { decision: "deny", reason: "ip-denylist", ruleId: r.id };
      }
    }

    // 3. Scanner UA — terminal deny regardless of route.
    if (ctx.userAgent && uaContains(ctx.userAgent, SCANNER_UA)) {
      return { decision: "deny", reason: "scanner-ua" };
    }

    // 4. Per-rule terminal verdicts.
    for (const r of matched) {
      if (r.allow) return { decision: "allow", reason: "rule-allow", ruleId: r.id };
      if (r.deny) return { decision: "deny", reason: "rule-deny", ruleId: r.id };

      if (r.methods.length > 0 && !r.methods.includes("*") && !r.methods.includes(ctx.method)) {
        return { decision: "deny", reason: "method-not-allowed", ruleId: r.id };
      }

      if (r.bodyDenyPatterns && r.bodyDenyPatterns.length > 0) {
        const haystack = `${ctx.pathname}\n${ctx.query}\n${ctx.body ?? ""}`;
        for (const pat of r.bodyDenyPatterns) {
          let re: RegExp;
          try {
            re = new RegExp(pat, "i");
          } catch {
            continue; // invalid user regex — skip rather than crash
          }
          if (re.test(haystack)) {
            return { decision: "deny", reason: "rule-deny", ruleId: r.id };
          }
        }
      }
    }

    // 5. OWASP defaults.
    if (enableOwasp) {
      const haystack = `${ctx.pathname}\n${ctx.query}\n${ctx.body ?? ""}`;
      if (matchAny(haystack, SQLI_PATTERNS)) {
        return { decision: "deny", reason: "owasp-sqli" };
      }
      if (matchAny(haystack, XSS_PATTERNS)) {
        return { decision: "deny", reason: "owasp-xss" };
      }
      if (matchAny(haystack, TRAVERSAL_PATTERNS)) {
        return { decision: "deny", reason: "owasp-traversal" };
      }
    }

    // 6. Bot detection — never blocks allowed bots.
    const isAllowedBot = ctx.userAgent ? uaContains(ctx.userAgent, ALLOWED_BOTS) : false;
    const isGenericBot = ctx.userAgent ? uaContains(ctx.userAgent, BOT_UA) : false;

    // 7. Auth requirement.
    for (const r of matched) {
      if (r.requireAuth && !ctx.authenticated) {
        return { decision: "auth-required", reason: "auth-required", ruleId: r.id };
      }
    }

    // 8. Rate limit (rule wins over default).
    const rlRule = matched.find((r) => r.rateLimit !== undefined);
    const rlCfg = rlRule?.rateLimit ?? this.opts.defaultRateLimit;
    if (rlCfg && !isAllowedBot) {
      const key = buildKey(rlCfg.scope, ctx.tenantId, ctx.ip);
      const result = this.limiter.check(key, rlCfg, now);
      if (!result.allowed) {
        return {
          decision: "rate-limited",
          reason: "rate-limit",
          ...(rlRule ? { ruleId: rlRule.id } : {}),
          retryAfter: result.retryAfter,
        };
      }
    }

    if (isGenericBot && !isAllowedBot) {
      // Generic bot with no specific rule: allow but tag the reason for analytics.
      return { decision: "allow", reason: "bot-ua" };
    }

    return { decision: "allow", reason: "default-allow" };
  }
}

/**
 * Find every rule whose pattern + methods match. Sorted by priority — first
 * match wins for terminal verdicts but every match contributes IP lists,
 * body patterns, etc.
 */
function matchRules(rules: readonly Rule[], ctx: RequestContext): Rule[] {
  const out: Rule[] = [];
  for (const r of rules) {
    let re: RegExp;
    try {
      re = new RegExp(r.pattern);
    } catch {
      continue; // invalid stored regex — skip
    }
    if (!re.test(ctx.pathname)) continue;
    if (
      r.methods.length > 0 &&
      !r.methods.includes("*") &&
      !r.methods.includes(ctx.method)
    ) {
      // pattern matched but method excluded — still "matched" enough for the
      // method-not-allowed check inside the engine pipeline above.
      out.push(r);
      continue;
    }
    out.push(r);
  }
  return out;
}
