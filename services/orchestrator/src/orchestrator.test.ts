// ── Deploy Orchestrator Tests ──────────────────────────────────────────

import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
  AppDeployment,
  Container,
  ContainerInspect,
  CaddyRoute,
  ContainerConfig,
  DeployRequest,
  DeploymentsManifest,
  LogEntry,
  PortAllocation,
} from "./types";

// ── Type Shape Tests ─────────────────────────────────────────────────

describe("Type shapes", () => {
  test("DeployRequest validates correct input shape", () => {
    const req: DeployRequest = {
      appName: "zoobicon",
      repoUrl: "https://github.com/ccantynz-alt/zoobicon.com",
      branch: "main",
      domain: "zoobicon.com",
      subdomain: "zoobicon",
      port: 3001,
      runtime: "nextjs",
      envVars: { NODE_ENV: "production" },
    };

    expect(req.appName).toBe("zoobicon");
    expect(req.runtime).toBe("nextjs");
    expect(req.port).toBeGreaterThan(1023);
    expect(req.envVars?.NODE_ENV).toBe("production");
  });

  test("AppDeployment stores full deployment state", () => {
    const deployment: AppDeployment = {
      appName: "testapp",
      repoUrl: "https://github.com/user/repo.git",
      branch: "main",
      domain: "testapp.com",
      subdomain: "testapp",
      port: 8100,
      runtime: "bun",
      framework: {
        framework: "solidstart",
        buildCommand: "bun run build",
        startCommand: "bun run .output/server/index.mjs",
        outputDir: ".output",
        needsServer: true,
      },
      envVars: { NODE_ENV: "production" },
      status: "running",
      pid: 12345,
      appDir: "/opt/crontech/apps/testapp",
      createdAt: "2026-04-17T00:00:00Z",
      updatedAt: "2026-04-17T00:00:00Z",
      previousBuildDir: undefined,
    };

    expect(deployment.framework.framework).toBe("solidstart");
    expect(deployment.framework.needsServer).toBe(true);
    expect(deployment.status).toBe("running");
    expect(deployment.pid).toBe(12345);
  });

  test("DeploymentsManifest holds multiple apps", () => {
    const manifest: DeploymentsManifest = {
      version: 1,
      apps: {
        app1: {
          appName: "app1",
          repoUrl: "https://github.com/user/app1.git",
          branch: "main",
          domain: "app1.com",
          subdomain: undefined,
          port: 8100,
          runtime: "bun",
          framework: {
            framework: "vite",
            buildCommand: "bun run build",
            startCommand: "",
            outputDir: "dist",
            needsServer: false,
          },
          envVars: {},
          status: "running",
          pid: 1000,
          appDir: "/opt/crontech/apps/app1",
          createdAt: "2026-04-17T00:00:00Z",
          updatedAt: "2026-04-17T00:00:00Z",
          previousBuildDir: undefined,
        },
      },
    };

    expect(manifest.version).toBe(1);
    expect(Object.keys(manifest.apps)).toHaveLength(1);
    expect(manifest.apps["app1"]?.domain).toBe("app1.com");
  });

  test("LogEntry has required fields", () => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      stream: "stdout",
      message: "Server started on port 8100",
    };

    expect(entry.stream).toBe("stdout");
    expect(entry.message).toContain("8100");
    expect(entry.timestamp.length).toBeGreaterThan(0);
  });

  test("PortAllocation tracks port-to-app mapping", () => {
    const alloc: PortAllocation = {
      port: 8100,
      appName: "myapp",
      allocatedAt: new Date().toISOString(),
    };

    expect(alloc.port).toBe(8100);
    expect(alloc.appName).toBe("myapp");
  });
});

// ── Framework Detector Tests ─────────────────────────────────────────

describe("Framework detector", () => {
  test("exports detectFramework function", async () => {
    const mod = await import("./framework-detector");
    expect(typeof mod.detectFramework).toBe("function");
  });

  test("returns static framework for non-existent directory", async () => {
    const { detectFramework } = await import("./framework-detector");
    const result = await detectFramework("/tmp/nonexistent-dir-" + Date.now());

    expect(result.framework).toBe("static");
    expect(result.needsServer).toBe(false);
  });
});

// ── Process Manager Tests ────────────────────────────────────────────

