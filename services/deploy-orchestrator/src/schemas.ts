import { z } from "zod";

/**
 * Frameworks the orchestrator knows how to extract an entrypoint for.
 * Adding a new framework here is a contract change — extend
 * `frameworkEntrypoint()` in pipeline.ts in lockstep.
 */
export const FrameworkSchema = z.enum([
  "solidstart",
  "nextjs",
  "remix",
  "astro",
  "sveltekit",
  "hono",
  "node",
  "static",
]);
export type Framework = z.infer<typeof FrameworkSchema>;

/**
 * Input contract: the artefact emitted by the build-runner (Wave 2 Agent 2).
 * Every deploy starts from a `BuildArtefact`. This is the single source of
 * truth that the pipeline consumes.
 */
export const BuildArtefactSchema = z.object({
  buildId: z.string().min(1),
  tenantId: z.string().min(1),
  projectId: z.string().min(1),
  sha: z.string().regex(/^[a-f0-9]{7,40}$/i, "git sha must be hex"),
  framework: FrameworkSchema,
  /** Local filesystem path (or signed URL) to the tarball. */
  tarballPath: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i, "sha256 must be 64 hex chars"),
  /** Public hostname this build will be served under. */
  hostname: z.string().min(1),
  /** Optional override for the entrypoint inside the tarball. */
  entrypointOverride: z.string().optional(),
  /** Resource limits applied to the bundle in the edge runtime. */
  limits: z
    .object({
      cpuMs: z.number().int().positive().default(50),
      memoryMb: z.number().int().positive().default(128),
    })
    .default({ cpuMs: 50, memoryMb: 128 }),
});
export type BuildArtefact = z.infer<typeof BuildArtefactSchema>;

export const DeploymentStatusSchema = z.enum([
  "queued",
  "uploading",
  "registering",
  "routing",
  "health-checking",
  "swapping",
  "live",
  "rolling-back",
  "failed",
]);
export type DeploymentStatus = z.infer<typeof DeploymentStatusSchema>;

export const DeploymentRecordSchema = z.object({
  deploymentId: z.string().min(1),
  buildId: z.string().min(1),
  tenantId: z.string().min(1),
  hostname: z.string().min(1),
  bundleId: z.string().optional(),
  previousBundleId: z.string().optional(),
  status: DeploymentStatusSchema,
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().optional(),
  liveUrl: z.string().url().optional(),
  error: z.string().optional(),
});
export type DeploymentRecord = z.infer<typeof DeploymentRecordSchema>;

/* ── Client response contracts ────────────────────────────────────────── */

export const ObjectStoragePutResponseSchema = z.object({
  bucket: z.string(),
  key: z.string(),
  etag: z.string(),
});
export type ObjectStoragePutResponse = z.infer<
  typeof ObjectStoragePutResponseSchema
>;

export const EdgeRuntimeBundleResponseSchema = z.object({
  bundleId: z.string().min(1),
  hash: z.string().min(1),
  status: z.enum(["registered", "warm", "draining"]),
});
export type EdgeRuntimeBundleResponse = z.infer<
  typeof EdgeRuntimeBundleResponseSchema
>;

export const TunnelRouteResponseSchema = z.object({
  hostname: z.string().min(1),
  bundleId: z.string().min(1),
  routeId: z.string().min(1),
});
export type TunnelRouteResponse = z.infer<typeof TunnelRouteResponseSchema>;

export const SecretsBundleSchema = z.object({
  env: z.record(z.string(), z.string()),
  secrets: z.record(z.string(), z.string()),
});
export type SecretsBundle = z.infer<typeof SecretsBundleSchema>;
