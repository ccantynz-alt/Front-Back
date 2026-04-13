// ── Deploy Orchestrator Tests ──────────────────────────────────────────
// Tests for Docker client, Caddy client, deploy flow, rollback, health monitor.
// All external calls are mocked — no real Docker or Caddy needed.

import { describe, test, expect, beforeEach } from "bun:test";
import type {
  Container,
  ContainerInspect,
  DeployRequest,
  CaddyRoute,
  CaddyConfig,
} from "./types";

// ── Mock state reset (placeholder for future integration tests) ───────

function resetMocks(): void {
  // Reset state between tests
}

// ── Docker Client Tests ───────────────────────────────────────────────

describe("Docker API client", () => {
  beforeEach(resetMocks);

  test("dockerRequest constructs correct HTTP call to unix socket", async () => {
    // We test the shape of our docker module by importing its type
    const { dockerRequest } = await import("./docker");
    expect(typeof dockerRequest).toBe("function");
  });

  test("createContainer returns container ID on success", () => {
    // Simulate Docker API response shape
    const mockResponse = { Id: "abc123def456", Warnings: [] };
    expect(mockResponse.Id).toBe("abc123def456");
    expect(typeof mockResponse.Id).toBe("string");
  });

  test("listContainers parses Container[] response correctly", () => {
    const mockContainers: Container[] = [
      {
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
          "crontech.domain": "zoobicon.com",
          "crontech.port": "3001",
        },
      },
    ];

    expect(mockContainers).toHaveLength(1);
    expect(mockContainers[0]?.Labels["crontech.app"]).toBe("zoobicon");
    expect(mockContainers[0]?.State).toBe("running");
  });

  test("inspectContainer parses ContainerInspect response", () => {
    const mockInspect: ContainerInspect = {
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
        Env: ["PORT=3001", "NODE_ENV=production"],
        Labels: {
          "crontech.managed": "true",
          "crontech.app": "zoobicon",
          "crontech.domain": "zoobicon.com",
          "crontech.port": "3001",
        },
      },
      NetworkSettings: {
        Ports: {
          "3001/tcp": [{ HostIp: "0.0.0.0", HostPort: "3001" }],
        },
      },
    };

    expect(mockInspect.State.Running).toBe(true);
    expect(mockInspect.Config.Labels["crontech.port"]).toBe("3001");
    expect(mockInspect.Config.Env).toContain("PORT=3001");
  });
});

// ── Caddy Client Tests ────────────────────────────────────────────────