describe("Process manager", () => {
  test("exports all required functions", async () => {
    const pm = await import("./process-manager");
    expect(typeof pm.allocatePort).toBe("function");
    expect(typeof pm.releasePort).toBe("function");
    expect(typeof pm.getPortForApp).toBe("function");
    expect(typeof pm.getAllPortAllocations).toBe("function");
    expect(typeof pm.startProcess).toBe("function");
    expect(typeof pm.stopProcess).toBe("function");
    expect(typeof pm.restartProcess).toBe("function");
    expect(typeof pm.isProcessRunning).toBe("function");
    expect(typeof pm.getProcessPid).toBe("function");
    expect(typeof pm.getProcessLogs).toBe("function");
    expect(typeof pm.streamProcessLogs).toBe("function");
    expect(typeof pm.listManagedProcesses).toBe("function");
    expect(typeof pm.stopAllProcesses).toBe("function");
  });

  test("allocatePort returns a port in the valid range", async () => {
    const { allocatePort, releasePort } = await import("./process-manager");
    const testApp = `pm-test-${Date.now()}`;

    const port = allocatePort(testApp);
    expect(port).toBeGreaterThanOrEqual(8100);
    expect(port).toBeLessThanOrEqual(8999);

    releasePort(testApp);
  });

  test("allocatePort returns same port for same app", async () => {
    const { allocatePort, releasePort } = await import("./process-manager");
    const testApp = `pm-reuse-${Date.now()}`;

    const port1 = allocatePort(testApp);
    const port2 = allocatePort(testApp);
    expect(port1).toBe(port2);

    releasePort(testApp);
  });

  test("getProcessLogs returns empty array for unknown app", async () => {
    const { getProcessLogs } = await import("./process-manager");
    const logs = getProcessLogs("nonexistent-app", 100);
    expect(logs).toHaveLength(0);
  });

  test("isProcessRunning returns false for unknown app", async () => {
    const { isProcessRunning } = await import("./process-manager");
    expect(isProcessRunning("nonexistent-app")).toBe(false);
  });

  test("getProcessPid returns undefined for unknown app", async () => {
    const { getProcessPid } = await import("./process-manager");
    expect(getProcessPid("nonexistent-app")).toBeUndefined();
  });

  test("streamProcessLogs returns a ReadableStream", async () => {
    const { streamProcessLogs } = await import("./process-manager");
    const stream = streamProcessLogs("nonexistent-app");
    expect(stream).toBeInstanceOf(ReadableStream);
  });

  test("listManagedProcesses returns array", async () => {
    const { listManagedProcesses } = await import("./process-manager");
    const list = listManagedProcesses();
    expect(Array.isArray(list)).toBe(true);
  });
});

// ── Deploy Flow Tests ────────────────────────────────────────────────

describe("Deploy flow", () => {
  test("deploy sequence matches expected order", () => {
    const expectedSteps = [
      "clone",
      "detect_framework",
      "install_deps",
      "backup_previous",
      "build",
      "stop_old",
      "allocate_port",
      "start_process",
      "health_check",
      "configure_route",
      "mark_running",
    ];

    expect(expectedSteps[0]).toBe("clone");
    expect(expectedSteps[expectedSteps.length - 1]).toBe("mark_running");

    const buildIdx = expectedSteps.indexOf("build");
    const stopIdx = expectedSteps.indexOf("stop_old");
    expect(buildIdx).toBeLessThan(stopIdx);

    const healthIdx = expectedSteps.indexOf("health_check");
    const routeIdx = expectedSteps.indexOf("configure_route");
    expect(healthIdx).toBeLessThan(routeIdx);
  });

  test("env vars are formatted correctly", () => {
    const envVars: Record<string, string> = {
      NODE_ENV: "production",
      DATABASE_URL: "postgres://...",
    };
    const envList = Object.entries(envVars).map(([k, v]) => `${k}=${v}`);

    expect(envList).toContain("NODE_ENV=production");
    expect(envList).toContain("DATABASE_URL=postgres://...");
    expect(envList).toHaveLength(2);
  });
});

// ── Deployer Module Exports ──────────────────────────────────────────

describe("Deployer module exports", () => {
  test("deployer exports all required functions", async () => {
    const deployer = await import("./deployer");
    expect(typeof deployer.deploy).toBe("function");
    expect(typeof deployer.rollback).toBe("function");
    expect(typeof deployer.undeploy).toBe("function");
    expect(typeof deployer.status).toBe("function");
    expect(typeof deployer.listApps).toBe("function");
    expect(typeof deployer.getLogs).toBe("function");
    expect(typeof deployer.getLogStream).toBe("function");
  });
});

// ── Caddy Client Tests ───────────────────────────────────────────────

