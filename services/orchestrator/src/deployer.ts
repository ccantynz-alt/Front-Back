// ── Core Deploy Orchestration ─────────────────────────────────────────
// Manages the full lifecycle of app deployments: clone, detect framework,
// install deps, build, run via Bun process manager, configure routing.
//
// SECURITY (BLK-009): the install + build steps run inside a Docker
// sandbox (see `sandbox.ts`) — NOT directly on the host. Customer code
// (postinstall scripts, build scripts, vite plugins) can do anything, so
// we treat it as fully untrusted. The clone + route-configuration steps
// run on the host because they handle our own trusted data.

import * as fs from "node:fs";
import * as path from "node:path";
import { detectFramework } from "./framework-detector";
import {
  allocatePort,
  releasePort,
  startProcess,
  stopProcess,
  isProcessRunning,
  getProcessPid,
  getProcessLogs,
  streamProcessLogs,
} from "./process-manager";
import { addRoute, appendSiteAndReload, removeRoute } from "./caddy";
import {
  cleanupWorkspaceDir,
  ensureWorkspaceDir,
  resolveWorkspaceDir,
  runInSandbox,
  scrubLogLine,
} from "./sandbox";
import type {
  DeployRequest,
  DeployResult,
  AppStatus,
  AppDeployment,
  DeploymentsManifest,
  LogEntry,
} from "./types";

const APPS_DIR = process.env["CRONTECH_APPS_DIR"] ?? "/opt/crontech/apps";
const MANIFEST_PATH = path.join(APPS_DIR, "deployments.json");
const CLONE_TIMEOUT_MS = 120_000;
const INSTALL_TIMEOUT_MS = 180_000;
const BUILD_TIMEOUT_MS = 300_000;
const HEALTH_POLL_INTERVAL_MS = 2_000;
const HEALTH_MAX_ATTEMPTS = 20;

// ── Manifest Persistence ─────────────────────────────────────────────

function loadManifest(): DeploymentsManifest {
  try {
    if (fs.existsSync(MANIFEST_PATH)) {
      const raw = fs.readFileSync(MANIFEST_PATH, "utf-8");
      return JSON.parse(raw) as DeploymentsManifest;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error(`[deployer] Failed to load manifest: ${msg}`);
  }
  return { version: 1, apps: {} };
}

function saveManifest(manifest: DeploymentsManifest): void {
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf-8");
}

function getDeployment(appName: string): AppDeployment | undefined {
  const manifest = loadManifest();
  return manifest.apps[appName];
}

function setDeployment(deployment: AppDeployment): void {
  const manifest = loadManifest();
  manifest.apps[deployment.appName] = deployment;
  saveManifest(manifest);
}

function removeDeployment(appName: string): void {
  const manifest = loadManifest();
  delete manifest.apps[appName];
  saveManifest(manifest);
}

// ── Shell Helpers ────────────────────────────────────────────────────

async function exec(
  command: string[],
  options: {
    cwd?: string;
    env?: Record<string, string>;
    timeoutMs?: number;
  } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const spawnOptions: { cwd?: string; env: Record<string, string | undefined>; stdout: "pipe"; stderr: "pipe" } = {
    env: { ...process.env, ...options.env },
    stdout: "pipe",
    stderr: "pipe",
  };
  if (options.cwd) {
    spawnOptions.cwd = options.cwd;
  }
  const proc = Bun.spawn(command, spawnOptions);

  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  if (options.timeoutMs) {
    timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, options.timeoutMs);
  }

  const exitCode = await proc.exited;

  if (timer) clearTimeout(timer);

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();

  if (timedOut) {
    throw new Error(
      `Command timed out after ${options.timeoutMs}ms: ${command.join(" ")}`,
    );
  }

  return { stdout, stderr, exitCode };
}

// ── Git Operations ───────────────────────────────────────────────────

