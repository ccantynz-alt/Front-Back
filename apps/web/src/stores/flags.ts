// ── Feature Flags Client Store ───────────────────────────────────────
// Reactive feature flag state: evaluated flags fetched from the API,
// isEnabled helper, and auto-refresh on plan changes.
// Uses module-level signals for global reactive state.

import { type Accessor, createEffect, createResource, createSignal } from "solid-js";
import { isServer } from "solid-js/web";

// ── Types ────────────────────────────────────────────────────────────

export type FlagValue = boolean | string | number;

export interface FlagDefinition {
  key: string;
  value: FlagValue;
  variant?: string;
  source: "api" | "default" | "override";
}

export interface FlagsStore {
  /** All evaluated flags */
  flags: Accessor<ReadonlyMap<string, FlagDefinition>>;
  /** Whether flags are loading */
  isLoading: Accessor<boolean>;
  /** Error from loading flags */
  error: Accessor<string | null>;
  /** Whether flags have been loaded at least once */
  isReady: Accessor<boolean>;
  /** Check if a boolean flag is enabled */
  isEnabled: (key: string, defaultValue?: boolean) => boolean;
  /** Get a flag value (any type) */
  getValue: <T extends FlagValue>(key: string, defaultValue: T) => T;
  /** Get a flag's variant string */
  getVariant: (key: string) => string | undefined;
  /** Set a local override for a flag (dev/testing) */
  setOverride: (key: string, value: FlagValue) => void;
  /** Clear a local override */
  clearOverride: (key: string) => void;
  /** Clear all local overrides */
  clearAllOverrides: () => void;
  /** Refresh flags from the server */
  refresh: () => void;
  /** Trigger refresh when plan changes (call from billing store) */
  onPlanChange: (planTier: string) => void;
}

// ── Constants ────────────────────────────────────────────────────────

const FLAGS_CACHE_KEY = "cronix_feature_flags";
const FLAGS_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

// ── Helpers ──────────────────────────────────────────────────────────

function loadCachedFlags(): Map<string, FlagDefinition> {
  if (isServer) return new Map();
  try {
    const cached = localStorage.getItem(FLAGS_CACHE_KEY);
    if (cached) {
      const entries = JSON.parse(cached) as Array<[string, FlagDefinition]>;
      return new Map(entries);
    }
  } catch {
    // Cache unavailable or corrupt
  }
  return new Map();
}

function persistFlags(flags: ReadonlyMap<string, FlagDefinition>): void {
  if (isServer) return;
  try {
    const entries = Array.from(flags.entries()).filter(([, def]) => def.source !== "override");
    localStorage.setItem(FLAGS_CACHE_KEY, JSON.stringify(entries));
  } catch {
    // Storage unavailable
  }
}

// ── API Fetcher ──────────────────────────────────────────────────────

interface FlagsResponse {
  flags: Array<{
    key: string;
    value: FlagValue;
    variant?: string;
  }>;
}

async function fetchFlags(context?: string): Promise<Map<string, FlagDefinition>> {
  const url = context
    ? `/api/trpc/flags.evaluate?context=${encodeURIComponent(context)}`
    : "/api/trpc/flags.evaluate";

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch flags: ${response.statusText}`);
  }
  const data = (await response.json()) as { result: { data: FlagsResponse } };
  const map = new Map<string, FlagDefinition>();
  for (const flag of data.result.data.flags) {
    map.set(flag.key, {
      key: flag.key,
      value: flag.value,
      variant: flag.variant,
      source: "api",
    });
  }
  return map;
}

// ── Signals ──────────────────────────────────────────────────────────

const [flags, setFlags] = createSignal<ReadonlyMap<string, FlagDefinition>>(loadCachedFlags());
const [overrides, setOverrides] = createSignal<ReadonlyMap<string, FlagDefinition>>(new Map());
const [error, setError] = createSignal<string | null>(null);
const [isReady, setIsReady] = createSignal<boolean>(loadCachedFlags().size > 0);
const [planContext, setPlanContext] = createSignal<string>("");

// Async flag loading
const [flagsResource, { refetch: refetchFlags }] = createResource<Map<string, FlagDefinition>>(
  () => (!isServer ? planContext() || "default" : false),
  async (ctx): Promise<Map<string, FlagDefinition>> => {
    try {
      setError(null);
      const fetched = await fetchFlags(typeof ctx === "string" ? ctx : undefined);
      setFlags(fetched);
      persistFlags(fetched);
      setIsReady(true);
      return fetched;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load feature flags";
      setError(message);
      throw err;
    }
  },
);

// ── Derived: Merged Flags (API + Overrides) ──────────────────────────

const mergedFlags: Accessor<ReadonlyMap<string, FlagDefinition>> = (): ReadonlyMap<string, FlagDefinition> => {
  const base = flags();
  const ovr = overrides();
  if (ovr.size === 0) return base;
  const merged = new Map(base);
  for (const [key, def] of ovr) {
    merged.set(key, def);
  }
  return merged;
};

const isLoading: Accessor<boolean> = (): boolean => flagsResource.loading;

// ── Periodic Refresh (client-side only) ──────────────────────────────

if (!isServer) {
  setInterval((): void => {
    refetchFlags();
  }, FLAGS_REFRESH_INTERVAL);
}

// ── Actions ──────────────────────────────────────────────────────────

function isEnabled(key: string, defaultValue?: boolean): boolean {
  const def = mergedFlags().get(key);
  if (!def) return defaultValue ?? false;
  return def.value === true;
}

function getValue<T extends FlagValue>(key: string, defaultValue: T): T {
  const def = mergedFlags().get(key);
  if (!def) return defaultValue;
  return def.value as T;
}

function getVariant(key: string): string | undefined {
  const def = mergedFlags().get(key);
  return def?.variant;
}

function setOverride(key: string, value: FlagValue): void {
  setOverrides((prev) => {
    const next = new Map(prev);
    next.set(key, { key, value, source: "override" });
    return next;
  });
}

function clearOverride(key: string): void {
  setOverrides((prev) => {
    const next = new Map(prev);
    next.delete(key);
    return next;
  });
}

function clearAllOverrides(): void {
  setOverrides(new Map());
}

function refresh(): void {
  refetchFlags();
}

function onPlanChange(planTier: string): void {
  setPlanContext(planTier);
  // createResource will automatically refetch when planContext changes
}

// ── Exported Store ───────────────────────────────────────────────────

export const flagsStore: FlagsStore = {
  flags: mergedFlags,
  isLoading,
  error,
  isReady,
  isEnabled,
  getValue,
  getVariant,
  setOverride,
  clearOverride,
  clearAllOverrides,
  refresh,
  onPlanChange,
};

export function useFlags(): FlagsStore {
  return flagsStore;
}
