// ── Crontech Edge Runtime — Bundle Registry ─────────────────────────
// Pure in-memory storage for deployed bundles. v0 is process-local;
// v1 will back this with Turso so a multi-region fleet can share state.
//
// A "bundle" is a self-contained JavaScript artifact (already built —
// the runtime does not transpile, it only executes) plus a stable id
// and a content hash. The hash is computed by the dispatch layer; the
// registry just stores what it is told.

import { z } from "zod";

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

export const BundleSchema = z.object({
  id: BundleIdSchema,
  /** Already-built JS source. v0 only supports a single string entry. */
  code: z.string().min(1).max(2_000_000),
  /** Optional human-readable entrypoint label, e.g. "worker.js". */
  entrypoint: z.string().min(1).max(200).default("worker.js"),
});

export type BundleId = z.infer<typeof BundleIdSchema>;
export type BundleInput = z.infer<typeof BundleSchema>;

export interface RegisteredBundle {
  readonly id: BundleId;
  readonly code: string;
  readonly entrypoint: string;
  readonly hash: string;
  readonly registeredAt: number;
}

export interface PublicBundleSummary {
  readonly id: BundleId;
  readonly entrypoint: string;
  readonly hash: string;
  readonly registeredAt: number;
  readonly codeBytes: number;
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
   * mutating the returned array.
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