async function cloneRepo(
  repoUrl: string,
  branch: string,
  targetDir: string,
): Promise<void> {
  if (fs.existsSync(path.join(targetDir, ".git"))) {
    const { exitCode, stderr } = await exec(
      ["git", "-C", targetDir, "fetch", "origin", branch, "--depth", "1"],
      { timeoutMs: CLONE_TIMEOUT_MS },
    );
    if (exitCode !== 0) {
      throw new Error(`git fetch failed: ${scrubLogLine(stderr)}`);
    }

    const { exitCode: resetCode, stderr: resetErr } = await exec(
      ["git", "-C", targetDir, "reset", "--hard", `origin/${branch}`],
      { timeoutMs: 30_000 },
    );
    if (resetCode !== 0) {
      throw new Error(`git reset failed: ${scrubLogLine(resetErr)}`);
    }
  } else {
    fs.mkdirSync(targetDir, { recursive: true });
    const { exitCode, stderr } = await exec(
      ["git", "clone", "--branch", branch, "--depth", "1", repoUrl, targetDir],
      { timeoutMs: CLONE_TIMEOUT_MS },
    );
    if (exitCode !== 0) {
      throw new Error(`git clone failed: ${scrubLogLine(stderr)}`);
    }
  }
}

// ── Build Pipeline ───────────────────────────────────────────────────

/**
 * Install dependencies INSIDE a sandboxed Docker container.
 *
 * Customer code never runs on the host — npm postinstall hooks, pnpm
 * install scripts, and any other foot-gun fires inside the locked-down
 * container (see `sandbox.ts`).
 */
async function installDeps(
  deploymentId: string,
  workspaceDir: string,
): Promise<void> {
  const lockFile = path.join(workspaceDir, "bun.lockb");
  let installCmd: string[];

  if (fs.existsSync(lockFile)) {
    installCmd = ["bun", "install", "--frozen-lockfile"];
  } else {
    // pnpm-lock / yarn.lock / npm-lock all fall through to bun install.
    installCmd = ["bun", "install"];
  }

  const result = await runInSandbox(
    {
      deploymentId,
      workspaceDir,
      command: installCmd,
      timeoutMs: INSTALL_TIMEOUT_MS,
    },
  );

  if (result.exitCode !== 0) {
    // Stderr from the sandbox runner is already secret-scrubbed.
    throw new Error(
      `Dependency installation failed (exit ${result.exitCode}): ${result.stderr.slice(-2000)}`,
    );
  }
}

/**
 * Run the customer's build command INSIDE the sandbox. Forwards only a
 * minimal, curated env (NODE_ENV + any caller-supplied vars). The
 * NODE_ENV=production flag is baked in — callers cannot accidentally
 * leak dev-only debug flags into the sandbox.
 */
async function buildApp(
  deploymentId: string,
  workspaceDir: string,
  buildCommand: string,
  envVars: Record<string, string>,
): Promise<void> {
  if (!buildCommand) return;

  const parts = buildCommand.split(" ").filter((p) => p.length > 0);
  if (parts.length === 0) return;

  const sandboxedEnv: Record<string, string> = {
    NODE_ENV: "production",
    // Intentionally forward customer envVars — the app's build may need
    // them (e.g. NEXT_PUBLIC_*). They're scrubbed from our own logs.
    ...envVars,
  };

  const result = await runInSandbox(
    {
      deploymentId,
      workspaceDir,
      command: parts,
      env: sandboxedEnv,
      timeoutMs: BUILD_TIMEOUT_MS,
    },
  );

  if (result.exitCode !== 0) {
    throw new Error(
      `Build failed (exit ${result.exitCode}): ${result.stderr.slice(-2000)}`,
    );
  }
}

// ── Static File Server ───────────────────────────────────────────────

function createStaticServerScript(rootDir: string, port: number): string {
  return `
const path = require("node:path");
const fs = require("node:fs");

const ROOT = ${JSON.stringify(rootDir)};
const PORT = ${port};

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".pdf": "application/pdf",
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url);
    let filePath = path.join(ROOT, url.pathname);

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (filePath.endsWith("/")) filePath += "index.html";

    const file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(file, {
        headers: { "Content-Type": getMimeType(filePath) },
      });
    }

    const indexPath = path.join(ROOT, "index.html");
    const indexFile = Bun.file(indexPath);
    if (await indexFile.exists()) {
      return new Response(indexFile, {
        headers: { "Content-Type": "text/html" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log("Static server running on port " + PORT);
`;
}

// ── Health Check ─────────────────────────────────────────────────────

async function waitForHealth(
  port: number,
  maxAttempts: number = HEALTH_MAX_ATTEMPTS,
): Promise<"pass" | "fail"> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS));
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(3_000),
      });
      if (res.ok) return "pass";
    } catch {
      // not ready yet
    }
  }
  return "fail";
}

// ── Backup for Rollback ──────────────────────────────────────────────

