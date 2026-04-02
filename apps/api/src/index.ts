// ── Telemetry MUST be initialized before any other imports ───────
import { shutdown as shutdownTelemetry, telemetryMiddleware } from "./telemetry";

import { Hono } from "hono";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./trpc/router";
import { createContext } from "./trpc/context";
import { aiRoutes } from "./ai/routes";
import { wsApp, websocket, sseApp } from "./realtime";
import {
  compressMiddleware,
  securityHeaders,
  serverTimingMiddleware,
  etagMiddleware,
  cacheDynamic,
  cachePrivate,
  noCache,
} from "./middleware";
import { inngestApp } from "./workflows/serve";

const app = new Hono().basePath("/api");

// ── Global middleware (order matters) ────────────────────────────

// 1. Server-Timing — must be first to capture total request time
app.use("*", serverTimingMiddleware());

// 2. OpenTelemetry tracing on every request
app.use("*", telemetryMiddleware);

// 3. Security headers on every response
app.use("*", securityHeaders());

// 4. Compression — gzip for JSON/text responses
app.use("*", compressMiddleware());

// 5. ETag generation for conditional responses (saves bandwidth)
app.use("*", etagMiddleware());

// ── Routes ───────────────────────────────────────────────────────

// Health check — cacheable, public, 60s TTL
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

// tRPC — private cache for authenticated, dynamic for public reads
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

// Inngest durable workflows — AI pipelines, video processing, site building
app.route("/", inngestApp);

// Real-Time: WebSocket upgrade at /api/ws — never cache
app.use("/ws", noCache);
app.route("/", wsApp);

// Real-Time: SSE + REST endpoints — never cache
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
  console.log("Shutting down — flushing telemetry…");
  await shutdownTelemetry();
  process.exit(0);
};

process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);

export default app;
