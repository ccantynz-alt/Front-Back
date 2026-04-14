// ── Core Deploy Orchestration ─────────────────────────────────────────
// Manages the full lifecycle of app deployments: clone, build, run,
// configure reverse proxy, health check.

import * as fs from "node:fs";
import * as path from "node:path";
import {
  buildImage,
  createContainer,
  startContainer,
  stopContainer,
  removeContainer,
  getContainerLogs,
  listContainers,
  inspectContainer,
} from "./docker";
import { addRoute, removeRoute } from "./caddy";
import type {
  DeployRequest,
  DeployResult,
  AppStatus,
  ContainerConfig,
} from "./types";

const APPS_DIR = "/opt/crontech/apps";
const DOCKERFILES_DIR = path.join(import.meta.dir, "..", "dockerfiles");
const CONTAINER_PREFIX = "crontech-";
const LABEL_MANAGED = "crontech.managed";
const LABEL_APP = "crontech.app";
const LABEL_DOMAIN = "crontech.domain";
const LABEL_PORT = "crontech.port";

/** Clone or pull a git repository to the local apps directory. */
async function cloneOrPull(
  repoUrl: string,
  branch: string,
  appDir: string,
): Promise<void> {
  if (fs.existsSync(path.join(appDir, ".git"))) {
    // Pull latest
    const pull = Bun.spawn(["git", "-C", appDir, "pull", "origin", branch], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await pull.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(pull.stderr).text();
      throw new Error(`git pull failed: ${stderr}`);
    }
  } else {
    // Clone fresh
    fs.mkdirSync(appDir, { recursive: true });
    const clone = Bun.spawn(
      ["git", "clone", "--branch", branch, "--depth", "1", repoUrl, appDir],
      { stdout: "pipe", stderr: "pipe" },
    );
    const exitCode = await clone.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(clone.stderr).text();
      throw new Error(`git clone failed: ${stderr}`);
    }
  }
}

/** Copy the runtime-appropriate Dockerfile into the app directory. */
function copyDockerfile(runtime: "nextjs" | "bun", appDir: string): void {
  const src = path.join(DOCKERFILES_DIR, `Dockerfile.${runtime}`);
  const dest = path.join(appDir, "Dockerfile");

  if (!fs.existsSync(src)) {
    throw new Error(`Dockerfile template not found: ${src}`);
  }
  fs.copyFileSync(src, dest);
}

/** Wait for a container to become healthy (poll container status). */
async function waitForHealth(
  containerId: string,
  port: number,
  maxAttempts = 15,
): Promise<"pass" | "fail"> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2_000));

    try {
      const info = await inspectContainer(containerId);
      if (!info.State.Running) continue;

      // Try HTTP health check
      const res = await fetch(`http://localhost:${port}/health`, {
        signal: AbortSignal.timeout(3_000),
      });
      if (res.ok) return "pass";
    } catch {
      // Container not ready yet — keep polling
    }
  }
  return "fail";
}

/** Find existing container for an app. */
async function findExistingContainer(
  appName: string,
): Promise<string | null> {
  const containers = await listContainers({
    label: [`${LABEL_APP}=${appName}`],
  });
  const container = containers[0];
  return container ? container.Id : null;
}

// ── Public API ────────────────────────────────────────────────────────

/** Deploy an app: clone -> build -> stop old -> start new -> health -> route. */
export async function deploy(req: DeployRequest): Promise<DeployResult> {
  const appDir = path.join(APPS_DIR, req.appName);
  const imageTag = `${CONTAINER_PREFIX}${req.appName}:latest`;
  const containerName = `${CONTAINER_PREFIX}${req.appName}`;

  console.log(`[deploy] Starting deploy for ${req.appName}...`);

  // 1. Clone or pull repo
  console.log(`[deploy] Cloning ${req.repoUrl} (${req.branch})...`);
  await cloneOrPull(req.repoUrl, req.branch, appDir);

  // 2. Copy appropriate Dockerfile
  console.log(`[deploy] Copying Dockerfile.${req.runtime}...`);
  copyDockerfile(req.runtime, appDir);

  // 3. Build Docker image
  console.log(`[deploy] Building image ${imageTag}...`);
  await buildImage(appDir, imageTag);

  // 4. Stop and remove old container if running
  const existingId = await findExistingContainer(req.appName);
  if (existingId) {
    console.log(`[deploy] Stopping old container ${existingId}...`);
    try {
      await stopContainer(existingId);
    } catch {
      // Container might already be stopped
    }
    try {
      await removeContainer(existingId);
    } catch {
      // Container might already be removed
    }
  }

  // 5. Create and start new container
  console.log(`[deploy] Creating container ${containerName}...`);
  const envList = Object.entries(req.envVars ?? {}).map(
    ([k, v]) => `${k}=${v}`,
  );
  envList.push(`PORT=${req.port}`);

  const config: ContainerConfig = {
    Image: imageTag,
    Env: envList,
    ExposedPorts: { [`${req.port}/tcp`]: {} },
    HostConfig: {
      PortBindings: {
        [`${req.port}/tcp`]: [{ HostPort: String(req.port) }],
      },
      RestartPolicy: { Name: "unless-stopped" },
      NetworkMode: "host",
    },
    Labels: {
      [LABEL_MANAGED]: "true",
      [LABEL_APP]: req.appName,
      [LABEL_DOMAIN]: req.domain,
      [LABEL_PORT]: String(req.port),
    },
    name: containerName,
  };

  const containerId = await createContainer(config);
  console.log(`[deploy] Starting container ${containerId}...`);
  await startContainer(containerId);

  // 6. Wait for health check
  console.log(`[deploy] Waiting for health check...`);
  const healthCheck = await waitForHealth(containerId, req.port);

  // 7. Configure Caddy route
  console.log(`[deploy] Configuring Caddy route: ${req.domain} -> localhost:${req.port}...`);
  await addRoute(req.domain, `localhost:${req.port}`);

  // 8. Add subdomain route if configured
  if (req.subdomain) {
    const subdomainFqdn = `${req.subdomain}.crontech.ai`;
    console.log(`[deploy] Adding subdomain route: ${subdomainFqdn}...`);
    await addRoute(subdomainFqdn, `localhost:${req.port}`);
  }

  // 9. Return result
  const url = `https://${req.domain}`;
  console.log(`[deploy] Deploy complete: ${url} (health: ${healthCheck})`);

  return {
    containerId,
    appName: req.appName,
    domain: req.domain,
    url,
    status: "running",
    healthCheck,
  };
}

