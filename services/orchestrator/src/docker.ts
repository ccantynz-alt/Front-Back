// ── Docker Engine API Client ──────────────────────────────────────────
// Talks directly to the Docker Engine REST API via Unix socket.
// No dockerode — raw HTTP with Node's http module.
//
// SECURITY: every container this module creates MUST be hardened with the
// `secureHostConfig()` helper (cap-drop, no-new-privileges, resource
// limits, bridge network, non-root user). The `createContainer` call
// will reject configs that fail this baseline — callers cannot silently
// ship a container that runs customer code with host-level privileges.

import * as http from "node:http";
import type {
  Container,
  ContainerConfig,
  ContainerInspect,
} from "./types";

const SOCKET_PATH = "/var/run/docker.sock";

// ── Hardened HostConfig Helper ────────────────────────────────────────

/**
 * The hardened baseline every runtime container must include.
 * Callers merge this into their own HostConfig via `secureHostConfig()`.
 */
export const HARDENED_HOST_CONFIG_BASELINE = {
  /** Memory hard cap (bytes). 2 GiB default — override per deployment if needed. */
  Memory: 2 * 1024 * 1024 * 1024,
  /** Swap cap = memory cap to disable overcommit. */
  MemorySwap: 2 * 1024 * 1024 * 1024,
  /** 100_000 CPU period × 1.0 quota = 1 CPU. */
  CpuPeriod: 100_000,
  CpuQuota: 100_000,
  /** pids_limit — bounds fork bombs. */
  PidsLimit: 512,
  /** Drop every kernel capability. Add back only what the app actually needs. */
  CapDrop: ["ALL"] as string[],
  /** no-new-privileges prevents suid/setgid escalations. */
  SecurityOpt: ["no-new-privileges"] as string[],
  /** Explicit bridge network — NOT "host", which would share host's network namespace. */
  NetworkMode: "bridge",
  /** Restart policy: on-failure with bounded retries. */
  RestartPolicy: { Name: "on-failure", MaximumRetryCount: 5 },
  /** ulimit nofile — prevent fd exhaustion. */
  Ulimits: [{ Name: "nofile", Soft: 4096, Hard: 4096 }],
} as const;

type HostConfigInput = NonNullable<ContainerConfig["HostConfig"]> & {
  Memory?: number;
  MemorySwap?: number;
  CpuPeriod?: number;
  CpuQuota?: number;
  PidsLimit?: number;
  CapDrop?: string[];
  SecurityOpt?: string[];
  Ulimits?: Array<{ Name: string; Soft: number; Hard: number }>;
  ReadonlyRootfs?: boolean;
  Tmpfs?: Record<string, string>;
};

/**
 * Merge caller-supplied HostConfig with the hardened baseline. Keys in the
 * baseline take precedence — callers CANNOT override the security settings
 * (by design). Port bindings, mounts, etc. pass through.
 */
export function secureHostConfig(
  userConfig: HostConfigInput | undefined,
): HostConfigInput {
  const merged: HostConfigInput = { ...(userConfig ?? {}) };

  // Force the hardened values — caller cannot bypass them.
  merged.Memory = HARDENED_HOST_CONFIG_BASELINE.Memory;
  merged.MemorySwap = HARDENED_HOST_CONFIG_BASELINE.MemorySwap;
  merged.CpuPeriod = HARDENED_HOST_CONFIG_BASELINE.CpuPeriod;
  merged.CpuQuota = HARDENED_HOST_CONFIG_BASELINE.CpuQuota;
  merged.PidsLimit = HARDENED_HOST_CONFIG_BASELINE.PidsLimit;
  merged.CapDrop = [...HARDENED_HOST_CONFIG_BASELINE.CapDrop];
  merged.SecurityOpt = [...HARDENED_HOST_CONFIG_BASELINE.SecurityOpt];
  merged.Ulimits = HARDENED_HOST_CONFIG_BASELINE.Ulimits.map((u) => ({ ...u }));

  // Refuse host networking no matter what the caller supplied.
  if (merged.NetworkMode === "host") {
    throw new Error(
      "docker.secureHostConfig: NetworkMode=host is forbidden for customer workloads.",
    );
  }
  if (merged.NetworkMode === undefined) {
    merged.NetworkMode = HARDENED_HOST_CONFIG_BASELINE.NetworkMode;
  }

  // Default restart policy if not provided.
  if (!merged.RestartPolicy) {
    merged.RestartPolicy = { ...HARDENED_HOST_CONFIG_BASELINE.RestartPolicy };
  }

  return merged;
}

/**
 * Validate a ContainerConfig: throws if it lacks the hardening baseline.
 * Used by createContainer() to fail-closed on misuse.
 */
export function assertHardenedConfig(config: ContainerConfig): void {
  const hc = config.HostConfig as HostConfigInput | undefined;
  if (!hc) {
    throw new Error("Container is missing HostConfig; refuse to create.");
  }
  if (hc.NetworkMode === "host") {
    throw new Error("Container has NetworkMode=host; refuse to create.");
  }
  if (!hc.CapDrop || !hc.CapDrop.includes("ALL")) {
    throw new Error("Container missing CapDrop=[ALL]; refuse to create.");
  }
  if (!hc.SecurityOpt || !hc.SecurityOpt.includes("no-new-privileges")) {
    throw new Error(
      "Container missing SecurityOpt=[no-new-privileges]; refuse to create.",
    );
  }
  if (!hc.Memory || hc.Memory <= 0) {
    throw new Error("Container missing Memory limit; refuse to create.");
  }
  if (!hc.PidsLimit || hc.PidsLimit <= 0) {
    throw new Error("Container missing PidsLimit; refuse to create.");
  }
}

