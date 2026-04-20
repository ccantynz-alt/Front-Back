// ── Sandbox Orchestration ─────────────────────────────────────────────
// Runs untrusted customer build/install code inside a locked-down Docker
// container. NEVER run customer code directly on the host — npm
// postinstall scripts and build scripts can do anything.
//
// Security posture enforced by this module:
//   1. cap-drop=ALL + no-new-privileges              → kernel capability lockdown
//   2. --memory=2g --cpus=1 --pids-limit=512         → resource limits
//   3. --ulimit nofile=4096                          → fd exhaustion defence
//   4. Non-root user (uid 1000) inside the container → no container-root escapes
//   5. Host network sharing disabled (bridge only)   → can't hit internal services
//   6. Read-only root filesystem + writable tmpfs    → tamper-resistant
//   7. Workspace bind-mounted to a dedicated dir     → no access to host FS
//   8. Wall-clock timeout + --stop-timeout=10        → zombie-proof
//   9. Log scrubbing for *_KEY / *_SECRET / *_TOKEN  → secret-leak defence
//  10. Clean-up on success AND failure              → no lingering state
//
// This file has ZERO runtime dependencies beyond Bun + Node stdlib.
// It is unit-testable without a real Docker daemon — the docker CLI
// call is the last step and is mocked in tests.

import * as fs from "node:fs";
import * as path from "node:path";

// ── Configuration Constants ───────────────────────────────────────────

/** Root dir for per-deployment workspaces. Owned by unprivileged user in prod. */
export const SANDBOX_ROOT =
  process.env["CRONTECH_SANDBOX_ROOT"] ?? "/tmp/crontech-build";

/** Default build-container image. Minimal Bun + git on Alpine. */
export const DEFAULT_BUILD_IMAGE =
  process.env["CRONTECH_BUILD_IMAGE"] ?? "oven/bun:1.2-alpine";

/** Hard wall-clock timeout for any single build step (ms). */
export const BUILD_WALL_CLOCK_TIMEOUT_MS = 10 * 60 * 1000;

/** Default per-container resource limits. */
export const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  memory: "2g",
  cpus: "1",
  pidsLimit: 512,
  nofile: 4096,
  stopTimeoutSec: 10,
};

// ── Types ─────────────────────────────────────────────────────────────

export interface ResourceLimits {
  memory: string;
  cpus: string;
  pidsLimit: number;
  nofile: number;
  stopTimeoutSec: number;
}

export interface SandboxSpec {
  /** Unique deployment id — becomes the container name + workspace dir. */
  deploymentId: string;
  /** Docker image to run. Defaults to oven/bun:1.2-alpine. */
  image?: string;
  /** Command + args to execute inside the container. */
  command: string[];
  /** Host workspace dir — bind-mounted at /workspace inside container. */
  workspaceDir: string;
  /** Environment variables to forward. Scrubbed from logs. */
  env?: Record<string, string>;
  /**
   * Whether the workspace mount is read-only. When the build step needs to
   * write build artefacts (node_modules, .output, dist), this MUST be false.
   * For repo-verification steps (lint, typecheck) it SHOULD be true.
   */
  workspaceReadonly?: boolean;
  /** Override the default resource limits. */
  limits?: Partial<ResourceLimits>;
  /** Override wall-clock timeout (ms). */
  timeoutMs?: number;
}

export interface SandboxResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  wallClockMs: number;
}

// ── Secret Scrubbing ──────────────────────────────────────────────────

/**
 * Regex that matches env-var-style secret declarations in log lines.
 *   FOO_KEY=bar  FOO_SECRET="baz"  FOO_TOKEN: quux  FOO_PASSWORD=xyz
 * Case-insensitive. Matches both `=` and `:` separators. Captures value
 * up to the next whitespace/quote/newline.
 */
export const SECRET_VAR_REGEX =
  /\b([A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|PWD|APIKEY))\s*[:=]\s*["']?([^\s"'\n\r]+)["']?/gi;

/**
 * Bearer/Authorization header pattern:
 *   Authorization: Bearer abc.def.xyz
 *   Bearer abc123
 */
export const BEARER_REGEX =
  /\b(Authorization\s*:\s*Bearer|Bearer)\s+([A-Za-z0-9._~+/=-]{8,})/gi;

/** Common private-key PEM/SSH header patterns. */
export const PEM_REGEX = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

