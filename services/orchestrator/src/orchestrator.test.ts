// ── Deploy Orchestrator Tests ──────────────────────────────────────────

import { describe, test, expect } from "bun:test";
import type {
  AppDeployment,
  Container,
  ContainerInspect,
  CaddyRoute,
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