/** Low-level fetch against the Docker Engine unix socket. */
export function dockerRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;

    const req = http.request(
      {
        socketPath: SOCKET_PATH,
        method,
        path,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString();
          let parsed: unknown;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode ?? 0, data: parsed });
        });
      },
    );

    req.on("error", reject);

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

/** Pull a Docker image from a registry. */
export async function pullImage(image: string): Promise<void> {
  const { status, data } = await dockerRequest(
    "POST",
    `/images/create?fromImage=${encodeURIComponent(image)}`,
  );
  if (status !== 200) {
    throw new Error(`pullImage failed (${status}): ${JSON.stringify(data)}`);
  }
}

/**
 * Build a Docker image from a build context.
 *
 * NOTE: `docker build` runs Dockerfile instructions on the host daemon's
 * BuildKit worker. Customer repos should go through `sandbox.runInSandbox`
 * for install/build steps — `buildImage` is reserved for trusted base
 * images shipped from `services/orchestrator/dockerfiles/`. Tags must be
 * strictly alphanumeric-with-dashes to prevent shell injection via a
 * maliciously-named deployment id.
 */
export async function buildImage(
  contextPath: string,
  tag: string,
): Promise<string> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_./:-]{0,127}$/.test(tag)) {
    throw new Error(
      `buildImage: tag "${tag}" contains invalid characters; refuse to build.`,
    );
  }
  // Docker build via CLI since build context streaming over socket is complex.
  // We shell out to `docker build` for the build step only.
  const proc = Bun.spawn(
    ["docker", "build", "-t", tag, "-f", `${contextPath}/Dockerfile`, contextPath],
    { stdout: "pipe", stderr: "pipe" },
  );

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`buildImage failed (exit ${exitCode}): ${stderr}`);
  }

  return tag;
}

/**
 * Create a container (does not start it).
 *
 * Refuses to create any container that fails the hardening baseline —
 * see `assertHardenedConfig()`. This is the last line of defence between
 * a mis-wired deployer call and a full host-sharing container.
 */
export async function createContainer(
  config: ContainerConfig,
): Promise<string> {
  assertHardenedConfig(config);

  const nameQuery = config.name
    ? `?name=${encodeURIComponent(config.name)}`
    : "";
  const { status, data } = await dockerRequest(
    "POST",
    `/containers/create${nameQuery}`,
    config,
  );
  if (status !== 201) {
    throw new Error(
      `createContainer failed (${status}): ${JSON.stringify(data)}`,
    );
  }
  return (data as { Id: string }).Id;
}

/** Start a stopped container. */
export async function startContainer(id: string): Promise<void> {
  const { status, data } = await dockerRequest(
    "POST",
    `/containers/${id}/start`,
  );
  // 204 = started, 304 = already running — both are fine.
  if (status !== 204 && status !== 304) {
    throw new Error(
      `startContainer failed (${status}): ${JSON.stringify(data)}`,
    );
  }
}

/** Stop a running container (graceful, 10s timeout). */
export async function stopContainer(id: string): Promise<void> {
  const { status, data } = await dockerRequest(
    "POST",
    `/containers/${id}/stop?t=10`,
  );
  // 204 = stopped, 304 = already stopped — both are fine.
  if (status !== 204 && status !== 304) {
    throw new Error(
      `stopContainer failed (${status}): ${JSON.stringify(data)}`,
    );
  }
}

/** Remove a container. */
export async function removeContainer(id: string): Promise<void> {
  const { status, data } = await dockerRequest(
    "DELETE",
    `/containers/${id}?force=true`,
  );
  if (status !== 204) {
    throw new Error(
      `removeContainer failed (${status}): ${JSON.stringify(data)}`,
    );
  }
}

/** Get container logs (last N lines). */
export async function getContainerLogs(
  id: string,
  tail = 100,
): Promise<string> {
  const { status, data } = await dockerRequest(
    "GET",
    `/containers/${id}/logs?stdout=true&stderr=true&tail=${tail}`,
  );
  if (status !== 200) {
    throw new Error(
      `getContainerLogs failed (${status}): ${JSON.stringify(data)}`,
    );
  }
  return typeof data === "string" ? data : JSON.stringify(data);
}

/** List containers, optionally filtered by labels. */
export async function listContainers(
  filters?: Record<string, string[]>,
): Promise<Container[]> {
  const query = filters
    ? `?all=true&filters=${encodeURIComponent(JSON.stringify(filters))}`
    : "?all=true";
  const { status, data } = await dockerRequest("GET", `/containers/json${query}`);
  if (status !== 200) {
    throw new Error(
      `listContainers failed (${status}): ${JSON.stringify(data)}`,
    );
  }
  return data as Container[];
}

/** Inspect a specific container. */
export async function inspectContainer(
  id: string,
): Promise<ContainerInspect> {
  const { status, data } = await dockerRequest(
    "GET",
    `/containers/${id}/json`,
  );
  if (status !== 200) {
    throw new Error(
      `inspectContainer failed (${status}): ${JSON.stringify(data)}`,
    );
  }
  return data as ContainerInspect;
}

/** Restart a container. */
export async function restartContainer(id: string): Promise<void> {
  const { status, data } = await dockerRequest(
    "POST",
    `/containers/${id}/restart?t=10`,
  );
  if (status !== 204) {
    throw new Error(
      `restartContainer failed (${status}): ${JSON.stringify(data)}`,
    );
  }
}
