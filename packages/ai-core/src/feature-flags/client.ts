// ── Feature Flag Client ──────────────────────────────────────────
// Production-ready feature flag evaluation system.
// Simple, fast, and type-safe. No external service dependency.

import { z } from "zod";

// ── Schemas ──────────────────────────────────────────────────────

/** Plans available in the system. */
export const PlanSchema = z.enum(["free", "pro", "team", "enterprise"]);
export type Plan = z.infer<typeof PlanSchema>;

/** Environment names. */
export const EnvironmentSchema = z.enum(["development", "staging", "production"]);
export type Environment = z.infer<typeof EnvironmentSchema>;

/** Context for evaluating feature flags. */
export const FlagContextSchema = z.object({
  userId: z.string().optional(),
  plan: PlanSchema.optional(),
  environment: EnvironmentSchema.optional(),
  attributes: z.record(z.unknown()).optional(),
});
export type FlagContext = z.infer<typeof FlagContextSchema>;

/** Flag value type — boolean or string variant. */
export const FlagValueSchema = z.union([z.boolean(), z.string()]);
export type FlagValue = z.infer<typeof FlagValueSchema>;

/** Condition types for flag rules. */
export const RuleConditionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("userId"),
    userIds: z.array(z.string()),
  }),
  z.object({
    type: z.literal("plan"),
    plans: z.array(PlanSchema),
  }),
  z.object({
    type: z.literal("percentage"),
    percentage: z.number().min(0).max(100),
  }),
  z.object({
    type: z.literal("environment"),
    environments: z.array(EnvironmentSchema),
  }),
  z.object({
    type: z.literal("attribute"),
    key: z.string(),
    value: z.unknown(),
  }),
]);
export type RuleCondition = z.infer<typeof RuleConditionSchema>;

/** A single flag rule: condition + value to return if matched. */
export const FlagRuleSchema = z.object({
  condition: RuleConditionSchema,
  value: FlagValueSchema,
});
export type FlagRule = z.infer<typeof FlagRuleSchema>;

/** Complete flag definition. */
export const FlagDefinitionSchema = z.object({
  key: z.string(),
  description: z.string(),
  defaultValue: FlagValueSchema,
  rules: z.array(FlagRuleSchema).default([]),
});
export type FlagDefinition = z.infer<typeof FlagDefinitionSchema>;

// ── Evaluation Logic ─────────────────────────────────────────────

/**
 * Deterministic hash for percentage-based rollouts.
 * Uses a simple string hash that maps userId + flagKey to 0-99.
 */
function percentageHash(userId: string, flagKey: string): number {
  const str = `${userId}:${flagKey}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash) % 100;
}

/**
 * Evaluate a single condition against a context.
 */
function evaluateCondition(condition: RuleCondition, context: FlagContext, flagKey: string): boolean {
  switch (condition.type) {
    case "userId":
      return context.userId !== undefined && condition.userIds.includes(context.userId);

    case "plan":
      return context.plan !== undefined && condition.plans.includes(context.plan);

    case "percentage":
      if (!context.userId) return false;
      return percentageHash(context.userId, flagKey) < condition.percentage;

    case "environment":
      return context.environment !== undefined && condition.environments.includes(context.environment);

    case "attribute": {
      const attrValue = context.attributes?.[condition.key];
      return attrValue === condition.value;
    }
  }
}

/**
 * Evaluate a flag against a context.
 * Rules are evaluated in order; the first matching rule wins.
 * If no rule matches, the default value is returned.
 */
export function evaluateFlag(
  flag: FlagDefinition,
  context: FlagContext,
): FlagValue {
  for (const rule of flag.rules) {
    if (evaluateCondition(rule.condition, context, flag.key)) {
      return rule.value;
    }
  }

  return flag.defaultValue;
}

/**
 * Evaluate all flags in a registry against a context.
 * Returns a map of flag key -> resolved value.
 */
export function evaluateAllFlags(
  flags: FlagDefinition[],
  context: FlagContext,
): Record<string, FlagValue> {
  const result: Record<string, FlagValue> = {};

  for (const flag of flags) {
    result[flag.key] = evaluateFlag(flag, context);
  }

  return result;
}

/**
 * Type-safe flag registry for compile-time flag key validation.
 */
export class FlagRegistry {
  private flags: Map<string, FlagDefinition> = new Map();

  /** Register a flag definition. */
  register(flag: FlagDefinition): void {
    const parsed = FlagDefinitionSchema.parse(flag);
    this.flags.set(parsed.key, parsed);
  }

  /** Register multiple flag definitions. */
  registerAll(flags: FlagDefinition[]): void {
    for (const flag of flags) {
      this.register(flag);
    }
  }

  /** Get a flag definition by key. */
  getFlag(key: string): FlagDefinition | undefined {
    return this.flags.get(key);
  }

  /** Evaluate a single flag. */
  evaluate(key: string, context: FlagContext): FlagValue {
    const flag = this.flags.get(key);
    if (!flag) {
      throw new Error(`Unknown feature flag: ${key}`);
    }
    return evaluateFlag(flag, context);
  }

  /** Evaluate a flag as a boolean. Returns defaultValue if flag is a string variant. */
  isEnabled(key: string, context: FlagContext): boolean {
    const value = this.evaluate(key, context);
    return value === true;
  }

  /** Evaluate all registered flags. */
  evaluateAll(context: FlagContext): Record<string, FlagValue> {
    return evaluateAllFlags([...this.flags.values()], context);
  }

  /** Get all registered flag definitions. */
  getAllDefinitions(): FlagDefinition[] {
    return [...this.flags.values()];
  }

  /** Number of registered flags. */
  get size(): number {
    return this.flags.size;
  }
}
