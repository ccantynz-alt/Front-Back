// ── Feature Flags Module Exports ─────────────────────────────────

export {
  evaluateFlag,
  evaluateAllFlags,
  FlagRegistry,
  FlagContextSchema,
  FlagValueSchema,
  FlagRuleSchema,
  FlagDefinitionSchema,
  RuleConditionSchema,
  PlanSchema,
  EnvironmentSchema,
} from "./client";
export type {
  FlagContext,
  FlagValue,
  FlagRule,
  FlagDefinition,
  RuleCondition,
  Plan,
  Environment,
} from "./client";

export {
  FLAG_KEYS,
  FLAG_DEFINITIONS,
  flagRegistry,
} from "./flags";
export type { FlagKey } from "./flags";

export {
  featureFlagMiddleware,
  requireFlag,
  isFlagEnabled,
} from "./middleware";
export type { EvaluatedFlags } from "./middleware";