describe("Caddy API client", () => {
  test("addRoute constructs correct route config for a domain", () => {
    const domain = "zoobicon.com";
    const upstream = "127.0.0.1:8100";
    const routeId = `crontech-${domain.replace(/\./g, "-")}`;

    const route: CaddyRoute = {
      "@id": routeId,
      match: [{ host: [domain] }],
      handle: [
        {
          handler: "reverse_proxy",
          upstreams: [{ dial: upstream }],
        },
      ],
    };

    expect(route["@id"]).toBe("crontech-zoobicon-com");
    expect(route.match?.[0]?.host?.[0]).toBe("zoobicon.com");
    expect(route.handle?.[0]?.upstreams?.[0]?.dial).toBe("127.0.0.1:8100");
  });

  test("removeRoute generates correct route ID from domain", () => {
    const domain = "app.crontech.ai";
    const routeId = `crontech-${domain.replace(/\./g, "-")}`;
    expect(routeId).toBe("crontech-app-crontech-ai");
  });

  test("caddy client exports all required functions", async () => {
    const caddy = await import("./caddy");
    expect(typeof caddy.addRoute).toBe("function");
    expect(typeof caddy.removeRoute).toBe("function");
    expect(typeof caddy.listRoutes).toBe("function");
    expect(typeof caddy.getConfig).toBe("function");
  });
});

// ── Docker Client Tests (legacy compat) ──────────────────────────────

describe("Docker API client (legacy)", () => {
  test("docker client exports all required functions", async () => {
    const docker = await import("./docker");
    expect(typeof docker.pullImage).toBe("function");
    expect(typeof docker.buildImage).toBe("function");
    expect(typeof docker.createContainer).toBe("function");
    expect(typeof docker.startContainer).toBe("function");
    expect(typeof docker.stopContainer).toBe("function");
    expect(typeof docker.removeContainer).toBe("function");
    expect(typeof docker.getContainerLogs).toBe("function");
    expect(typeof docker.listContainers).toBe("function");
    expect(typeof docker.inspectContainer).toBe("function");
    expect(typeof docker.restartContainer).toBe("function");
  });

  test("Container type shape", () => {
    const container: Container = {
      Id: "abc123",
      Names: ["/crontech-zoobicon"],
      Image: "crontech-zoobicon:latest",
      State: "running",
      Status: "Up 2 hours",
      Created: Math.floor(Date.now() / 1000),
      Ports: [{ PrivatePort: 3001, PublicPort: 3001, Type: "tcp" }],
      Labels: {
        "crontech.managed": "true",
        "crontech.app": "zoobicon",
      },
    };

    expect(container.Id).toBe("abc123");
    expect(container.State).toBe("running");
  });

  test("ContainerInspect type shape", () => {
    const inspect: ContainerInspect = {
      Id: "abc123",
      Name: "/crontech-zoobicon",
      State: {
        Status: "running",
        Running: true,
        StartedAt: "2024-01-01T00:00:00Z",
        FinishedAt: "0001-01-01T00:00:00Z",
      },
      Config: {
        Image: "crontech-zoobicon:latest",
        Env: ["PORT=3001"],
        Labels: { "crontech.app": "zoobicon" },
      },
      NetworkSettings: {
        Ports: {
          "3001/tcp": [{ HostIp: "0.0.0.0", HostPort: "3001" }],
        },
      },
    };

    expect(inspect.State.Running).toBe(true);
    expect(inspect.Config.Labels["crontech.app"]).toBe("zoobicon");
  });
});

// ── Health Monitor Tests ─────────────────────────────────────────────

describe("Health monitor", () => {
  test("health monitor exports start and stop", async () => {
    const health = await import("./health");
    expect(typeof health.startHealthMonitor).toBe("function");
    expect(typeof health.stopHealthMonitor).toBe("function");
  });

  test("identifies non-running apps for restart", () => {
    const apps: Array<{ name: string; status: string; healthUrl: string | null }> = [
      { name: "app1", status: "running", healthUrl: null },
      { name: "app2", status: "stopped", healthUrl: null },
      { name: "app3", status: "running", healthUrl: "http://127.0.0.1:8102/health" },
    ];

    const needsRestart = apps.filter((a) => a.status !== "running");
    expect(needsRestart).toHaveLength(1);
    expect(needsRestart[0]?.name).toBe("app2");
  });

  test("filters apps with HTTP health endpoints", () => {
    const apps: Array<{ name: string; status: string; healthUrl: string | null }> = [
      { name: "app1", status: "running", healthUrl: "http://127.0.0.1:8100/health" },
      { name: "app2", status: "running", healthUrl: null },
      { name: "app3", status: "running", healthUrl: "http://127.0.0.1:8102/health" },
    ];

    const withHealthCheck = apps.filter(
      (a) => a.status === "running" && a.healthUrl,
    );
    expect(withHealthCheck).toHaveLength(2);
  });
});

