// ── Telemetry MUST be initialized before any other imports ───────
import { shutdown as shutdownTelemetry, telemetryMiddleware } from "./telemetry";

import { Hono } from "hono";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./trpc/router";
import { createContext } from "./trpc/context";
import { aiRoutes } from "./ai/routes";
import { wsApp, websocket, sseApp } from "./realtime";
import {
  requestIdMiddleware,
  corsMiddleware,
  loggerMiddleware,
  earlyHintsMiddleware,
  compressMiddleware,
  securityHeaders,
  serverTimingMiddleware,
  etagMiddleware,
  cacheDynamic,
  cachePrivate,
  noCache,
  apiRateLimit,
  authRateLimit,
  aiRateLimit,
} from "./middleware";
import { inngestApp } from "./workflows/serve";
import { handleStripeWebhook } from "./billing/webhooks";
import { flushPendingUsage } from "./billing/usage-tracker";
import { collabWsApp } from "./collab";

const app = new Hono().basePath("/api");

// ── Global middleware (order matters) ────────────────────────────

// 1. Request ID — everything else references it
app.use("*", requestIdMiddleware);

// 2. Server-Timing — must be early to capture total request time
app.use("*", serverTimingMiddleware());

// 3. CORS — must run before any response is sent
app.use("*", corsMiddleware);

// 4. Structured JSON logger (skips /health)
app.use("*", loggerMiddleware);

// 5. Early Hints for HTML-accepting GET requests
app.use("*", earlyHintsMiddleware);

// 6. OpenTelemetry tracing on every request
app.use("*", telemetryMiddleware);

// 7. Security headers on every response
app.use("*", securityHeaders());

// 8. Compression — gzip for JSON/text responses
app.use("*", compressMiddleware());

// 9. ETag generation for conditional responses (saves bandwidth)
app.use("*", etagMiddleware());

// ── Per-route rate limiting ─────────────────────────────────────
app.use("/trpc/auth.*", authRateLimit);
app.use("/ai/*", aiRateLimit);
app.use("*", apiRateLimit);

// ── Routes ───────────────────────────────────────────────────────

// Health check — cacheable, 60s TTL
app.use("/health", cacheDynamic);
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// AI routes — streaming, never cache
app.use("/ai/*", noCache);
app.route("/ai", aiRoutes);

// tRPC — private cache for authenticated responses
app.use("/trpc/*", cachePrivate);
app.use("/trpc/*", async (c) => {
  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext: () => createContext(c),
  });
  return response;
});

// Stripe webhooks — raw body required, no compression/caching
app.post("/webhooks/stripe", handleStripeWebhook);

// Inngest durable workflows
app.route("/", inngestApp);

// Collaboration: Yjs CRDT WebSocket — never cache
app.use("/collab/*", noCache);
app.route("/collab", collabWsApp);

// Real-Time: WebSocket — never cache
app.use("/ws", noCache);
app.route("/", wsApp);

// Real-Time: SSE + REST — never cache
app.use("/realtime/*", noCache);
app.route("/", sseApp);

// Only start Bun.serve when running directly (not in Cloudflare Workers)
if (typeof Bun !== "undefined" && Bun.serve) {
  const port = Number(process.env.API_PORT) || 3001;

  Bun.serve({
    fetch: app.fetch,
    port,
    websocket,
  });

  console.log(`API server running on http://localhost:${port}`);
  console.log(`  WebSocket: ws://localhost:${port}/api/ws`);
  console.log(`  SSE: http://localhost:${port}/api/realtime/events/:roomId`);
}

// ── Graceful shutdown ────────────────────────────────────────────
const handleShutdown = async (): Promise<void> => {
  console.log("Shutting down — flushing telemetry and pending usage…");
  await Promise.all([shutdownTelemetry(), flushPendingUsage()]);
  process.exit(0);
};

process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);

export default app;