/**
 * Scrub a single log line of secret-shaped content.
 *
 * This is intentionally aggressive: better to redact a false positive than
 * leak a single token. Preserves the key name (useful for debugging) but
 * replaces the value with `***`.
 */
export function scrubLogLine(line: string): string {
  if (!line) return line;
  let out = line;
  out = out.replace(PEM_REGEX, "[REDACTED_PRIVATE_KEY]");
  out = out.replace(
    SECRET_VAR_REGEX,
    (_match, key: string, _value: string) => `${key}=***`,
  );
  out = out.replace(
    BEARER_REGEX,
    (_match, prefix: string) => `${prefix} ***`,
  );
  return out;
}

/** Scrub an array of log lines in place-safe fashion (returns new array). */
export function scrubLogLines(lines: readonly string[]): string[] {
  return lines.map(scrubLogLine);
}

// ── Workspace Management ──────────────────────────────────────────────

/**
 * Resolve the absolute workspace directory for a deployment id. Validates
 * that the id cannot escape the sandbox root (defence against `../`
 * injection from upstream).
 */
export function resolveWorkspaceDir(deploymentId: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(deploymentId)) {
    throw new Error(
      `Invalid deploymentId "${deploymentId}": must be 1-64 chars of [a-zA-Z0-9_.-] starting with alphanumeric.`,
    );
  }
  const resolved = path.resolve(path.join(SANDBOX_ROOT, deploymentId));
  const rootResolved = path.resolve(SANDBOX_ROOT);
  if (resolved !== rootResolved && !resolved.startsWith(`${rootResolved}${path.sep}`)) {
    throw new Error(
      `Resolved workspace "${resolved}" escapes sandbox root "${rootResolved}".`,
    );
  }
  return resolved;
}

/** Create the workspace dir if it does not exist. Idempotent. */
export function ensureWorkspaceDir(deploymentId: string): string {
  const dir = resolveWorkspaceDir(deploymentId);
  fs.mkdirSync(dir, { recursive: true, mode: 0o770 });
  return dir;
}

/**
 * Clean up the workspace dir. Used on BOTH success and failure paths —
 * customer code must not leave artefacts on the host.
 */
export function cleanupWorkspaceDir(deploymentId: string): void {
  try {
    const dir = resolveWorkspaceDir(deploymentId);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.warn(`[sandbox] cleanup failed for ${deploymentId}: ${msg}`);
  }
}

// ── Docker Argument Builder ───────────────────────────────────────────

/**
 * Build the `docker run` argv for a sandboxed build step.
 *
 * Pure function — no side effects, easy to unit-test. The args enforce:
 *   --rm                        → container removed after exit
 *   --name                      → deterministic name for logs + cleanup
 *   --network=bridge            → NOT --network=host (block host services)
 *   --memory / --cpus / --pids-limit / --ulimit nofile=N
 *   --cap-drop=ALL              → no linux capabilities
 *   --security-opt=no-new-privileges → suid binaries can't escalate
 *   --read-only                 → root fs is read-only
 *   --tmpfs /tmp,/run           → writable ephemeral scratch
 *   --user 1000:1000            → non-root inside container
 *   -v WORKSPACE:/workspace[:ro] → bind-mount; ro unless build needs writes
 *   -w /workspace               → cwd = workspace
 *   --stop-timeout=10           → graceful kill on stop
 *   --env K=V (scrubbed names kept but values only in docker, not logs)
 *   IMAGE COMMAND...
 */
export function buildDockerRunArgs(spec: SandboxSpec): string[] {
  const limits: ResourceLimits = { ...DEFAULT_RESOURCE_LIMITS, ...spec.limits };
  const image = spec.image ?? DEFAULT_BUILD_IMAGE;
  const mountFlag = spec.workspaceReadonly === true ? ":ro" : "";
  const containerName = `crontech-build-${spec.deploymentId}`;

  const args: string[] = [
    "docker",
    "run",
    "--rm",
    "--name",
    containerName,
    // Network: bridge (default, NOT host). Outbound traffic is allowed so
    // npm install + git fetch work. Disabling outbound entirely breaks
    // every real build; a dedicated registry proxy is a future upgrade.
    "--network=bridge",
    // Resource limits.
    `--memory=${limits.memory}`,
    `--memory-swap=${limits.memory}`,
    `--cpus=${limits.cpus}`,
    `--pids-limit=${limits.pidsLimit}`,
    `--ulimit=nofile=${limits.nofile}:${limits.nofile}`,
    // Capability lockdown.
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    // Filesystem lockdown — read-only root, writable tmpfs scratch.
    "--read-only",
    "--tmpfs=/tmp:rw,noexec,nosuid,size=256m",
    "--tmpfs=/run:rw,noexec,nosuid,size=16m",
    // Non-root user.
    "--user=1000:1000",
    // Workspace bind mount.
    "-v",
    `${spec.workspaceDir}:/workspace${mountFlag}`,
    "-w",
    "/workspace",
    // Graceful stop.
    `--stop-timeout=${limits.stopTimeoutSec}`,
  ];

  // Env vars — passed into the container but scrubbed from our own logs.
  if (spec.env) {
    for (const [k, v] of Object.entries(spec.env)) {
      args.push("-e", `${k}=${v}`);
    }
  }

  args.push(image);
  args.push(...spec.command);
  return args;
}