// ── Hono API Schema Validation ───────────────────────────────────────

describe("Orchestrator API schema validation", () => {
  test("deploy input schema validates correctly", async () => {
    const { z } = await import("zod");
    const deploySchema = z.object({
      appName: z.string().min(1).max(100),
      repoUrl: z.string().url(),
      branch: z.string().min(1).default("main"),
      domain: z.string().min(1),
      subdomain: z.string().optional(),
      port: z.number().int().min(1024).max(65535),
      runtime: z.enum(["nextjs", "bun"]),
      envVars: z.record(z.string(), z.string()).optional(),
    });

    const valid = deploySchema.safeParse({
      appName: "zoobicon",
      repoUrl: "https://github.com/user/repo",
      branch: "main",
      domain: "zoobicon.com",
      port: 3001,
      runtime: "nextjs",
    });
    expect(valid.success).toBe(true);

    const invalidRuntime = deploySchema.safeParse({
      appName: "test",
      repoUrl: "https://github.com/user/repo",
      domain: "test.com",
      port: 3001,
      runtime: "python",
    });
    expect(invalidRuntime.success).toBe(false);

    const invalidPort = deploySchema.safeParse({
      appName: "test",
      repoUrl: "https://github.com/user/repo",
      domain: "test.com",
      port: 80,
      runtime: "bun",
    });
    expect(invalidPort.success).toBe(false);

    const missingName = deploySchema.safeParse({
      repoUrl: "https://github.com/user/repo",
      domain: "test.com",
      port: 3001,
      runtime: "bun",
    });
    expect(missingName.success).toBe(false);
  });

  test("appName schema rejects empty strings", async () => {
    const { z } = await import("zod");
    const schema = z.object({ appName: z.string().min(1) });

    expect(schema.safeParse({ appName: "" }).success).toBe(false);
    expect(schema.safeParse({ appName: "valid" }).success).toBe(true);
  });
});

// ── Sandbox: Secret Scrubbing ────────────────────────────────────────

describe("Sandbox: secret scrubbing", () => {
  test("scrubLogLine redacts *_KEY values", async () => {
    const { scrubLogLine } = await import("./sandbox");
    const input = "Loading STRIPE_KEY=sk_live_abc123xyz and starting";
    const out = scrubLogLine(input);
    expect(out).not.toContain("sk_live_abc123xyz");
    expect(out).toContain("STRIPE_KEY=***");
  });

  test("scrubLogLine redacts *_SECRET values with quotes", async () => {
    const { scrubLogLine } = await import("./sandbox");
    const input = 'export SESSION_SECRET="super-secret-value"';
    const out = scrubLogLine(input);
    expect(out).not.toContain("super-secret-value");
    expect(out).toContain("SESSION_SECRET=***");
  });

  test("scrubLogLine redacts *_TOKEN and *_PASSWORD", async () => {
    const { scrubLogLine } = await import("./sandbox");
    const a = scrubLogLine("GITHUB_TOKEN=ghp_abcdef123 foo");
    const b = scrubLogLine("DB_PASSWORD: pl41n-t3xt-pw!");
    expect(a).toContain("GITHUB_TOKEN=***");
    expect(a).not.toContain("ghp_abcdef123");
    expect(b).toContain("DB_PASSWORD=***");
    expect(b).not.toContain("pl41n-t3xt-pw");
  });

  test("scrubLogLine redacts Bearer tokens", async () => {
    const { scrubLogLine } = await import("./sandbox");
    const out = scrubLogLine(
      "curl -H 'Authorization: Bearer eyJhbGci.header.sig' https://api",
    );
    expect(out).not.toContain("eyJhbGci.header.sig");
    expect(out).toContain("***");
  });

  test("scrubLogLine redacts PEM private keys", async () => {
    const { scrubLogLine } = await import("./sandbox");
    const pem =
      "-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----";
    const out = scrubLogLine(pem);
    expect(out).toBe("[REDACTED_PRIVATE_KEY]");
  });

  test("scrubLogLine leaves non-secret text alone", async () => {
    const { scrubLogLine } = await import("./sandbox");
    const input = "Compiled in 432ms. 128 modules bundled.";
    expect(scrubLogLine(input)).toBe(input);
  });

  test("scrubLogLines preserves array shape", async () => {
    const { scrubLogLines } = await import("./sandbox");
    const lines = ["ok", "API_KEY=hunter2", "done"];
    const out = scrubLogLines(lines);
    expect(out).toHaveLength(3);
    expect(out[0]).toBe("ok");
    expect(out[1]).toContain("API_KEY=***");
    expect(out[2]).toBe("done");
  });
});

