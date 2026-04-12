/**
 * Hono middleware + tRPC wrapper for automatic audit logging.
 *
 * Wraps handlers so `writeAudit()` fires after every response,
 * logging action, actor, resource, result, and timing.
 */

import { createMiddleware } from "hono/factory";
import type { AuthEnv } from "../auth/middleware";
import { writeAudit, type AuditEntry } from "../automation/audit-log";
import { middleware as tMiddleware } from "../trpc/init";

// ── Hono Middleware ─────────────────────────────────────────────────

/**
 * Hono middleware that auto-logs audit entries after handler execution.
 * Attach to critical routes (auth, billing, webhooks, tenant, admin).
 *
 * @param action - Audit action verb (e.g. "auth.login", "billing.checkout")
 */
export function withAudit(action: string) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const start = Date.now();
    await next();
    const status = c.res.status;

    // Map the action string to the AuditEntry enum.
    // Default to CREATE for new resource actions, READ/UPDATE/DELETE for others.
    const auditAction = mapActionToVerb(action);

    writeAudit({
      actorId: c.get("userId") ?? "anonymous",
      action: auditAction,
      resourceType: action,
      resourceId: c.req.path,
      result: status < 400 ? "success" : "failure",
      detail: JSON.stringify({
        method: c.req.method,
        status,
        durationMs: Date.now() - start,
      }),
    }).catch((err) => {
      console.warn("[audit-middleware] Failed to write audit:", err);
    });
  });
}

// ── tRPC Procedure Middleware ────────────────────────────────────────

/**
 * tRPC middleware that auto-logs audit entries after procedure execution.
 * Use with `.use(auditMiddleware("action.name"))` on procedures.
 *
 * @param action - Audit action label (e.g. "admin.toggleFlag", "billing.checkout")
 */
export function auditMiddleware(action: string) {
  return tMiddleware(async ({ ctx, next }) => {
    const start = Date.now();
    const result = await next();
    const auditAction = mapActionToVerb(action);

    writeAudit({
      actorId: ctx.userId ?? "anonymous",
      action: auditAction,
      resourceType: action,
      resourceId: action,
      result: "success",
      detail: JSON.stringify({ durationMs: Date.now() - start }),
    }).catch((err) => {
      console.warn("[audit-middleware] Failed to write tRPC audit:", err);
    });

    return result;
  });
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Map an action string to the AuditEntry action enum.
 */
function mapActionToVerb(
  action: string,
): AuditEntry["action"] {
  const lower = action.toLowerCase();
  if (lower.includes("delete") || lower.includes("remove")) return "DELETE";
  if (lower.includes("update") || lower.includes("change") || lower.includes("toggle")) return "UPDATE";
  if (
    lower.includes("read") ||
    lower.includes("get") ||
    lower.includes("list") ||
    lower.includes("check")
  )
    return "READ";
  if (lower.includes("export")) return "EXPORT";
  if (lower.includes("sign")) return "SIGN";
  return "CREATE";
}
