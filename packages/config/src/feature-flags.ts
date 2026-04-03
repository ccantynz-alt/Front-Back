/**
 * Lightweight typed feature flag system.
 *
 * Checks environment variables first (FEATURE_FLAG_<SCREAMING_SNAKE> = "true"),
 * then falls back to compiled defaults.
 */

const FLAG_DEFAULTS = {
  webgpuInference: false,
  collaborativeEditing: false,
  videoBuilder: false,
  sentinelAlerts: false,
  neonDatabase: false,
} as const;

export type FlagName = keyof typeof FLAG_DEFAULTS;

/**
 * Convert a camelCase flag name to the expected env-var name.
 * e.g. "webgpuInference" -> "FEATURE_FLAG_WEBGPU_INFERENCE"
 */
function toEnvKey(name: FlagName): string {
  return `FEATURE_FLAG_${name.replace(/([A-Z])/g, "_$1").toUpperCase()}`;
}

/**
 * Get the current value of a feature flag.
 *
 * Resolution order:
 * 1. Environment variable (FEATURE_FLAG_WEBGPU_INFERENCE=true)
 * 2. Compiled default
 */
export function getFlag(name: FlagName): boolean {
  const envValue = process.env[toEnvKey(name)];
  if (envValue !== undefined) {
    return envValue === "true" || envValue === "1";
  }
  return FLAG_DEFAULTS[name];
}

/**
 * Get all feature flags with their current resolved values.
 */
export function getAllFlags(): Record<FlagName, boolean> {
  const flags = {} as Record<FlagName, boolean>;
  for (const name of Object.keys(FLAG_DEFAULTS) as FlagName[]) {
    flags[name] = getFlag(name);
  }
  return flags;
}