/** Rollback to the previous image version. */
export async function rollback(appName: string): Promise<void> {
  const containerName = `${CONTAINER_PREFIX}${appName}`;
  const previousTag = `${CONTAINER_PREFIX}${appName}:previous`;

  console.log(`[rollback] Rolling back ${appName} to previous image...`);

  // Stop current container
  const existingId = await findExistingContainer(appName);
  if (existingId) {
    const info = await inspectContainer(existingId);
    const port = info.Config.Labels[LABEL_PORT] ?? "3000";

    await stopContainer(existingId);
    await removeContainer(existingId);

    // Start container with previous image
    const config: ContainerConfig = {
      Image: previousTag,
      Env: info.Config.Env,
      HostConfig: {
        PortBindings: {
          [`${port}/tcp`]: [{ HostPort: port }],
        },
        RestartPolicy: { Name: "unless-stopped" },
        NetworkMode: "host",
      },
      Labels: info.Config.Labels,
      name: containerName,
    };

    const newId = await createContainer(config);
    await startContainer(newId);
    console.log(`[rollback] ${appName} rolled back to previous. Container: ${newId}`);
  } else {
    throw new Error(`No running container found for ${appName}`);
  }
}

/** Stop and remove an app completely. */
export async function undeploy(appName: string): Promise<void> {
  console.log(`[undeploy] Removing ${appName}...`);

  const existingId = await findExistingContainer(appName);
  if (existingId) {
    const info = await inspectContainer(existingId);
    const domain = info.Config.Labels[LABEL_DOMAIN];

    await stopContainer(existingId);
    await removeContainer(existingId);

    // Remove Caddy routes
    if (domain) {
      await removeRoute(domain);
    }
    // Also remove subdomain route
    await removeRoute(`${appName}.crontech.ai`);

    console.log(`[undeploy] ${appName} removed.`);
  } else {
    console.warn(`[undeploy] No container found for ${appName}`);
  }
}

/** Get the current status of a deployed app. */
export async function status(appName: string): Promise<AppStatus | null> {
  const existingId = await findExistingContainer(appName);
  if (!existingId) return null;

  const info = await inspectContainer(existingId);
  const port = Number(info.Config.Labels[LABEL_PORT] ?? "3000");
  const domain = info.Config.Labels[LABEL_DOMAIN] ?? "";

  return {
    name: appName,
    containerId: info.Id,
    image: info.Config.Image,
    status: info.State.Running
      ? "running"
      : (info.State.Status as AppStatus["status"]),
    port,
    domain,
    healthUrl: `http://localhost:${port}/health`,
    uptime: info.State.StartedAt,
    createdAt: info.State.StartedAt,
  };
}

/** List all Crontech-managed apps. */
export async function listApps(): Promise<AppStatus[]> {
  const containers = await listContainers({
    label: [`${LABEL_MANAGED}=true`],
  });

  return containers.map((c) => {
    const appName = c.Labels[LABEL_APP] ?? c.Names[0]?.replace("/", "") ?? "unknown";
    const port = Number(c.Labels[LABEL_PORT] ?? "3000");
    const domain = c.Labels[LABEL_DOMAIN] ?? "";

    return {
      name: appName,
      containerId: c.Id,
      image: c.Image,
      status: c.State as AppStatus["status"],
      port,
      domain,
      healthUrl: `http://localhost:${port}/health`,
      uptime: new Date(c.Created * 1000).toISOString(),
      createdAt: new Date(c.Created * 1000).toISOString(),
    };
  });
}

/** Get logs for a deployed app. */
export async function getLogs(
  appName: string,
  tail = 100,
): Promise<string> {
  const existingId = await findExistingContainer(appName);
  if (!existingId) {
    throw new Error(`No container found for ${appName}`);
  }
  return getContainerLogs(existingId, tail);
}
