// ── Feature Flags System ─────────────────────────────────────────────
// Progressive delivery for every new capability. Nothing goes from
// zero to 100% instantly. Everything rolls out gradually, measured,
// with automatic rollback if metrics degrade.
//
// Flags are persisted to the DB and cached in-memory. On startup, flags
// load from DB into memory. `defineFlag()` still works but checks DB
// first, in-memory second. A 60-second polling loop refreshes the cache.

import { db, featureFlags as featureFlagsTable } from "@back-to-the-future/db";

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  description?: string | undefined;
  /** Percentage of users who see this feature (0-100) */
  rolloutPercentage: number;
  /** Optional: specific user IDs that always see this feature */
  allowList: string[];
  /** Optional: specific user IDs that never see this feature */
  denyList: string[];
  /** When this flag was last updated */
  updatedAt: string;
  /** Who last updated this flag */
  updatedBy?: string | undefined;
}

// ── In-Memory Flag Cache ────────────────────────────────────────────

const flags = new Map<string, FeatureFlag>();

/** Whether initial DB load has completed. */
let dbLoaded = false;

// ── DB <-> Cache Sync ───────────────────────────────────────────────

function dbRowToFlag(row: {
  id: string;
  name: string;
  enabled: boolean;
  rolloutPercent: number;
  allowList: string | null;
  denyList: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}): FeatureFlag {
  return {
    key: row.name,
    enabled: row.enabled,
    rolloutPercentage: row.rolloutPercent,
    allowList: row.allowList ? (JSON.parse(row.allowList) as string[]) : [],
    denyList: row.denyList ? (JSON.parse(row.denyList) as string[]) : [],
    updatedAt: row.updatedAt ?? new Date().toISOString(),
    updatedBy: row.updatedBy ?? undefined,
  };
}

/**
 * Load all flags from DB into in-memory cache.
 * Called on startup and every 60 seconds.
 */
export async function loadFlagsFromDB(): Promise<void> {
  try {
    const rows = await db.select().from(featureFlagsTable);
    for (const row of rows) {
      const flag = dbRowToFlag(row);
      flags.set(flag.key, flag);
    }
    dbLoaded = true;
  } catch (err) {
    console.warn("[feature-flags] DB load failed, using in-memory defaults:", err);
  }
}

/**
 * Write a flag to DB and update in-memory cache.
 */
async function persistFlag(flag: FeatureFlag): Promise<void> {
  try {
    await db
      .insert(featureFlagsTable)
      .values({
        id: crypto.randomUUID(),
        name: flag.key,
        enabled: flag.enabled,
        rolloutPercent: flag.rolloutPercentage,
        allowList: flag.allowList.length > 0 ? JSON.stringify(flag.allowList) : null,
        denyList: flag.denyList.length > 0 ? JSON.stringify(flag.denyList) : null,
        updatedAt: flag.updatedAt,
        updatedBy: flag.updatedBy ?? null,
      })
      .onConflictDoUpdate({
        target: featureFlagsTable.name,
        set: {
          enabled: flag.enabled,
          rolloutPercent: flag.rolloutPercentage,
          allowList: flag.allowList.length > 0 ? JSON.stringify(flag.allowList) : null,
          denyList: flag.denyList.length > 0 ? JSON.stringify(flag.denyList) : null,
          updatedAt: flag.updatedAt,
          updatedBy: flag.updatedBy ?? null,
        },
      });
  } catch (err) {
    console.warn("[feature-flags] DB persist failed, cache-only:", err);
  }
}

// ── Public API ──────────────────────────────────────────────────────

export function defineFlag(
  key: string,
  config: Partial<Omit<FeatureFlag, "key">> = {},
): FeatureFlag {
  // If DB has already loaded this flag, prefer the DB version
  const existing = flags.get(key);
  if (dbLoaded && existing) {
    return existing;
  }

  const flag: FeatureFlag = {
    key,
    enabled: config.enabled ?? false,
    description: config.description,
    rolloutPercentage: config.rolloutPercentage ?? 100,
    allowList: config.allowList ?? [],
    denyList: config.denyList ?? [],
    updatedAt: config.updatedAt ?? new Date().toISOString(),
    updatedBy: config.updatedBy,
  };
  flags.set(key, flag);
  return flag;
}