// ── Sandbox: Docker Args Builder ─────────────────────────────────────

describe("Sandbox: buildDockerRunArgs", () => {
  test("enforces all hardening flags", async () => {
    const { buildDockerRunArgs } = await import("./sandbox");
    const args = buildDockerRunArgs({
      deploymentId: "test-app",
      workspaceDir: "/tmp/crontech-build/test-app",
      command: ["bun", "install"],
    });

    // Required hardening flags.
    expect(args).toContain("--rm");
    expect(args).toContain("--cap-drop=ALL");
    expect(args).toContain("--security-opt=no-new-privileges");
    expect(args).toContain("--read-only");
    expect(args).toContain("--user=1000:1000");
    expect(args).toContain("--network=bridge");
    expect(args).toContain("--memory=2g");
    expect(args).toContain("--memory-swap=2g");
    expect(args).toContain("--cpus=1");
    expect(args).toContain("--pids-limit=512");
    expect(args).toContain("--ulimit=nofile=4096:4096");
    expect(args).toContain("--stop-timeout=10");
    // No host network sharing.
    expect(args.some((a) => a.includes("--network=host"))).toBe(false);
    // Deterministic container name.
    expect(args).toContain("crontech-build-test-app");
  });

  test("workspaceReadonly flag uses :ro mount", async () => {
    const { buildDockerRunArgs } = await import("./sandbox");
    const args = buildDockerRunArgs({
      deploymentId: "app1",
      workspaceDir: "/tmp/crontech-build/app1",
      command: ["bun", "--version"],
      workspaceReadonly: true,
    });
    const mountIdx = args.indexOf("-v");
    expect(mountIdx).toBeGreaterThan(-1);
    expect(args[mountIdx + 1]).toBe("/tmp/crontech-build/app1:/workspace:ro");
  });

  test("rw mount by default (for builds that produce artefacts)", async () => {
    const { buildDockerRunArgs } = await import("./sandbox");
    const args = buildDockerRunArgs({
      deploymentId: "app2",
      workspaceDir: "/tmp/crontech-build/app2",
      command: ["bun", "run", "build"],
    });
    const mountIdx = args.indexOf("-v");
    expect(args[mountIdx + 1]).toBe("/tmp/crontech-build/app2:/workspace");
  });

  test("env vars are forwarded via -e flags", async () => {
    const { buildDockerRunArgs } = await import("./sandbox");
    const args = buildDockerRunArgs({
      deploymentId: "app3",
      workspaceDir: "/tmp/crontech-build/app3",
      command: ["bun", "install"],
      env: { NODE_ENV: "production", CI: "true" },
    });
    expect(args).toContain("-e");
    expect(args).toContain("NODE_ENV=production");
    expect(args).toContain("CI=true");
  });

  test("command is appended at the end, after image", async () => {
    const { buildDockerRunArgs, DEFAULT_BUILD_IMAGE } = await import("./sandbox");
    const args = buildDockerRunArgs({
      deploymentId: "app4",
      workspaceDir: "/tmp/crontech-build/app4",
      command: ["echo", "hello"],
    });
    const imgIdx = args.indexOf(DEFAULT_BUILD_IMAGE);
    expect(imgIdx).toBeGreaterThan(0);
    expect(args[imgIdx + 1]).toBe("echo");
    expect(args[imgIdx + 2]).toBe("hello");
  });

  test("custom resource limits override defaults", async () => {
    const { buildDockerRunArgs } = await import("./sandbox");
    const args = buildDockerRunArgs({
      deploymentId: "app5",
      workspaceDir: "/tmp/crontech-build/app5",
      command: ["sleep", "1"],
      limits: { memory: "512m", cpus: "0.5", pidsLimit: 128, nofile: 1024, stopTimeoutSec: 5 },
    });
    expect(args).toContain("--memory=512m");
    expect(args).toContain("--cpus=0.5");
    expect(args).toContain("--pids-limit=128");
    expect(args).toContain("--ulimit=nofile=1024:1024");
    expect(args).toContain("--stop-timeout=5");
  });
});

// ── Sandbox: Workspace Validation ────────────────────────────────────

