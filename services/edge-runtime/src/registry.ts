// ── Crontech Edge Runtime — Bundle Registry ─────────────────────────
// Pure in-memory storage for deployed bundles. v1 is process-local;
// future versions will back this with Turso so a multi-region fleet
// can share state.
//
// A "bundle" is a self-contained JavaScript artifact (already built —
// the runtime does not transpile, it only executes) plus a stable id
// and a content hash. Each bundle also carries:
//   * `env`     — public, non-sensitive values bound to globalThis.env.
//   * `secrets` — sensitive values bound to globalThis.env. Stored
//                 separately so the public registry view can omit them.
//   * `limits`  — per-invocation time + memory ceilings.
//
// The hash is computed by the dispatch layer; the registry just stores
// what it is told.

import { z } from "zod";
import { DEFAULT_LIMITS, type InvocationLimits } from "./limits";

// ── Schemas ─────────────────────────────────────────────────────────

/**
 * Identifier rules: lowercase letters, digits, dashes, and underscores.
 * Length 1-100. This is the path segment used by `/run/:id/*`, so it
 * must be URL-safe and reasonable in logs.
 */
export const BundleIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9_-]+$/, {
    message: "id must be lowercase alphanumerics, dashes, or underscores",
  });

/**
 * Env var key rules: standard POSIX-shell-friendly identifier so the
 * customer can write `env.MY_VAR`. Disallows characters that would let
 * a tenant inject keys that collide with reserved globals.
 */
export const EnvKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, {
    message: "env keys must match /^[A-Za-z_][A-Za-z0-9_]*$/",
  });

const EnvMapSchema = z.record(EnvKeySchema, z.string().max(64 * 1024));

const LimitsSchema = z.object({
  timeoutMs: z.number().int().min(50).max(60_000),
  memoryMb: z.number().int().min(8).max(1024),
});

export const BundleSchema = z.object({
  id: BundleIdSchema,
  /** Already-built JS source. v1 only supports a single string entry. */
  code: z.string().min(1).max(2_000_000),
  /** Optional human-readable entrypoint label, e.g. "worker.js". */
  entrypoint: z.string().min(1).max(200).default("worker.js"),
  /** Public env vars exposed to the bundle as `globalThis.env.<key>`. */
  env: EnvMapSchema.default({}),
  /** Secret env vars exposed alongside `env` but never returned in list(). */
  secrets: EnvMapSchema.default({}),
  /** Per-invocation limits. Falls back to DEFAULT_LIMITS when omitted. */
  limits: LimitsSchema.optional(),
});

export type BundleId = z.infer<typeof BundleIdSchema>;
export type BundleInput = z.infer<typeof BundleSchema>;

export interface RegisteredBundle {
  readonly id: BundleId;
  readonly code: string;
  readonly entrypoint: string;
  readonly hash: string;
  readonly registeredAt: number;
  readonly env: Readonly<Record<string, string>>;
  readonly secrets: Readonly<Record<string, string>>;
  readonly limits: InvocationLimits;
}

export interface PublicBundleSummary {
  readonly id: BundleId;
  readonly entrypoint: string;
  readonly hash: string;
  readonly registeredAt: number;
  readonly codeBytes: number;
  /** Public env keys (values omitted in case they contain large blobs). */
  readonly envKeys: readonly string[];
  /** Secret keys (names only, never values). */
  readonly secretKeys: readonly string[];
  readonly limits: InvocationLimits;
}

/**
 * Apply v1 defaults to a registered bundle. Used by the HTTP layer when
 * an admin upserts a bundle that omits `limits`.
 */
export function withDefaultLimits(
  limits: InvocationLimits | undefined,
): InvocationLimits {
  return limits ?? DEFAULT_LIMITS;
}

// ── Registry ────────────────────────────────────────────────────────

export class BundleRegistry {
  private readonly bundles = new Map<BundleId, RegisteredBundle>();

  /**
   * Insert or replace a bundle. The caller is responsible for the hash
   * (computed via {@link computeBundleHash} in dispatch.ts).
   */
  set(bundle: RegisteredBundle): RegisteredBundle {
    this.bundles.set(bundle.id, bundle);
    return bundle;
  }

  get(id: BundleId): RegisteredBundle | undefined {
    return this.bundles.get(id);
  }

  delete(id: BundleId): boolean {
    return this.bundles.delete(id);
  }

  has(id: BundleId): boolean {
    return this.bundles.has(id);
  }

  /**
   * Returns a defensive snapshot; callers cannot mutate the registry by
   * mutating the returned array. Secret values are never included —
   * only key names.
   */
  list(): PublicBundleSummary[] {
    const out: PublicBundleSummary[] = [];
    for (const b of this.bundles.values()) {
      out.push({
        id: b.id,
        entrypoint: b.entrypoint,
        hash: b.hash,
        registeredAt: b.registeredAt,
        codeBytes: b.code.length,
        envKeys: Object.keys(b.env).sort(),
        secretKeys: Object.keys(b.secrets).sort(),
        limits: b.limits,
      });
    }
    out.sort((a, b) => a.id.localeCompare(b.id));
    return out;
  }

  size(): number {
    return this.bundles.size;
  }

  clear(): void {
    this.bundles.clear();
  }
}
