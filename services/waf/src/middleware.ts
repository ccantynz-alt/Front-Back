/**
 * Hono middleware adapter — pipes a request through the WAF engine and
 * short-circuits on deny / rate-limit / auth-required.
 *
 * Usage (in apps/api):
 *   import { wafMiddleware, WafEngine, ... } from "@back-to-the-future/waf";
 *   app.use("*", wafMiddleware({ engine, resolveTenantId: c => c.req.header("x-tenant-id") }));
 */
import type { Context, MiddlewareHandler } from "hono";
import type { WafEngine } from "./engine";
import type { EventStore } from "./store";
import type { Outcome, RequestContext } from "./types";

export interface WafMiddlewareOptions {
  engine: WafEngine;
  /** Resolve tenant id from the request — header, JWT claim, subdomain, etc. */
  resolveTenantId: (c: Context) => string | undefined;
  /** Optional event sink for the dashboard. */
  events?: EventStore;
  /**
   * If a body is required for OWASP body-pattern matching, set this to a
   * positive byte limit. v1 default: 0 (no body inspection in middleware).
   * Body matching still works when the caller supplies ctx.body manually.
   */
  bodyByteLimit?: number;
  /** Override the request id factory for tests. */
  idFactory?: () => string;
}

const ipFromHeaders = (c: Context): string => {
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0];
    if (first) return first.trim();
  }
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-real-ip") ?? "0.0.0.0";
};

const defaultIdFactory = (): string =>
  `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

export function wafMiddleware(opts: WafMiddlewareOptions): MiddlewareHandler {
  const idFactory = opts.idFactory ?? defaultIdFactory;
  return async (c, next) => {
    const tenantId = opts.resolveTenantId(c);
    if (!tenantId) {
      return c.json({ error: "missing tenant id" }, 400);
    }

    let body: string | undefined;
    if (opts.bodyByteLimit && opts.bodyByteLimit > 0) {
      const ct = c.req.header("content-type") ?? "";
      if (ct.includes("application/json") || ct.includes("text/")) {
        try {
          const text = await c.req.text();
          body = text.slice(0, opts.bodyByteLimit);
        } catch {
          body = undefined;
        }
      }
    }

    const url = new URL(c.req.url);
    const method = c.req.method.toUpperCase() as RequestContext["method"];
    const ctx: RequestContext = {
      tenantId,
      method,
      pathname: url.pathname,
      ip: ipFromHeaders(c),
      userAgent: c.req.header("user-agent") ?? "",
      authenticated: c.get("authenticated") === true,
      query: url.search,
      ...(body !== undefined ? { body } : {}),
    };

    const outcome = opts.engine.evaluate(ctx);
    logEvent(opts.events, idFactory, ctx, outcome);

    switch (outcome.decision) {
      case "deny":
        return c.json({ error: "forbidden", reason: outcome.reason }, 403);
      case "rate-limited":
        return c.json(
          { error: "rate limited", reason: outcome.reason, retryAfter: outcome.retryAfter ?? 1 },
          429,
          { "Retry-After": String(outcome.retryAfter ?? 1) },
        );
      case "auth-required":
        return c.json({ error: "authentication required" }, 401);
      case "allow":
        await next();
        return;
    }
  };
}

function logEvent(
  events: EventStore | undefined,
  idFactory: () => string,
  ctx: RequestContext,
  outcome: Outcome,
): void {
  if (!events) return;
  events.append({
    id: idFactory(),
    tenantId: ctx.tenantId,
    ts: ctx.now ?? Date.now(),
    ip: ctx.ip,
    method: ctx.method,
    pathname: ctx.pathname,
    userAgent: ctx.userAgent,
    outcome,
  });
}