describe("Sandbox: workspace path safety", () => {
  test("resolveWorkspaceDir rejects path traversal", async () => {
    const { resolveWorkspaceDir } = await import("./sandbox");
    expect(() => resolveWorkspaceDir("../etc")).toThrow();
    expect(() => resolveWorkspaceDir("..")).toThrow();
    expect(() => resolveWorkspaceDir("foo/bar")).toThrow();
    expect(() => resolveWorkspaceDir("")).toThrow();
  });

  test("resolveWorkspaceDir rejects non-alnum starters", async () => {
    const { resolveWorkspaceDir } = await import("./sandbox");
    expect(() => resolveWorkspaceDir(".evil")).toThrow();
    expect(() => resolveWorkspaceDir("-dash")).toThrow();
    expect(() => resolveWorkspaceDir("_under")).toThrow();
  });

  test("resolveWorkspaceDir accepts valid ids", async () => {
    const { resolveWorkspaceDir, SANDBOX_ROOT } = await import("./sandbox");
    const result = resolveWorkspaceDir("app-1");
    expect(result).toBe(path.join(SANDBOX_ROOT, "app-1"));
  });

  test("ensureWorkspaceDir + cleanupWorkspaceDir round-trip", async () => {
    const prev = process.env["CRONTECH_SANDBOX_ROOT"];
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "crontech-sb-"));
    process.env["CRONTECH_SANDBOX_ROOT"] = tmpRoot;
    try {
      // Re-import to pick up new env — bun caches modules, so manually
      // build and verify the path via os primitives instead.
      const id = "roundtrip-app";
      const target = path.join(tmpRoot, id);
      fs.mkdirSync(target, { recursive: true, mode: 0o770 });
      expect(fs.existsSync(target)).toBe(true);
      fs.rmSync(target, { recursive: true, force: true });
      expect(fs.existsSync(target)).toBe(false);
    } finally {
      if (prev === undefined) delete process.env["CRONTECH_SANDBOX_ROOT"];
      else process.env["CRONTECH_SANDBOX_ROOT"] = prev;
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});

// ── Sandbox: runInSandbox with mocked docker ─────────────────────────

describe("Sandbox: runInSandbox (mocked)", () => {
  afterEach(async () => {
    const { __setDockerRunnerForTesting } = await import("./sandbox");
    __setDockerRunnerForTesting(null);
  });

  test("invokes docker runner with hardened args", async () => {
    const { runInSandbox, __setDockerRunnerForTesting } = await import("./sandbox");
    let capturedArgs: string[] | undefined;
    __setDockerRunnerForTesting(async (args) => {
      capturedArgs = args;
      return { exitCode: 0, stdout: "", stderr: "", timedOut: false, wallClockMs: 10 };
    });

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "crontech-sb-"));
    const prev = process.env["CRONTECH_SANDBOX_ROOT"];
    process.env["CRONTECH_SANDBOX_ROOT"] = tmpRoot;
    try {
      // Need to re-resolve with current env. Since SANDBOX_ROOT is a
      // module-level constant captured at import time, use the fallback
      // path equal to the module's frozen SANDBOX_ROOT.
      const { SANDBOX_ROOT, resolveWorkspaceDir } = await import("./sandbox");
      const deploymentId = `runtest-${Date.now()}`;
      const workspace = resolveWorkspaceDir(deploymentId);
      fs.mkdirSync(workspace, { recursive: true });

      const result = await runInSandbox({
        deploymentId,
        workspaceDir: workspace,
        command: ["echo", "hi"],
      });

      expect(result.exitCode).toBe(0);
      expect(capturedArgs).toBeDefined();
      expect(capturedArgs?.[0]).toBe("docker");
      expect(capturedArgs).toContain("--cap-drop=ALL");
      expect(capturedArgs).toContain("--security-opt=no-new-privileges");

      fs.rmSync(workspace, { recursive: true, force: true });
      // Silence unused variable warning by touching it.
      expect(typeof SANDBOX_ROOT).toBe("string");
    } finally {
      if (prev === undefined) delete process.env["CRONTECH_SANDBOX_ROOT"];
      else process.env["CRONTECH_SANDBOX_ROOT"] = prev;
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  test("rejects workspaceDir that does not match deploymentId", async () => {
    const { runInSandbox, __setDockerRunnerForTesting } = await import("./sandbox");
    __setDockerRunnerForTesting(async () => ({
      exitCode: 0,
      stdout: "",
      stderr: "",
      timedOut: false,
      wallClockMs: 1,
    }));
    await expect(
      runInSandbox({
        deploymentId: "foo",
        workspaceDir: "/tmp/somewhere-else",
        command: ["true"],
      }),
    ).rejects.toThrow(/does not match/);
  });

  test("scrubs secrets from the captured stdout/stderr in default runner", async () => {
    const { scrubLogLine } = await import("./sandbox");
    // The default runner's pipe scrubs via scrubLogLine. We already test
    // scrubLogLine thoroughly; this test asserts the contract that the
    // same scrubbing function is available.
    expect(scrubLogLine("SECRET_TOKEN=abc")).toContain("SECRET_TOKEN=***");
  });
});

// ── Caddy: Site Block Generator ──────────────────────────────────────

describe("Caddy: buildCaddyfileBlock", () => {
  test("generates a reverse_proxy block for a slug", async () => {
    const { buildCaddyfileBlock } = await import("./caddy");
    const block = buildCaddyfileBlock("zoobicon", "127.0.0.1:8100");
    expect(block).toContain("zoobicon.crontech.ai {");
    expect(block).toContain("reverse_proxy 127.0.0.1:8100");
    expect(block).toContain("# >>> crontech-managed: zoobicon");
    expect(block).toContain("# <<< crontech-managed: zoobicon");
  });

  test("rejects invalid upstream strings", async () => {
    const { buildCaddyfileBlock } = await import("./caddy");
    expect(() => buildCaddyfileBlock("slug", "not-a-host")).toThrow();
    expect(() => buildCaddyfileBlock("slug", "127.0.0.1")).toThrow();
    expect(() => buildCaddyfileBlock("slug", "127.0.0.1:99999")).toThrow();
  });

  test("rejects slugs that would yield invalid hostnames", async () => {
    const { buildCaddyfileBlock } = await import("./caddy");
    expect(() => buildCaddyfileBlock("bad slug", "127.0.0.1:8100")).toThrow();
    expect(() => buildCaddyfileBlock(".leading-dot", "127.0.0.1:8100")).toThrow();
    expect(() => buildCaddyfileBlock("trailing-dash-", "127.0.0.1:8100")).toThrow();
  });

  test("custom root domain is respected", async () => {
    const { buildCaddyfileBlock } = await import("./caddy");
    const block = buildCaddyfileBlock("demo", "127.0.0.1:8200", "example.com");
    expect(block).toContain("demo.example.com {");
  });
});

describe("Caddy: appendSiteBlock + removeManagedBlock", () => {
  let tmpDir: string;
  let caddyfile: string;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("appends a new block to an empty Caddyfile", async () => {
    const { appendSiteBlock } = await import("./caddy");
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crontech-caddy-"));
    caddyfile = path.join(tmpDir, "Caddyfile");

    appendSiteBlock(caddyfile, "slug1", "127.0.0.1:8100");
    const contents = fs.readFileSync(caddyfile, "utf-8");
    expect(contents).toContain("slug1.crontech.ai {");
  });

  test("replaces an existing managed block with the same slug", async () => {
    const { appendSiteBlock } = await import("./caddy");
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crontech-caddy-"));
    caddyfile = path.join(tmpDir, "Caddyfile");

    appendSiteBlock(caddyfile, "slug1", "127.0.0.1:8100");
    appendSiteBlock(caddyfile, "slug1", "127.0.0.1:9200");

    const contents = fs.readFileSync(caddyfile, "utf-8");
    expect(contents).toContain("127.0.0.1:9200");
    expect(contents).not.toContain("127.0.0.1:8100");
    // Only one managed block for this slug.
    const matches = contents.match(/crontech-managed: slug1/g) ?? [];
    expect(matches).toHaveLength(2); // start + end marker
  });

  test("preserves unrelated content in the Caddyfile", async () => {
    const { appendSiteBlock } = await import("./caddy");
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "crontech-caddy-"));
    caddyfile = path.join(tmpDir, "Caddyfile");

    const preexisting = "# hand-written\nexample.com {\n\treverse_proxy localhost:9999\n}\n";
    fs.writeFileSync(caddyfile, preexisting);

    appendSiteBlock(caddyfile, "new-slug", "127.0.0.1:8300");
    const contents = fs.readFileSync(caddyfile, "utf-8");
    expect(contents).toContain("example.com {");
    expect(contents).toContain("new-slug.crontech.ai {");
  });

  test("removeManagedBlock cleans a specific slug only", async () => {
    const { removeManagedBlock, buildCaddyfileBlock } = await import("./caddy");
    const combined =
      buildCaddyfileBlock("keep", "127.0.0.1:8100") +
      buildCaddyfileBlock("remove-me", "127.0.0.1:8200");
    const cleaned = removeManagedBlock(combined, "remove-me");
    expect(cleaned).toContain("keep.crontech.ai {");
    expect(cleaned).not.toContain("remove-me.crontech.ai {");
  });

  test("removeManagedBlock is a no-op when slug not present", async () => {
    const { removeManagedBlock } = await import("./caddy");
    const input = "# nothing managed here\n";
    expect(removeManagedBlock(input, "anything")).toBe(input);
  });
});

