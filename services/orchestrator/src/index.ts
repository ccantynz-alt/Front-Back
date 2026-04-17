// ── Deploy Orchestrator API Server ─────────────────────────────────────
// Hono server on localhost:9000 ONLY. NOT exposed to the internet.
// This is the internal control plane for Crontech app deployments.

import { Hono } from "hono";
import { z } from "zod";
import {
  deploy,
  rollback,
  undeploy,
  status,
  listApps,
  getLogs,
  getLogStream,
} from "./deployer";
import { startHealthMonitor } from "./health";

const app = new Hono();

// ── Zod Schemas ───────────────────────────────────────────────────────

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

const appNameSchema = z.object({
  appName: z.string().min(1),
});

// ── Health ────────────────────────────────────────────────────────────

app.get("/health", (c) => {
  return c.json({ status: "ok", service: "orchestrator", timestamp: new Date().toISOString() });
});

// ── Deploy ────────────────────────────────────────────────────────────

app.post("/deploy", async (c) => {
  try {
    const body: unknown = await c.req.json();
    const parsed = deploySchema.parse(body);
    const result = await deploy(parsed);
    return c.json(result, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Deploy failed";
    console.error("[orchestrator] Deploy error:", message);
    return c.json({ error: message }, 500);
  }
});

// ── Rollback ──────────────────────────────────────────────────────────

app.post("/rollback", async (c) => {
  try {
    const body: unknown = await c.req.json();
    const parsed = appNameSchema.parse(body);
    await rollback(parsed.appName);
    return c.json({ status: "rolled_back", appName: parsed.appName }, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Rollback failed";
    console.error("[orchestrator] Rollback error:", message);
    return c.json({ error: message }, 500);
  }
});

// ── Undeploy ──────────────────────────────────────────────────────────

app.post("/undeploy", async (c) => {
  try {
    const body: unknown = await c.req.json();
    const parsed = appNameSchema.parse(body);
    await undeploy(parsed.appName);
    return c.json({ status: "undeployed", appName: parsed.appName }, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Undeploy failed";
    console.error("[orchestrator] Undeploy error:", message);
    return c.json({ error: message }, 500);
  }
});

// ── Status ────────────────────────────────────────────────────────────

app.get("/status/:app", async (c) => {
  try {
    const appName = c.req.param("app");
    const result = await status(appName);
    if (!result) {
      return c.json({ error: `App "${appName}" not found` }, 404);
    }
    return c.json(result, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Status check failed";
    return c.json({ error: message }, 500);
  }
});

// ── List Apps ─────────────────────────────────────────────────────────

app.get("/apps", async (c) => {
  try {
    const apps = await listApps();
    return c.json({ apps }, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "List failed";
    return c.json({ error: message }, 500);
  }
});

// ── Logs (JSON) ──────────────────────────────────────────────────────

app.get("/logs/:app", async (c) => {
  try {
    const appName = c.req.param("app");
    const tailStr = c.req.query("tail");
    const tail = tailStr ? Number(tailStr) : 100;
    const logs = await getLogs(appName, tail);
    return c.json({ appName, logs }, 200);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Logs retrieval failed";
    return c.json({ error: message }, 500);
  }
});

// ── Logs (SSE Stream) ────────────────────────────────────────────────

app.get("/logs/:app/stream", (c) => {
  try {
    const appName = c.req.param("app");
    const stream = getLogStream(appName);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Log stream failed";
    return c.json({ error: message }, 500);
  }
});

// ── Start Server ──────────────────────────────────────────────────────

const PORT = Number(process.env["ORCHESTRATOR_PORT"] ?? "9000");

startHealthMonitor();

Bun.serve({
  fetch: app.fetch,
  port: PORT,
  hostname: "127.0.0.1",
});

console.log(`[orchestrator] Deploy orchestrator running on http://127.0.0.1:${PORT}`);
console.log("[orchestrator] Health monitor active (30s interval)");

export default app;