export function getFlag(key: string): FeatureFlag | undefined {
  return flags.get(key);
}

export function getAllFlags(): FeatureFlag[] {
  return Array.from(flags.values());
}

/**
 * Update a flag in both cache and DB.
 * Used by admin procedures for runtime flag toggling.
 */
export async function updateFlagPersisted(
  key: string,
  updates: Partial<Omit<FeatureFlag, "key">>,
): Promise<FeatureFlag | undefined> {
  const existing = flags.get(key);
  if (!existing) return undefined;

  const updated: FeatureFlag = {
    ...existing,
    ...updates,
    key, // key is immutable
    updatedAt: new Date().toISOString(),
  };
  flags.set(key, updated);
  await persistFlag(updated);
  return updated;
}

/**
 * Synchronous in-memory-only update (backwards compat).
 */
export function updateFlag(
  key: string,
  updates: Partial<Omit<FeatureFlag, "key">>,
): FeatureFlag | undefined {
  const existing = flags.get(key);
  if (!existing) return undefined;

  const updated: FeatureFlag = {
    ...existing,
    ...updates,
    key,
    updatedAt: new Date().toISOString(),
  };
  flags.set(key, updated);
  return updated;
}

export function deleteFlag(key: string): boolean {
  return flags.delete(key);
}

// ── Evaluation ───────────────────────────────────────────────────────

/** Deterministic hash for consistent rollout per user */
function hashUserPercentage(userId: string, flagKey: string): number {
  let hash = 0;
  const str = `${flagKey}:${userId}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash) % 100;
}

export function isFeatureEnabled(key: string, userId?: string): boolean {
  const flag = flags.get(key);
  if (!flag) return false;
  if (!flag.enabled) return false;

  // If no user context, just check if globally enabled
  if (!userId) return flag.rolloutPercentage === 100;

  // Deny list takes priority
  if (flag.denyList.includes(userId)) return false;

  // Allow list overrides rollout percentage
  if (flag.allowList.includes(userId)) return true;

  // Deterministic percentage-based rollout
  return hashUserPercentage(userId, key) < flag.rolloutPercentage;
}

// ── Pre-defined Feature Flags ────────────────────────────────────────

defineFlag("ai.client_inference", {
  enabled: false,
  description: "Enable client-side AI inference via WebGPU/WebLLM",
  rolloutPercentage: 0,
});

defineFlag("ai.generative_ui", {
  enabled: false,
  description: "Enable AI-powered generative UI from component catalog",
  rolloutPercentage: 0,
});

defineFlag("ai.rag_pipeline", {
  enabled: false,
  description: "Enable RAG pipeline for context-augmented AI responses",
  rolloutPercentage: 0,
});

defineFlag("collab.crdt", {
  enabled: false,
  description: "Enable Yjs CRDT real-time collaboration",
  rolloutPercentage: 0,
});

defineFlag("collab.ai_agents", {
  enabled: false,
  description: "Enable AI agents as collaboration participants",
  rolloutPercentage: 0,
});

defineFlag("compute.three_tier", {
  enabled: false,
  description: "Enable three-tier compute routing (client GPU -> edge -> cloud)",
  rolloutPercentage: 0,
});

defineFlag("video.webgpu_processing", {
  enabled: false,
  description: "Enable WebGPU-accelerated video processing",
  rolloutPercentage: 0,
});

defineFlag("sentinel.monitoring", {
  enabled: false,
  description: "Enable Sentinel competitive intelligence monitoring",
  rolloutPercentage: 0,
});

// ── Startup: load from DB + polling ─────────────────────────────────

loadFlagsFromDB().catch((err) =>
  console.warn("[feature-flags] Initial DB load failed:", err),
);

// Refresh from DB every 60 seconds
const _pollInterval = setInterval(() => {
  loadFlagsFromDB().catch((err) =>
    console.warn("[feature-flags] Poll refresh failed:", err),
  );
}, 60_000);

// Don't keep process alive for tests
if (typeof (_pollInterval as unknown as { unref?: () => void }).unref === "function") {
  (_pollInterval as unknown as { unref: () => void }).unref();
}