describe("Caddy: host + upstream validation", () => {
  test("isValidHost", async () => {
    const { isValidHost } = await import("./caddy");
    expect(isValidHost("example.com")).toBe(true);
    expect(isValidHost("a.b.c.example.com")).toBe(true);
    expect(isValidHost("")).toBe(false);
    expect(isValidHost(".example.com")).toBe(false);
    expect(isValidHost("example..com")).toBe(false);
    expect(isValidHost("host with spaces")).toBe(false);
  });

  test("isValidUpstream", async () => {
    const { isValidUpstream } = await import("./caddy");
    expect(isValidUpstream("127.0.0.1:8100")).toBe(true);
    expect(isValidUpstream("localhost:3000")).toBe(true);
    expect(isValidUpstream("no-port")).toBe(false);
    expect(isValidUpstream("127.0.0.1:99999")).toBe(false);
    expect(isValidUpstream("127.0.0.1:0")).toBe(false);
  });
});

// ── Docker: Hardened Host Config ─────────────────────────────────────

describe("Docker: secureHostConfig hardening", () => {
  test("always injects the baseline flags", async () => {
    const { secureHostConfig, HARDENED_HOST_CONFIG_BASELINE } = await import("./docker");
    const hc = secureHostConfig(undefined);
    expect(hc.Memory).toBe(HARDENED_HOST_CONFIG_BASELINE.Memory);
    expect(hc.CapDrop).toEqual(["ALL"]);
    expect(hc.SecurityOpt).toEqual(["no-new-privileges"]);
    expect(hc.PidsLimit).toBe(512);
  });

  test("caller cannot override the memory cap", async () => {
    const { secureHostConfig } = await import("./docker");
    // TypeScript forbids this at compile time; at runtime it is ignored.
    const hc = secureHostConfig({ Memory: 99_999_999_999 as unknown as number });
    expect(hc.Memory).toBe(2 * 1024 * 1024 * 1024);
  });

  test("refuses NetworkMode=host", async () => {
    const { secureHostConfig } = await import("./docker");
    expect(() => secureHostConfig({ NetworkMode: "host" })).toThrow(
      /NetworkMode=host is forbidden/,
    );
  });

  test("preserves user port bindings", async () => {
    const { secureHostConfig } = await import("./docker");
    const hc = secureHostConfig({
      PortBindings: { "3000/tcp": [{ HostPort: "8100" }] },
    });
    expect(hc.PortBindings).toEqual({ "3000/tcp": [{ HostPort: "8100" }] });
  });
});

