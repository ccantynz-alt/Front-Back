/**
 * Public surface of @back-to-the-future/waf.
 *
 * Importers can pick the granularity they want — middleware-only, engine-only,
 * or the full kit — without dragging in the admin Hono router unless they
 * need it.
 */
export { WafEngine } from "./engine";
export type { EngineOptions } from "./engine";
export { wafMiddleware } from "./middleware";
export type { WafMiddlewareOptions } from "./middleware";
export { createAdminApp } from "./admin";
export type { AdminAppOptions } from "./admin";
export { InMemoryEventStore, InMemoryRuleStore } from "./store";
export type { EventStore, RuleStore } from "./store";
export { RateLimiter, buildKey } from "./rate-limit";
export type { RateLimitResult } from "./rate-limit";
export {
  ALLOWED_BOTS,
  BOT_UA,
  SCANNER_UA,
  SQLI_PATTERNS,
  TRAVERSAL_PATTERNS,
  XSS_PATTERNS,
  matchAny,
  uaContains,
} from "./owasp";
export {
  DecisionSchema,
  EventSchema,
  HttpMethodSchema,
  NewRuleSchema,
  OutcomeSchema,
  RateLimitSchema,
  ReasonSchema,
  RequestContextSchema,
  RuleSchema,
} from "./types";
export type {
  Decision,
  Event,
  HttpMethod,
  NewRule,
  Outcome,
  RateLimitConfig,
  Reason,
  RequestContext,
  Rule,
} from "./types";