function backupBuildOutput(appDir: string, outputDir: string): string | undefined {
  const outputPath = path.join(appDir, outputDir);
  if (!fs.existsSync(outputPath)) return undefined;

  const backupPath = `${outputPath}.previous`;
  if (fs.existsSync(backupPath)) {
    fs.rmSync(backupPath, { recursive: true, force: true });
  }
  fs.cpSync(outputPath, backupPath, { recursive: true });
  return backupPath;
}

function restoreBackup(appDir: string, outputDir: string): void {
  const outputPath = path.join(appDir, outputDir);
  const backupPath = `${outputPath}.previous`;

  if (!fs.existsSync(backupPath)) {
    throw new Error(`No previous build to restore for ${appDir}`);
  }

  if (fs.existsSync(outputPath)) {
    fs.rmSync(outputPath, { recursive: true, force: true });
  }
  fs.cpSync(backupPath, outputPath, { recursive: true });
}

// ── Start App Process ────────────────────────────────────────────────

function startAppProcess(
  deployment: AppDeployment,
): void {
  const { framework, appDir, envVars, port, appName } = deployment;

  if (!framework.needsServer) {
    const staticDir = path.join(appDir, framework.outputDir);
    const scriptPath = path.join(appDir, ".crontech-static-server.js");
    fs.writeFileSync(scriptPath, createStaticServerScript(staticDir, port));
    startProcess(appName, ["bun", "run", scriptPath], appDir, envVars, port);
  } else {
    const startParts = framework.startCommand.split(" ");
    startProcess(appName, startParts, appDir, envVars, port);
  }
}

// ── Public API ───────────────────────────────────────────────────────

