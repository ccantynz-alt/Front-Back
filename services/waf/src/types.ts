/**
 * Core WAF types — Zod-validated at every boundary per CLAUDE.md §6.1.
 *
 * The WAF sits in front of a tenant's customer routes and decides per request
 * whether to allow, deny, rate-limit, or pass through. Every decision returns
 * a structured outcome so dashboards and audit logs can render reasons without
 * string parsing.
 */
import { z } from "zod";

export const HttpMethodSchema = z.enum([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "*",
]);
export type HttpMethod = z.infer<typeof HttpMethodSchema>;

export const RateLimitSchema = z.object({
  /** Total tokens / requests allowed in the window. */
  limit: z.number().int().positive(),
  /** Window length in milliseconds. */
  windowMs: z.number().int().positive(),
  /** Per-IP (default) or per-tenant aggregation. */
  scope: z.enum(["ip", "tenant"]).default("ip"),
  /**
   * Algorithm:
   *   - "token-bucket" (default): refills continuously, smooth bursts allowed.
   *   - "sliding-window": counts hits in the rolling windowMs, strict.
   */
  algorithm: z.enum(["token-bucket", "sliding-window"]).default("token-bucket"),
});
export type RateLimitConfig = z.infer<typeof RateLimitSchema>;

/**
 * A WAF rule. Rules are matched in priority order (lower = first). The first
 * matching rule whose pattern + methods + headers match wins. allow/deny is
 * the terminal action; rateLimit/requireAuth are advisory and evaluated
 * after allow/deny in the pipeline.
 */
export const RuleSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  description: z.string().optional(),
  /**
   * Path pattern. Matched as a regex against the request pathname. Use "^/api"
   * to match a prefix or ".*" for catch-all. Patterns are anchored by the
   * caller — no implicit `^`/`$` is added.
   */
  pattern: z.string().min(1),
  methods: z.array(HttpMethodSchema).default(["*"]),
  /**
   * Terminal allow. If true, bypasses deny + bot + rateLimit (e.g. trusted
   * health-check IPs). Equivalent of an allowlist override.
   */
  allow: z.boolean().optional(),
  /** Terminal deny. If true, request is blocked with 403. */
  deny: z.boolean().optional(),
  /** Optional rate limit applied when this rule matches. */
  rateLimit: RateLimitSchema.optional(),
  /** Mark route as auth-required; WAF returns 401 if missing. */
  requireAuth: z.boolean().optional(),
  /** Optional priority. Lower runs first. Defaults to 100. */
  priority: z.number().int().default(100),
  /** Optional IP allowlist that overrides default deny rules. */
  ipAllowlist: z.array(z.string()).optional(),
  /** Optional IP denylist. */
  ipDenylist: z.array(z.string()).optional(),
  /** OWASP-style body / query inspection: regex patterns to match against. */
  bodyDenyPatterns: z.array(z.string()).optional(),
  createdAt: z.number().int().default(() => Date.now()),
});
export type Rule = z.infer<typeof RuleSchema>;

export const NewRuleSchema = RuleSchema.omit({
  id: true,
  createdAt: true,
  tenantId: true,
}).extend({
  id: z.string().min(1).optional(),
});
export type NewRule = z.infer<typeof NewRuleSchema>;

export const DecisionSchema = z.enum(["allow", "deny", "rate-limited", "auth-required"]);
export type Decision = z.infer<typeof DecisionSchema>;

export const ReasonSchema = z.enum([
  "ip-allowlist",
  "ip-denylist",
  "default-allow",
  "rule-allow",
  "rule-deny",
  "owasp-sqli",
  "owasp-xss",
  "owasp-traversal",
  "scanner-ua",
  "bot-ua",
  "rate-limit",
  "auth-required",
  "method-not-allowed",
]);
export type Reason = z.infer<typeof ReasonSchema>;

export const OutcomeSchema = z.object({
  decision: DecisionSchema,
  reason: ReasonSchema,
  ruleId: z.string().optional(),
  /** Retry-after suggestion in seconds for rate-limited responses. */
  retryAfter: z.number().int().nonnegative().optional(),
});
export type Outcome = z.infer<typeof OutcomeSchema>;

export const RequestContextSchema = z.object({
  tenantId: z.string().min(1),
  method: HttpMethodSchema,
  pathname: z.string().min(1),
  ip: z.string().min(1),
  userAgent: z.string().default(""),
  /** Optional pre-resolved auth principal id; WAF only checks presence. */
  authenticated: z.boolean().default(false),
  /** Pre-read body string (small payloads only) — used for OWASP body match. */
  body: z.string().optional(),
  /** Query string. */
  query: z.string().default(""),
  /** Wall clock injected for deterministic tests. */
  now: z.number().int().nonnegative().optional(),
});
export type RequestContext = z.infer<typeof RequestContextSchema>;

export const EventSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  ts: z.number().int().nonnegative(),
  ip: z.string().min(1),
  method: HttpMethodSchema,
  pathname: z.string().min(1),
  userAgent: z.string().default(""),
  outcome: OutcomeSchema,
});
export type Event = z.infer<typeof EventSchema>;
