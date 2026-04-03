// ── Feature Flag Hono Middleware ──────────────────────────────────
// Evaluates feature flags for the current request context and
// attaches them to Hono's context. Also provides a guard middleware.

import type { Context, MiddlewareHandler } from "hono";
import { flagRegistry } from "./flags";
import type { FlagContext, FlagValue } from "./client";

// ── Types ────────────────────────────────────────────────────────

/** Evaluated flags attached to Hono context via c.set("flags", ...). */
export type EvaluatedFlags = Record<string, FlagValue>;

/** Augment Hono's variable map for type-safe c.get("flags"). */
declare module "hono" {
  interface ContextVariableMap {
    flags: EvaluatedFlags;
    flagContext: FlagContext;
  }
}

// ── Context Extraction ───────────────────────────────────────────

/**
 * Extract flag evaluation context from a Hono request.
 * Reads userId from context (set by auth middleware), plan from
 * header or context, and environment from NODE_ENV.
 */
function extractFlagContext(c: Context): FlagContext {
  // userId may be set by auth middleware
  const userId = (c.get("userId" as never) as string | undefined) ?? undefined;

  // Plan may come from auth context or a header (for testing)
  const plan = (c.get("plan" as never) as string | undefined)
    ?? c.req.header("X-User-Plan")
    ?? undefined;

  // Environment from NODE_ENV
  let environment: "development" | "staging" | "production" | undefined;
  try {
    const proc = (globalThis as Record<string, unknown>)["process"] as
      | { env: Record<string, string | undefined> }
      | undefined;
    const nodeEnv = proc?.env["NODE_ENV"];
    if (nodeEnv === "development" || nodeEnv === "staging" || nodeEnv === "production") {
      environment = nodeEnv;
    }
  } catch {
    // Default to undefined
  }

  return {
    userId,
    plan: plan as FlagContext["plan"],
    environment,
  };
}

// ── Middleware: Evaluate All Flags ────────────────────────────────

/**
 * Hono middleware that evaluates all feature flags for the current
 * request context and attaches them via c.set("flags", ...).
 *
 * Usage:
 * ```ts
 * app.use("*", featureFlagMiddleware);
 * app.get("/", (c) => {
 *   const flags = c.get("flags");
 *   if (flags["qdrant_search"] === true) { ... }
 * });
 * ```
 */
export const featureFlagMiddleware: MiddlewareHandler = async (c, next) => {
  const context = extractFlagContext(c);
  const flags = flagRegistry.evaluateAll(context);

  c.set("flags", flags);
  c.set("flagContext", context);

  await next();
};

// ── Middleware: Require Flag ─────────────────────────────────────

/**
 * Create a middleware that requires a specific flag to be enabled.
 * Returns 404 if the flag is not enabled (hides the endpoint entirely).
 *
 * Usage:
 * ```ts
 * app.post("/vectors/search", requireFlag("qdrant_search"), async (c) => {
 *   // Only reachable if qdrant_search flag is on
 * });
 * ```
 */
export function requireFlag(flagKey: string): MiddlewareHandler {
  return async (c, next) => {
    // Ensure flags are evaluated
    let flags = c.get("flags");
    if (!flags) {
      const context = extractFlagContext(c);
      flags = flagRegistry.evaluateAll(context);
      c.set("flags", flags);
      c.set("flagContext", context);
    }

    const value = flags[flagKey];
    if (value !== true) {
      return c.json({ error: "Not found" }, 404);
    }

    return next();
  };
}

/**
 * Check if a flag is enabled in the current request context.
 * Convenience function for use inside route handlers.
 */
export function isFlagEnabled(c: Context, flagKey: string): boolean {
  const flags = c.get("flags");
  if (!flags) return false;
  return flags[flagKey] === true;
}
