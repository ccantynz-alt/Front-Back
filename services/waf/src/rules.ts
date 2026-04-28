/**
 * Convenience builders for common rule shapes. The middleware accepts raw
 * Rule objects, but most callers want the named builders below — they keep
 * the call site readable and immune to schema drift.
 */
import type { NewRule, Rule } from "./types";

export function denyRule(tenantId: string, id: string, pattern: string): Rule {
  return {
    id,
    tenantId,
    pattern,
    methods: ["*"],
    deny: true,
    priority: 50,
    createdAt: Date.now(),
  };
}

export function allowRule(tenantId: string, id: string, pattern: string, ipAllowlist: string[]): Rule {
  return {
    id,
    tenantId,
    pattern,
    methods: ["*"],
    allow: true,
    ipAllowlist,
    priority: 10, // run before denies
    createdAt: Date.now(),
  };
}

export function rateLimitRule(
  tenantId: string,
  id: string,
  pattern: string,
  limit: number,
  windowMs: number,
  scope: "ip" | "tenant" = "ip",
): Rule {
  return {
    id,
    tenantId,
    pattern,
    methods: ["*"],
    rateLimit: { limit, windowMs, scope, algorithm: "token-bucket" },
    priority: 100,
    createdAt: Date.now(),
  };
}

export function authRequiredRule(tenantId: string, id: string, pattern: string): Rule {
  return {
    id,
    tenantId,
    pattern,
    methods: ["*"],
    requireAuth: true,
    priority: 75,
    createdAt: Date.now(),
  };
}

/**
 * Inflate a NewRule (no id, no tenantId, no createdAt) into a full Rule. Used
 * by the admin POST handler and by tests that want minimal boilerplate.
 */
export function materialize(input: NewRule, tenantId: string, id: string, now = Date.now()): Rule {
  return {
    id,
    tenantId,
    pattern: input.pattern,
    methods: input.methods,
    priority: input.priority,
    createdAt: now,
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.allow !== undefined ? { allow: input.allow } : {}),
    ...(input.deny !== undefined ? { deny: input.deny } : {}),
    ...(input.rateLimit !== undefined ? { rateLimit: input.rateLimit } : {}),
    ...(input.requireAuth !== undefined ? { requireAuth: input.requireAuth } : {}),
    ...(input.ipAllowlist !== undefined ? { ipAllowlist: input.ipAllowlist } : {}),
    ...(input.ipDenylist !== undefined ? { ipDenylist: input.ipDenylist } : {}),
    ...(input.bodyDenyPatterns !== undefined ? { bodyDenyPatterns: input.bodyDenyPatterns } : {}),
  };
}
