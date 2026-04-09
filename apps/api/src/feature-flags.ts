// ── Feature Flags System ─────────────────────────────────────────────
// Progressive delivery for every new capability. Nothing goes from
// zero to 100% instantly. Everything rolls out gradually, measured,
// with automatic rollback if metrics degrade.

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
}

// ── In-Memory Flag Store (upgradeable to PostHog/Unleash) ────────────

const flags = new Map<string, FeatureFlag>();

export function defineFlag(
  key: string,
  config: Partial<Omit<FeatureFlag, "key">> = {},
): FeatureFlag {
  const flag: FeatureFlag = {
    key,
    enabled: config.enabled ?? false,
    description: config.description,
    rolloutPercentage: config.rolloutPercentage ?? 100,
    allowList: config.allowList ?? [],
    denyList: config.denyList ?? [],
    updatedAt: config.updatedAt ?? new Date().toISOString(),
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

export function updateFlag(
  key: string,
  updates: Partial<Omit<FeatureFlag, "key">>,
): FeatureFlag | undefined {
  const existing = flags.get(key);
  if (!existing) return undefined;

  const updated: FeatureFlag = {
    ...existing,
    ...updates,
    key, // key is immutable
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