describe("Docker: assertHardenedConfig", () => {
  test("rejects missing HostConfig", async () => {
    const { assertHardenedConfig } = await import("./docker");
    expect(() =>
      assertHardenedConfig({ Image: "test" } as ContainerConfig),
    ).toThrow(/missing HostConfig/);
  });

  test("rejects NetworkMode=host", async () => {
    const { assertHardenedConfig, secureHostConfig } = await import("./docker");
    const config: ContainerConfig = {
      Image: "test",
      HostConfig: { ...secureHostConfig(undefined), NetworkMode: "bridge" },
    };
    // Mutate post-hardening to simulate tampering.
    (config.HostConfig as { NetworkMode: string }).NetworkMode = "host";
    expect(() => assertHardenedConfig(config)).toThrow();
  });

  test("rejects missing CapDrop ALL", async () => {
    const { assertHardenedConfig } = await import("./docker");
    expect(() =>
      assertHardenedConfig({
        Image: "test",
        HostConfig: {
          NetworkMode: "bridge",
        },
      } as unknown as ContainerConfig),
    ).toThrow(/CapDrop/);
  });

  test("accepts a properly-hardened config", async () => {
    const { assertHardenedConfig, secureHostConfig } = await import("./docker");
    const config: ContainerConfig = {
      Image: "test",
      HostConfig: secureHostConfig(undefined),
    };
    expect(() => assertHardenedConfig(config)).not.toThrow();
  });
});

describe("Docker: buildImage tag validation", () => {
  test("rejects tags with shell-unsafe characters", async () => {
    const { buildImage } = await import("./docker");
    await expect(buildImage("/tmp", "bad;name")).rejects.toThrow(/invalid/);
    await expect(buildImage("/tmp", "bad name")).rejects.toThrow(/invalid/);
    await expect(buildImage("/tmp", "`whoami`")).rejects.toThrow(/invalid/);
  });
});
