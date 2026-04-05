import { Hono } from "hono";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./trpc/router";
import { createContext } from "./trpc/context";
import { aiRoutes } from "./ai/routes";
import { wsApp, websocket, sseApp, yjsWsApp } from "./realtime";
import { initTelemetry, httpRequestCount, httpRequestDuration } from "./telemetry";
import { getAllFlags, isFeatureEnabled } from "./feature-flags";
import { checkNeonHealth } from "@back-to-the-future/db/neon";
import {
  checkQdrantHealth,
  getPendingApprovals,
  getApprovalRequest,
  approveRequest,
  rejectRequest,
  getMCPTools,
  getMCPResources,
  handleMCPToolCall,
  handleMCPResourceRead,
  listComponents,
} from "@back-to-the-future/ai-core";

// Initialize OpenTelemetry (no-op if OTEL_EXPORTER_OTLP_ENDPOINT not set)
const telemetry = initTelemetry();

import { cors } from "hono/cors";
import { securityHeaders } from "./middleware/security-headers";
import { rateLimiter } from "./middleware/rate-limiter";
import { csrf } from "./middleware/csrf";

const WEB_ORIGIN = process.env["WEB_ORIGIN"] ?? "http://localhost:3000";
const ALLOWED_ORIGINS = [WEB_ORIGIN, "http://localhost:3001"];

const app = new Hono().basePath("/api");

// ── Security Middleware ──────────────────────────────────────────────
app.use("*", cors({
  origin: ALLOWED_ORIGINS,
  allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "x-trpc-source", "stripe-signature"],
  exposeHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "Retry-After"],
  credentials: true,
  maxAge: 86400,
}));
app.use("*", securityHeaders());
app.use("*", csrf({ allowedOrigins: ALLOWED_ORIGINS }));
app.use("/trpc/*", rateLimiter({ windowMs: 60_000, max: 200 }));
app.use("/ai/*", rateLimiter({ windowMs: 60_000, max: 30 }));

// ── Request Telemetry Middleware ──────────────────────────────────────
app.use("*", async (c, next) => {
  const start = performance.now();
  httpRequestCount.add(1, { method: c.req.method, path: c.req.path });
  await next();
  const duration = performance.now() - start;
  httpRequestDuration.record(duration, {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
  });
});

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// ── Extended Health Check (all services) ─────────────────────────────
app.get("/health/full", async (c) => {
  const [neon, qdrant] = await Promise.allSettled([
    checkNeonHealth(),
    checkQdrantHealth(),
  ]);

  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      neon: neon.status === "fulfilled" ? neon.value : { status: "error", error: "check failed" },
      qdrant: qdrant.status === "fulfilled" ? qdrant.value : { status: "error", error: "check failed" },
    },
  });
});

// ── Feature Flags Endpoints ──────────────────────────────────────────
app.get("/flags", (c) => {
  return c.json({ flags: getAllFlags() });
});

app.get("/flags/:key", (c) => {
  const key = c.req.param("key");
  const userId = c.req.query("userId");
  return c.json({
    key,
    enabled: isFeatureEnabled(key, userId),
  });
});

// ── AI Agent Approval Endpoints ──────────────────────────────────────
app.get("/approvals", (c) => {
  const sessionId = c.req.query("sessionId");
  return c.json({ approvals: getPendingApprovals(sessionId) });
});

app.get("/approvals/:id", (c) => {
  const request = getApprovalRequest(c.req.param("id"));
  if (!request) return c.json({ error: "Not found" }, 404);
  return c.json(request);
});

app.post("/approvals/:id/approve", async (c) => {
  const body = await c.req.json() as { approvedBy?: string };
  const result = approveRequest(c.req.param("id"), body.approvedBy ?? "unknown");
  if (!result) return c.json({ error: "Request not found or expired" }, 404);
  return c.json(result);
});

app.post("/approvals/:id/reject", async (c) => {
  const body = await c.req.json() as { rejectedBy?: string };
  const result = rejectRequest(c.req.param("id"), body.rejectedBy ?? "unknown");
  if (!result) return c.json({ error: "Request not found or expired" }, 404);
  return c.json(result);
});

// ── MCP Component Catalog Endpoints ─────────────────────────────────
app.get("/mcp/tools", (c) => c.json({ tools: getMCPTools() }));
app.get("/mcp/resources", (c) => c.json({ resources: getMCPResources() }));
app.get("/mcp/components", (c) => c.json(listComponents()));

app.post("/mcp/tools/call", async (c) => {
  const body = await c.req.json() as { name: string; arguments: Record<string, unknown> };
  const result = handleMCPToolCall(body.name, body.arguments ?? {});
  return c.json({ result });
});

app.get("/mcp/resources/:uri{.+}", (c) => {
  const uri = `btf://${c.req.param("uri")}`;
  const result = handleMCPResourceRead(uri);
  return c.json({ result });
});

// ── Stripe Webhook (raw Hono -- needs raw body for signature verification) ──
app.post("/webhooks/stripe", async (c) => {
  const { constructWebhookEvent, handleWebhookEvent } = await import("./stripe/webhooks");
  const signature = c.req.header("stripe-signature");
  if (!signature) {
    return c.json({ error: "Missing stripe-signature header" }, 400);
  }
  try {
    const rawBody = await c.req.text();
    const event = constructWebhookEvent(rawBody, signature);
    await handleWebhookEvent(event);
    return c.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook error";
    console.error("Stripe webhook error:", message);
    return c.json({ error: message }, 400);
  }
});

// Mount AI routes (raw Hono -- streaming works better outside tRPC)
app.route("/ai", aiRoutes);

app.use("/trpc/*", async (c) => {
  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext: () => createContext(c),
  });
  return response;
});

// Real-Time: WebSocket upgrade at /api/ws
app.route("/", wsApp);

// Real-Time: Yjs CRDT sync WebSocket at /api/yjs/:roomId
app.route("/", yjsWsApp);

// Real-Time: SSE + REST endpoints
app.route("/", sseApp);

const port = Number(process.env.API_PORT) || 3001;

Bun.serve({
  fetch: app.fetch,
  port,
  websocket,
});

console.log(`API server running on http://localhost:${port}`);
console.log(`  WebSocket: ws://localhost:${port}/api/ws`);
console.log(`  SSE: http://localhost:${port}/api/realtime/events/:roomId`);

export default app;