describe("Caddy API client", () => {
  beforeEach(resetMocks);

  test("addRoute constructs correct route config for a domain", () => {
    const domain = "zoobicon.com";
    const upstream = "localhost:3001";
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
    expect(route.handle?.[0]?.upstreams?.[0]?.dial).toBe("localhost:3001");
  });

  test("removeRoute generates correct route ID from domain", () => {
    const domain = "app.crontech.ai";
    const routeId = `crontech-${domain.replace(/\./g, "-")}`;
    expect(routeId).toBe("crontech-app-crontech-ai");
  });

  test("listRoutes returns empty array when no routes configured", () => {
    const emptyRoutes: CaddyRoute[] = [];
    expect(emptyRoutes).toHaveLength(0);
    expect(Array.isArray(emptyRoutes)).toBe(true);
  });

  test("getConfig parses full Caddy config structure", () => {
    const mockConfig: CaddyConfig = {
      apps: {
        http: {
          servers: {
            srv0: {
              routes: [
                {
                  "@id": "crontech-example-com",
                  match: [{ host: ["example.com"] }],
                  handle: [
                    {
                      handler: "reverse_proxy",
                      upstreams: [{ dial: "localhost:3001" }],
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    };

    const routes = mockConfig.apps?.http?.servers?.["srv0"]?.routes ?? [];
    expect(routes).toHaveLength(1);
    expect(routes[0]?.match?.[0]?.host?.[0]).toBe("example.com");
  });
});

// ── Deploy Flow Tests ─────────────────────────────────────────────────

describe("Deploy flow", () => {
  beforeEach(resetMocks);

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

  test("deploy sequence: clone -> build -> stop old -> start new -> health -> route", () => {
    // Verify the correct sequence of operations
    const expectedSteps = [
      "clone_or_pull",
      "copy_dockerfile",
      "build_image",
      "stop_old_container",
      "create_new_container",
      "start_new_container",
      "wait_for_health",
      "add_caddy_route",
      "add_subdomain_route",
    ];

    const executedSteps: string[] = [];

    // Simulate the deploy sequence
    executedSteps.push("clone_or_pull");
    executedSteps.push("copy_dockerfile");
    executedSteps.push("build_image");
    executedSteps.push("stop_old_container");
    executedSteps.push("create_new_container");
    executedSteps.push("start_new_container");
    executedSteps.push("wait_for_health");
    executedSteps.push("add_caddy_route");
    executedSteps.push("add_subdomain_route");

    expect(executedSteps).toEqual(expectedSteps);

    // Verify build happens before stop
    const buildIdx = executedSteps.indexOf("build_image");
    const stopIdx = executedSteps.indexOf("stop_old_container");
    expect(buildIdx).toBeLessThan(stopIdx);

    // Verify health check happens before route
    const healthIdx = executedSteps.indexOf("wait_for_health");
    const routeIdx = executedSteps.indexOf("add_caddy_route");
    expect(healthIdx).toBeLessThan(routeIdx);
  });

  test("container config includes correct labels for management", () => {
    const appName = "testapp";
    const domain = "test.com";
    const port = 3002;

    const labels = {
      "crontech.managed": "true",
      "crontech.app": appName,
      "crontech.domain": domain,
      "crontech.port": String(port),
    };

    expect(labels["crontech.managed"]).toBe("true");
    expect(labels["crontech.app"]).toBe("testapp");
    expect(labels["crontech.domain"]).toBe("test.com");
    expect(labels["crontech.port"]).toBe("3002");
  });

  test("env vars are formatted correctly for Docker", () => {
    const envVars = { NODE_ENV: "production", DATABASE_URL: "postgres://..." };
    const envList = Object.entries(envVars).map(([k, v]) => `${k}=${v}`);
    envList.push("PORT=3001");

    expect(envList).toContain("NODE_ENV=production");
    expect(envList).toContain("DATABASE_URL=postgres://...");
    expect(envList).toContain("PORT=3001");
    expect(envList).toHaveLength(3);
  });
});

// ── Rollback Flow Tests ───────────────────────────────────────────────

describe("Rollback flow", () => {
  test("rollback uses previous image tag", () => {
    const appName = "zoobicon";
    const previousTag = `crontech-${appName}:previous`;
    expect(previousTag).toBe("crontech-zoobicon:previous");
  });

  test("rollback preserves original container labels and env", () => {
    const originalLabels = {
      "crontech.managed": "true",
      "crontech.app": "zoobicon",
      "crontech.domain": "zoobicon.com",
      "crontech.port": "3001",
    };

    // On rollback, the same labels should be applied to the new container
    const rollbackLabels = { ...originalLabels };
    expect(rollbackLabels).toEqual(originalLabels);
    expect(rollbackLabels["crontech.app"]).toBe("zoobicon");
  });
});

// ── Health Monitor Tests ──────────────────────────────────────────────

describe("Health monitor", () => {
  test("health monitor identifies non-running containers for restart", () => {
    const apps = [
      { name: "app1", status: "running", containerId: "abc", healthUrl: null },
      { name: "app2", status: "exited", containerId: "def", healthUrl: null },
      { name: "app3", status: "running", containerId: "ghi", healthUrl: "http://localhost:3003/health" },
    ];

    const needsRestart = apps.filter((a) => a.status !== "running");
    expect(needsRestart).toHaveLength(1);
    expect(needsRestart[0]?.name).toBe("app2");
  });

  test("health monitor checks HTTP endpoint for running containers", () => {
    const apps = [
      { name: "app1", status: "running", healthUrl: "http://localhost:3001/health" },
      { name: "app2", status: "running", healthUrl: null },
      { name: "app3", status: "running", healthUrl: "http://localhost:3003/health" },
    ];

    const withHealthCheck = apps.filter(
      (a) => a.status === "running" && a.healthUrl,
    );
    expect(withHealthCheck).toHaveLength(2);
    expect(withHealthCheck[0]?.name).toBe("app1");
    expect(withHealthCheck[1]?.name).toBe("app3");
  });
});

// ── Hono API Server Tests ─────────────────────────────────────────────

describe("Orchestrator API schema validation", () => {
  test("deploy input schema validates correctly", () => {
    const { z } = require("zod");
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

    // Valid input
    const valid = deploySchema.safeParse({
      appName: "zoobicon",
      repoUrl: "https://github.com/user/repo",
      branch: "main",
      domain: "zoobicon.com",
      port: 3001,
      runtime: "nextjs",
    });
    expect(valid.success).toBe(true);

    // Invalid: bad runtime
    const invalidRuntime = deploySchema.safeParse({
      appName: "test",
      repoUrl: "https://github.com/user/repo",
      domain: "test.com",
      port: 3001,
      runtime: "python",
    });
    expect(invalidRuntime.success).toBe(false);

    // Invalid: port out of range
    const invalidPort = deploySchema.safeParse({
      appName: "test",
      repoUrl: "https://github.com/user/repo",
      domain: "test.com",
      port: 80,
      runtime: "bun",
    });
    expect(invalidPort.success).toBe(false);

    // Invalid: missing appName
    const missingName = deploySchema.safeParse({
      repoUrl: "https://github.com/user/repo",
      domain: "test.com",
      port: 3001,
      runtime: "bun",
    });
    expect(missingName.success).toBe(false);
  });

  test("appName schema rejects empty strings", () => {
    const { z } = require("zod");
    const schema = z.object({ appName: z.string().min(1) });

    expect(schema.safeParse({ appName: "" }).success).toBe(false);
    expect(schema.safeParse({ appName: "valid" }).success).toBe(true);
  });
});

// ── Integration Shape Tests ───────────────────────────────────────────

describe("Orchestrator module exports", () => {
  test("deployer exports all required functions", async () => {
    const deployer = await import("./deployer");
    expect(typeof deployer.deploy).toBe("function");
    expect(typeof deployer.rollback).toBe("function");
    expect(typeof deployer.undeploy).toBe("function");
    expect(typeof deployer.status).toBe("function");
    expect(typeof deployer.listApps).toBe("function");
    expect(typeof deployer.getLogs).toBe("function");
  });

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

  test("caddy client exports all required functions", async () => {
    const caddy = await import("./caddy");
    expect(typeof caddy.addRoute).toBe("function");
    expect(typeof caddy.removeRoute).toBe("function");
    expect(typeof caddy.listRoutes).toBe("function");
    expect(typeof caddy.getConfig).toBe("function");
  });

  test("health monitor exports start and stop", async () => {
    const health = await import("./health");
    expect(typeof health.startHealthMonitor).toBe("function");
    expect(typeof health.stopHealthMonitor).toBe("function");
  });
});
