// ── Crontech Worker Runtime — Schemas & Types ──────────────────────
// Validated wire types for the worker-runtime control plane.
//
// Customers register a long-running worker (queue consumer, WebSocket
// server, daemon). The runtime downloads a build artefact, spawns a
// long-lived `Bun.spawn` subprocess, restarts on crash with exponential
// backoff, kills on resource overrun, and exposes a log stream.

import { z } from "zod";

// ── Identifiers ─────────────────────────────────────────────────────

/** kebab-case worker id, 3..63 chars. */
export const WorkerIdSchema = z
  .string()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/u, "must be kebab-case");

/** kebab-case tenant id, 3..63 chars. */
export const TenantIdSchema = z
  .string()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/u, "must be kebab-case");

export type WorkerId = z.infer<typeof WorkerIdSchema>;
export type TenantId = z.infer<typeof TenantIdSchema>;

// ── Restart policy ──────────────────────────────────────────────────

export const RestartPolicySchema = z.enum(["always", "on-failure", "never"]);
export type RestartPolicy = z.infer<typeof RestartPolicySchema>;

// ── Resource limits ─────────────────────────────────────────────────

/**
 * v1 limits are best-effort. CPU shares are documented intent — actual
 * enforcement requires Linux cgroups (see README). Memory is monitored
 * via RSS sampling; we kill the process when it exceeds `memBytes`.
 *
 * `timeoutMs` is OPTIONAL: it's only meaningful for finite jobs. A
 * queue consumer or WebSocket server has no wall-clock cap; omit the
 * field for those.
 */
export const WorkerLimitsSchema = z
  .object({
    cpuShares: z.number().int().min(1).max(8192).default(1024),
    memBytes: z
      .number()
      .int()
      .min(16 * 1024 * 1024) // 16MB floor — anything less can't host Bun
      .max(16 * 1024 * 1024 * 1024) // 16GB ceiling
      .default(256 * 1024 * 1024), // 256MB default
    timeoutMs: z.number().int().min(1_000).max(24 * 60 * 60_000).optional(),
  })
  .strict()
  .default(() => ({ cpuShares: 1024, memBytes: 256 * 1024 * 1024 }));

export type WorkerLimits = z.infer<typeof WorkerLimitsSchema>;

// ── Worker registration body ────────────────────────────────────────

/**
 * Validated form of `POST /workers`.
 *
 * `tarballUrl` + `sha256` describe the customer build artefact. The
 * supervisor verifies the digest before extracting (defence against
 * a compromised CDN serving someone else's tarball).
 *
 * `command` is the literal argv the supervisor will spawn — the first
 * element is the binary, the rest are args. We never invoke a shell.
 */
export const WorkerRegistrationSchema = z
  .object({
    workerId: WorkerIdSchema,
    tenantId: TenantIdSchema,
    tarballUrl: z.string().url(),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/u, "must be 64-char lowercase hex"),
    command: z.array(z.string().min(1)).min(1).max(64),
    env: z.record(z.string(), z.string()).default({}),
    secrets: z.record(z.string(), z.string()).default({}),
    limits: WorkerLimitsSchema,
    restartPolicy: RestartPolicySchema.default("on-failure"),
    /** Soft kill grace period (SIGTERM → SIGKILL). Default 10s. */
    gracePeriodMs: z
      .number()
      .int()
      .min(0)
      .max(120_000)
      .default(10_000),
  })
  .strict();

export type WorkerRegistration = z.infer<typeof WorkerRegistrationSchema>;

// ── Status values ───────────────────────────────────────────────────

/**
 * `starting` — supervisor has accepted /start, process not yet spawned
 *              (or extracting the tarball).
 * `running`  — process is alive.
 * `crashed`  — process exited with a non-zero code or by signal,
 *              awaiting restart per policy.
 * `stopped`  — explicitly stopped by /stop or never started.
 * `failed`   — exhausted restart attempts, no further action.
 */
export const WorkerStatusSchema = z.enum([
  "starting",
  "running",
  "crashed",
  "stopped",
  "failed",
]);
export type WorkerStatus = z.infer<typeof WorkerStatusSchema>;

// ── Log lines ───────────────────────────────────────────────────────

export type LogStream = "stdout" | "stderr";

export interface LogLine {
  readonly stream: LogStream;
  readonly timestamp: number;
  readonly text: string;
  /** Monotonically increasing per-worker; used for `?since=` cursors. */
  readonly sequence: number;
}