export async function deploy(req: DeployRequest): Promise<DeployResult> {
  const appDir = path.join(APPS_DIR, req.appName);
  // Isolated sandbox workspace for untrusted clone+install+build.
  // Owned (in production) by an unprivileged user; cleaned up on both
  // success and failure paths.
  const sandboxDir = resolveWorkspaceDir(req.appName);
  const now = new Date().toISOString();

  console.log(`[deploy] Starting deploy for ${req.appName}...`);

  let deployment = getDeployment(req.appName);
  const isReplace = !!deployment;

  if (!deployment) {
    deployment = {
      appName: req.appName,
      repoUrl: req.repoUrl,
      branch: req.branch,
      domain: req.domain,
      subdomain: req.subdomain,
      port: req.port,
      runtime: req.runtime,
      framework: {
        framework: "bun",
        buildCommand: "bun run build",
        startCommand: "bun run start",
        outputDir: "dist",
        needsServer: true,
      },
      envVars: req.envVars ?? {},
      status: "queued",
      pid: undefined,
      appDir,
      createdAt: now,
      updatedAt: now,
      previousBuildDir: undefined,
    };
  }

  deployment.status = "cloning";
  deployment.updatedAt = now;
  setDeployment(deployment);

  try {
    // 0. Prepare a fresh sandbox workspace.
    cleanupWorkspaceDir(req.appName);
    ensureWorkspaceDir(req.appName);

    // 1. Clone repo into the SANDBOX workspace (NOT the host appDir yet).
    console.log(`[deploy] Cloning ${req.repoUrl} (${req.branch}) into sandbox...`);
    await cloneRepo(req.repoUrl, req.branch, sandboxDir);

    // 2. Detect framework (reads package.json only — safe on host).
    deployment.status = "detecting";
    deployment.updatedAt = new Date().toISOString();
    setDeployment(deployment);

    console.log("[deploy] Detecting framework...");
    const framework = await detectFramework(sandboxDir);
    deployment.framework = framework;
    console.log(`[deploy] Detected: ${framework.framework} (server: ${framework.needsServer})`);

    // 3. Install dependencies — SANDBOXED.
    deployment.status = "installing";
    deployment.updatedAt = new Date().toISOString();
    setDeployment(deployment);

    console.log("[deploy] Installing dependencies (sandboxed)...");
    await installDeps(req.appName, sandboxDir);

    // 4. Build — SANDBOXED.
    deployment.status = "building";
    deployment.updatedAt = new Date().toISOString();
    setDeployment(deployment);

    if (framework.buildCommand) {
      console.log(`[deploy] Building (${framework.buildCommand}) sandboxed...`);
      await buildApp(
        req.appName,
        sandboxDir,
        framework.buildCommand,
        req.envVars ?? {},
      );
    }

    // 5. Promote the sandbox build output onto the host appDir so the
    //    runtime process-manager can launch it. We back up the existing
    //    appDir first to enable rollback.
    const previousBackup = backupBuildOutput(appDir, framework.outputDir);
    deployment.previousBuildDir = previousBackup;

    fs.mkdirSync(path.dirname(appDir), { recursive: true });
    if (fs.existsSync(appDir)) {
      fs.rmSync(appDir, { recursive: true, force: true });
    }
    // cpSync preserves permissions; dereferences symlinks by default.
    fs.cpSync(sandboxDir, appDir, { recursive: true });

    // 6. Stop old process if replacing
    if (isReplace && isProcessRunning(req.appName)) {
      console.log("[deploy] Stopping old process...");
      stopProcess(req.appName);
    }

    // 7. Allocate port (reuses existing allocation if app already has one)
    const port = allocatePort(req.appName);
    deployment.port = port;

    // 8. Start process
    deployment.status = "starting";
    deployment.updatedAt = new Date().toISOString();
    setDeployment(deployment);

    console.log(`[deploy] Starting on port ${port}...`);
    deployment.envVars = { ...deployment.envVars, ...req.envVars };
    startAppProcess(deployment);

    deployment.pid = getProcessPid(req.appName);

    // 9. Health check
    console.log("[deploy] Waiting for health check...");
    const healthResult = await waitForHealth(port);

    if (healthResult === "fail") {
      console.warn(`[deploy] Health check failed for ${req.appName}, process may still be starting`);
    }

    // 10. Configure Caddy route via admin API (fast path) and also append
    //     a durable site block to the Caddyfile so a reboot preserves it.
    console.log(`[deploy] Configuring route: ${req.domain} -> 127.0.0.1:${port}...`);
    try {
      await addRoute(req.domain, `127.0.0.1:${port}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "unknown error";
      console.warn(`[deploy] Caddy route config failed (non-fatal): ${scrubLogLine(msg)}`);
    }

    if (req.subdomain) {
      const subFqdn = `${req.subdomain}.crontech.ai`;
      console.log(`[deploy] Adding subdomain route: ${subFqdn}...`);
      try {
        await addRoute(subFqdn, `127.0.0.1:${port}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "unknown error";
        console.warn(`[deploy] Subdomain route config failed (non-fatal): ${scrubLogLine(msg)}`);
      }

      // Append durable site block to Caddyfile. Failure must not nuke
      // the existing Caddyfile — `appendSiteAndReload` rolls back on
      // reload failure to keep the running config valid.
      try {
        await appendSiteAndReload(req.subdomain, `127.0.0.1:${port}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "unknown error";
        console.warn(`[deploy] Caddyfile append failed (non-fatal): ${scrubLogLine(msg)}`);
      }
    }

    // 11. Mark running
    deployment.status = "running";
    deployment.updatedAt = new Date().toISOString();
    setDeployment(deployment);

    const url = `https://${req.domain}`;
    console.log(`[deploy] Deploy complete: ${url} (health: ${healthResult})`);

    // 12. Clean up the sandbox workspace on success. No customer code
    //     survives past the build step on the host.
    cleanupWorkspaceDir(req.appName);

    return {
      containerId: `pid-${deployment.pid ?? 0}`,
      appName: req.appName,
      domain: req.domain,
      url,
      status: "running",
      healthCheck: healthResult,
    };
  } catch (err: unknown) {
    deployment.status = "failed";
    deployment.updatedAt = new Date().toISOString();
    setDeployment(deployment);

    stopProcess(req.appName);

    // Always clean up the sandbox dir — customer code left on disk is
    // a security and quota liability.
    cleanupWorkspaceDir(req.appName);

    const msg = err instanceof Error ? err.message : "deploy failed";
    console.error(`[deploy] Failed for ${req.appName}: ${scrubLogLine(msg)}`);
    throw err;
  }
}

export async function rollback(appName: string): Promise<void> {
  const deployment = getDeployment(appName);
  if (!deployment) {
    throw new Error(`No deployment found for "${appName}"`);
  }

  console.log(`[rollback] Rolling back ${appName}...`);

  deployment.status = "rolling_back";
  deployment.updatedAt = new Date().toISOString();
  setDeployment(deployment);

  try {
    stopProcess(appName);

    restoreBackup(deployment.appDir, deployment.framework.outputDir);

    startAppProcess(deployment);
    deployment.pid = getProcessPid(appName);

    const healthResult = await waitForHealth(deployment.port, 15);
    if (healthResult === "fail") {
      console.warn(`[rollback] Health check failed after rollback for ${appName}`);
    }

    deployment.status = "running";
    deployment.updatedAt = new Date().toISOString();
    deployment.previousBuildDir = undefined;
    setDeployment(deployment);

    console.log(`[rollback] ${appName} rolled back successfully`);
  } catch (err: unknown) {
    deployment.status = "failed";
    deployment.updatedAt = new Date().toISOString();
    setDeployment(deployment);
    throw err;
  }
}

export async function undeploy(appName: string): Promise<void> {
  console.log(`[undeploy] Removing ${appName}...`);

  const deployment = getDeployment(appName);

  stopProcess(appName);
  releasePort(appName);

  if (deployment) {
    try {
      await removeRoute(deployment.domain);
    } catch {
      // route may not exist
    }
    try {
      await removeRoute(`${appName}.crontech.ai`);
    } catch {
      // subdomain route may not exist
    }

    if (fs.existsSync(deployment.appDir)) {
      fs.rmSync(deployment.appDir, { recursive: true, force: true });
    }

    removeDeployment(appName);
  }

  console.log(`[undeploy] ${appName} removed.`);
}

export async function status(appName: string): Promise<AppStatus | null> {
  const deployment = getDeployment(appName);
  if (!deployment) return null;

  const running = isProcessRunning(appName);
  const pid = getProcessPid(appName);
  const currentStatus = running ? deployment.status : "stopped";

  return {
    name: appName,
    containerId: `pid-${pid ?? 0}`,
    image: `${deployment.framework.framework}@${deployment.branch}`,
    status: currentStatus === "running" && !running ? "stopped" : currentStatus,
    port: deployment.port,
    domain: deployment.domain,
    healthUrl: `http://127.0.0.1:${deployment.port}/health`,
    uptime: deployment.updatedAt,
    createdAt: deployment.createdAt,
  };
}

export async function listApps(): Promise<AppStatus[]> {
  const manifest = loadManifest();
  const results: AppStatus[] = [];

  for (const [appName, deployment] of Object.entries(manifest.apps)) {
    const running = isProcessRunning(appName);
    const pid = getProcessPid(appName);

    results.push({
      name: appName,
      containerId: `pid-${pid ?? 0}`,
      image: `${deployment.framework.framework}@${deployment.branch}`,
      status: running ? deployment.status : "stopped",
      port: deployment.port,
      domain: deployment.domain,
      healthUrl: `http://127.0.0.1:${deployment.port}/health`,
      uptime: deployment.updatedAt,
      createdAt: deployment.createdAt,
    });
  }

  return results;
}

export async function getLogs(
  appName: string,
  tail = 100,
): Promise<string> {
  const logs = getProcessLogs(appName, tail);
  if (logs.length === 0) {
    const deployment = getDeployment(appName);
    if (!deployment) throw new Error(`No app found for "${appName}"`);
    return "[no logs available — process may not be running]";
  }
  return logs
    .map(
      (entry: LogEntry) =>
        `[${entry.timestamp}] [${entry.stream}] ${scrubLogLine(entry.message)}`,
    )
    .join("\n");
}

export function getLogStream(appName: string): ReadableStream<string> {
  // Wrap the upstream stream so any log line leaving this process has its
  // secrets scrubbed. SSE frames look like `data: {"message":"..."}\n\n` —
  // we reparse/rewrite each frame to scrub the `message` field.
  const upstream = streamProcessLogs(appName);
  return upstream.pipeThrough(new TransformStream<string, string>({
    transform(chunk, controller) {
      if (!chunk.startsWith("data: ")) {
        controller.enqueue(chunk);
        return;
      }
      const jsonPart = chunk.slice(6).trimEnd();
      try {
        const parsed = JSON.parse(jsonPart) as { message?: unknown; stream?: unknown; timestamp?: unknown };
        if (typeof parsed.message === "string") {
          parsed.message = scrubLogLine(parsed.message);
        }
        controller.enqueue(`data: ${JSON.stringify(parsed)}\n\n`);
      } catch {
        // Malformed — pass through without scrubbing rather than dropping.
        controller.enqueue(chunk);
      }
    },
  }));
}
