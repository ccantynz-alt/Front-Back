// ── Docker Engine API Client ──────────────────────────────────────────
// Talks directly to the Docker Engine REST API via Unix socket.
// No dockerode — raw HTTP with Node's http module.

import * as http from "node:http";
import type {
  Container,
  ContainerConfig,
  ContainerInspect,
} from "./types";

const SOCKET_PATH = "/var/run/docker.sock";

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

/** Build a Docker image from a build context. */
export async function buildImage(
  contextPath: string,
  tag: string,
): Promise<string> {
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

/** Create a container (does not start it). */
export async function createContainer(
  config: ContainerConfig,
): Promise<string> {
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
