// ── Feature Flag Definitions ─────────────────────────────────────
// All platform feature flags defined in one place.
// Each flag has a key, description, default value, and rules.

import { FlagRegistry, type FlagDefinition } from "./client";

// ── Flag Keys (Type-Safe Constants) ──────────────────────────────

export const FLAG_KEYS = {
  AI_MULTI_AGENT: "ai_multi_agent",
  WEBGPU_INFERENCE: "webgpu_inference",
  COLLAB_AI_PARTICIPANTS: "collab_ai_participants",
  VIDEO_PROCESSING: "video_processing",
  QDRANT_SEARCH: "qdrant_search",
  ADVANCED_RAG: "advanced_rag",
  STRIPE_BILLING: "stripe_billing",
  BETA_FEATURES: "beta_features",
} as const;

export type FlagKey = (typeof FLAG_KEYS)[keyof typeof FLAG_KEYS];

// ── Flag Definitions ─────────────────────────────────────────────

export const FLAG_DEFINITIONS: FlagDefinition[] = [
  {
    key: FLAG_KEYS.AI_MULTI_AGENT,
    description: "Enable LangGraph multi-agent workflows for complex AI tasks",
    defaultValue: false,
    rules: [
      {
        condition: { type: "plan", plans: ["team", "enterprise"] },
        value: true,
      },
      {
        condition: { type: "environment", environments: ["development"] },
        value: true,
      },
    ],
  },
  {
    key: FLAG_KEYS.WEBGPU_INFERENCE,
    description: "Enable client-side WebGPU AI inference (zero cost per token)",
    defaultValue: true,
    rules: [],
  },
  {
    key: FLAG_KEYS.COLLAB_AI_PARTICIPANTS,
    description: "Allow AI agents to participate in real-time collaboration sessions",
    defaultValue: false,
    rules: [
      {
        condition: { type: "plan", plans: ["team", "enterprise"] },
        value: true,
      },
      {
        condition: { type: "environment", environments: ["development"] },
        value: true,
      },
    ],
  },
  {
    key: FLAG_KEYS.VIDEO_PROCESSING,
    description: "Access to WebGPU-accelerated video processing pipeline",
    defaultValue: false,
    rules: [
      {
        condition: { type: "plan", plans: ["pro", "team", "enterprise"] },
        value: true,
      },
    ],
  },
  {
    key: FLAG_KEYS.QDRANT_SEARCH,
    description: "Use Qdrant vector database instead of built-in vector search",
    defaultValue: false,
    rules: [
      {
        condition: { type: "environment", environments: ["production"] },
        value: true,
      },
      {
        condition: { type: "percentage", percentage: 50 },
        value: true,
      },
    ],
  },
  {
    key: FLAG_KEYS.ADVANCED_RAG,
    description: "Enhanced RAG pipeline with hybrid search and advanced chunking",
    defaultValue: false,
    rules: [
      {
        condition: { type: "plan", plans: ["team", "enterprise"] },
        value: true,
      },
      {
        condition: { type: "environment", environments: ["development"] },
        value: true,
      },
    ],
  },
  {
    key: FLAG_KEYS.STRIPE_BILLING,
    description: "Enable Stripe billing and subscription features",
    defaultValue: true,
    rules: [
      {
        condition: { type: "environment", environments: ["development"] },
        value: false,
      },
    ],
  },
  {
    key: FLAG_KEYS.BETA_FEATURES,
    description: "General beta flag for experimental features",
    defaultValue: false,
    rules: [
      {
        condition: { type: "environment", environments: ["development", "staging"] },
        value: true,
      },
      {
        condition: { type: "percentage", percentage: 10 },
        value: true,
      },
    ],
  },
];

// ── Default Registry ─────────────────────────────────────────────

/**
 * Pre-configured flag registry with all platform flags.
 * Import and use directly:
 *
 * ```ts
 * import { flagRegistry } from "@cronix/ai-core/feature-flags";
 * const enabled = flagRegistry.isEnabled("qdrant_search", context);
 * ```
 */
export const flagRegistry = new FlagRegistry();
flagRegistry.registerAll(FLAG_DEFINITIONS);