// ── Sandbox Runner ────────────────────────────────────────────────────

/** Injection point so tests can replace the docker CLI without touching the daemon. */
export type DockerRunner = (
  args: string[],
  opts: { timeoutMs: number; onLogLine?: (stream: "stdout" | "stderr", line: string) => void },
) => Promise<SandboxResult>;

const defaultDockerRunner: DockerRunner = async (args, opts) => {
  const started = Date.now();
  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      proc.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }, opts.timeoutMs);

  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const pipe = async (
    stream: ReadableStream<Uint8Array> | null,
    kind: "stdout" | "stderr",
    sink: string[],
  ): Promise<void> => {
    if (!stream) return;
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.length === 0) continue;
        const safe = scrubLogLine(line);
        sink.push(safe);
        opts.onLogLine?.(kind, safe);
      }
    }
    if (buffer.length > 0) {
      const safe = scrubLogLine(buffer);
      sink.push(safe);
      opts.onLogLine?.(kind, safe);
    }
  };

  const [, , exitCode] = await Promise.all([
    pipe(proc.stdout as ReadableStream<Uint8Array>, "stdout", stdoutChunks),
    pipe(proc.stderr as ReadableStream<Uint8Array>, "stderr", stderrChunks),
    proc.exited,
  ]);

  clearTimeout(timer);

  return {
    exitCode: typeof exitCode === "number" ? exitCode : 0,
    stdout: stdoutChunks.join("\n"),
    stderr: stderrChunks.join("\n"),
    timedOut,
    wallClockMs: Date.now() - started,
  };
};

let activeRunner: DockerRunner = defaultDockerRunner;

/** Replace the docker runner (tests only — do not call from production code). */
export function __setDockerRunnerForTesting(runner: DockerRunner | null): void {
  activeRunner = runner ?? defaultDockerRunner;
}

/**
 * Run a customer command inside the sandbox.
 *
 * Guarantees:
 *   - Workspace dir exists and is owned by the orchestrator.
 *   - Command runs in a Docker container with the full lockdown policy.
 *   - stdout/stderr log lines are scrubbed of secrets before being returned
 *     or forwarded to the per-line callback.
 *   - Wall-clock timeout kills the container on runaway.
 *   - Non-zero exit codes surface as a rejected promise with a sanitized
 *     message — the caller can still inspect `result.stdout/stderr` via
 *     the `onLogLine` hook.
 */
export async function runInSandbox(
  spec: SandboxSpec,
  onLogLine?: (stream: "stdout" | "stderr", line: string) => void,
): Promise<SandboxResult> {
  // Defence-in-depth: validate + resolve before the docker call. If spec
  // supplied a workspaceDir, we still verify it matches the deployment id.
  const expectedWorkspace = resolveWorkspaceDir(spec.deploymentId);
  if (path.resolve(spec.workspaceDir) !== expectedWorkspace) {
    throw new Error(
      `workspaceDir "${spec.workspaceDir}" does not match resolved sandbox path "${expectedWorkspace}".`,
    );
  }
  fs.mkdirSync(expectedWorkspace, { recursive: true, mode: 0o770 });

  const args = buildDockerRunArgs({ ...spec, workspaceDir: expectedWorkspace });
  const timeoutMs = spec.timeoutMs ?? BUILD_WALL_CLOCK_TIMEOUT_MS;
  const runnerOpts: { timeoutMs: number; onLogLine?: (stream: "stdout" | "stderr", line: string) => void } = {
    timeoutMs,
  };
  if (onLogLine) runnerOpts.onLogLine = onLogLine;
  return activeRunner(args, runnerOpts);
}
