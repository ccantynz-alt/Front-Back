// ── build-runner schemas ────────────────────────────────────────────────
// Zod schemas at every boundary (CLAUDE.md §6.1). The BuildRequest is the
// input contract from the orchestrator; the BuildArtefact is the handoff
// to the deploy stage.
//
// AGENT 3 NOTE — the orchestrator (deploy-orchestrator) consumes
// `BuildArtefact`. The shape is locked by `buildArtefactSchema` below.
// Fields the orchestrator should rely on:
//   - `buildId`, `sha`           — identity / addressability
//   - `framework`                — informs runtime/serving strategy
//   - `tarballPath`, `sha256`    — content-addressable artefact
//   - `sizeBytes`, `durationMs`  — billing / SLO metrics
//   - `exitCode`, `cacheHit`     — success signalling + cache analytics

import { z } from "zod";

export const frameworkSchema = z.enum([
  "solidstart",
  "nextjs",
  "astro",
  "vite",
  "bun",
  "node",
  "static",
  "unknown",
]);
export type Framework = z.infer<typeof frameworkSchema>;

// ── inbound: BuildRequest ─────────────────────────────────────────────
export const buildRequestSchema = z.object({
  buildId: z.string().min(1),
  tenantId: z.string().min(1),
  repo: z.string().url(),
  ref: z.string().min(1),
  sha: z
    .string()
    .min(7)
    .max(64)
    .regex(/^[a-f0-9]+$/i, "sha must be hex"),
  gitToken: z.string().min(1).optional(),
  buildCommand: z.string().min(1).default("bun install && bun run build"),
  installCommand: z.string().min(1).default("bun install --frozen-lockfile"),
  outputDir: z.string().min(1).default("dist"),
  // limits — best-effort; cgroups used when host supports it
  timeoutMs: z.number().int().positive().default(10 * 60 * 1000),
  memoryLimitBytes: z
    .number()
    .int()
    .positive()
    .default(4 * 1024 * 1024 * 1024),
  // env exposed to the customer build (allowlist; secrets injected separately)
  env: z.record(z.string(), z.string()).default({}),
});
export type BuildRequest = z.infer<typeof buildRequestSchema>;

// ── outbound: BuildArtefact ───────────────────────────────────────────
export const buildArtefactSchema = z.object({
  buildId: z.string().min(1),
  tenantId: z.string().min(1),
  sha: z.string().min(7),
  framework: frameworkSchema,
  tarballPath: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z
    .string()
    .length(64)
    .regex(/^[a-f0-9]+$/, "sha256 must be 64-char hex"),
  durationMs: z.number().int().nonnegative(),
  exitCode: z.number().int(),
  cacheHit: z.boolean(),
  outputDir: z.string().min(1),
  detectedAt: z.string().datetime(),
});
export type BuildArtefact = z.infer<typeof buildArtefactSchema>;

// ── log streaming ─────────────────────────────────────────────────────
export const logStreamSchema = z.enum(["stdout", "stderr", "system"]);
export type LogStream = z.infer<typeof logStreamSchema>;

export const logLineSchema = z.object({
  buildId: z.string(),
  stream: logStreamSchema,
  line: z.string(),
  ts: z.number().int(),
});
export type LogLine = z.infer<typeof logLineSchema>;

// ── failure modes (typed; CLAUDE.md §6.4 forbids `catch (e: any)`) ───
export type BuildFailureCode =
  | "CLONE_FAILED"
  | "INSTALL_FAILED"
  | "BUILD_FAILED"
  | "TIMEOUT"
  | "OUTPUT_DIR_MISSING"
  | "TARBALL_FAILED"
  | "VALIDATION_FAILED";

export interface BuildFailure {
  code: BuildFailureCode;
  message: string;
  exitCode: number;
  durationMs: number;
}

export type BuildResult =
  | { ok: true; artefact: BuildArtefact; cleanup: () => Promise<void> }
  | { ok: false; failure: BuildFailure };
