import { Hono } from "hono";
import { cors } from "hono/cors";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./trpc/router";
import { createContext } from "./trpc/context";
import { aiRoutes } from "./ai/routes";
import { chatStreamRoutes } from "./ai/chat-stream";
import { wsApp, websocket, sseApp, theatreSseApp, yjsWsApp, liveUpdatesApp } from "./realtime";
import { terminalApp } from "./terminal/handler";
import { initTelemetry, httpRequestCount, httpRequestDuration, recordRequest, getMetrics } from "./telemetry";
import {
  projectAttributionMiddleware,
  withProjectAttrs,
} from "./telemetry/project-attribution";
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

// Initialize OpenTelemetry (no-op if OTEL_EXPORTER_OTLP_ENDPOINT not set).
// Fire-and-forget: `initTelemetry()` is async because it lazy-imports the
// Node-only `@opentelemetry/sdk-node` package so this file stays Workers-
// parseable. We do not await it — telemetry is best-effort; a missing SDK
// should never block the server from booting.
initTelemetry().catch((err) => {
  console.warn("[telemetry] init failed:", err);
});

import { startQueue } from "./automation/retry-queue";
import { startHealingLoop } from "./automation/self-heal";
import { runDispatcher } from "./webhooks/dispatcher";
import { gluecronPushApp } from "./webhooks/gluecron-push";
import { inboundSmsApp } from "./sms/inbound";
import { githubWebhookApp } from "./github/webhook";
import { deploymentLogsStreamApp } from "./deploy/logs-stream";
import { adminDeployApp } from "./deploy/admin-deploy";
import { platformAutoDeployApp } from "./deploy/platform-auto-deploy";
import { createEmpireHealthApp } from "./healthz/empire";
import { db as defaultDb } from "@back-to-the-future/db";
import {
  startHealthMonitor,
  getCurrentHealth,
  getHealthHistory,
} from "./automation/health-monitor";
import { getQueueStatus } from "./automation/retry-queue";

import { securityHeaders } from "./middleware/security-headers";
import { cacheControl } from "./middleware/cache-control";
import { createRateLimiter, type KvNamespaceLike } from "./middleware/rate-limiter";
import { csrf } from "./middleware/csrf";
import { apiKeyAuthMiddleware } from "./middleware/api-key-auth";
import { subdomainRouter } from "./middleware/subdomain";
import { googleOAuthRoutes } from "./auth/google-oauth";
import { unsubscribeRoutes } from "./email/unsubscribe";
import { alecRaeWebhookApp } from "./email/alecrae-webhook";
import { withAudit } from "./middleware/audit";

const app = new Hono().basePath("/api");

// ── Per-Project OTel Attribution (must run BEFORE the telemetry
//    middleware below so `http_request_count` / `http_request_duration`
//    samples pick up the `project_id` label from AsyncLocalStorage when
//    the URL is project-scoped). Safe no-op on non-project routes.
app.use("*", projectAttributionMiddleware());

// ── Subdomain Routing (Multi-Tenant) ────────────────────────────────
app.use("*", subdomainRouter);

// ── CORS (must be before other middleware so preflight OPTIONS work) ──
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://crontech.ai",
  "https://www.crontech.ai",
  // Cloudflare Pages preview/production URLs
  ...(process.env.CORS_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) ?? []),
];
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return "http://localhost:3000";
      if (ALLOWED_ORIGINS.includes(origin)) return origin;
      // Allow any *.pages.dev subdomain for Cloudflare Pages previews
      if (origin.endsWith(".pages.dev")) return origin;
      return null as unknown as string;
    },
    allowHeaders: ["Content-Type", "Authorization", "X-CSRF-Token", "X-Request-ID"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    exposeHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset", "X-Request-ID"],
    maxAge: 86400,
    credentials: true,
  }),
);

// ── Security Middleware ──────────────────────────────────────────────
app.use("*", securityHeaders());
// ── Cache-Control (prevent stale dynamic content) ───────────────────
app.use("*", cacheControl());
app.use("*", csrf({
  allowedOrigins: [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://crontech.ai",
    "https://www.crontech.ai",
    ...(process.env.CORS_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) ?? []),
  ],
}));
// Rate limiter: auto-selects Cloudflare KV when `RATE_LIMIT_KV` is bound to
// the Worker env, otherwise falls back to the in-memory limiter. This lets the
// same code run in `bun run dev` locally and on Cloudflare Workers in prod
// without branching. Define the binding in wrangler.toml and run
// `wrangler kv:namespace create RATE_LIMIT_KV` to provision.
const maybeKv = (globalThis as { RATE_LIMIT_KV?: KvNamespaceLike }).RATE_LIMIT_KV;
const rateLimitEnv: { RATE_LIMIT_KV?: KvNamespaceLike } | undefined = maybeKv
  ? { RATE_LIMIT_KV: maybeKv }
  : undefined;
app.use(
  "/api/trpc/*",
  createRateLimiter(
    rateLimitEnv
      ? { windowMs: 60_000, max: 200, env: rateLimitEnv }
      : { windowMs: 60_000, max: 200 },
  ),
);
app.use(
  "/api/auth/*",
  createRateLimiter(
    rateLimitEnv
      ? { windowMs: 60_000, max: 20, env: rateLimitEnv }
      : { windowMs: 60_000, max: 20 },
  ),
);
app.use(
  "/api/ai/*",
  createRateLimiter(
    rateLimitEnv
      ? { windowMs: 60_000, max: 30, env: rateLimitEnv }
      : { windowMs: 60_000, max: 30 },
  ),
);
// ── Rate limits for public read/approval/MCP surfaces ─────────────
// These endpoints are not behind API-key auth (they power the admin UI and
// the MCP discovery catalog) — but they must still be protected from
// unauthenticated flood traffic. Matches §6.4: "Rate limiting on all
// public endpoints. No endpoint is unprotected."
app.use(
  "/api/approvals/*",
  createRateLimiter(
    rateLimitEnv
      ? { windowMs: 60_000, max: 60, env: rateLimitEnv }
      : { windowMs: 60_000, max: 60 },
  ),
);
app.use(
  "/api/mcp/*",
  createRateLimiter(
    rateLimitEnv
      ? { windowMs: 60_000, max: 60, env: rateLimitEnv }
      : { windowMs: 60_000, max: 60 },
  ),
);
app.use(
  "/api/flags/*",
  createRateLimiter(
    rateLimitEnv
      ? { windowMs: 60_000, max: 120, env: rateLimitEnv }
      : { windowMs: 60_000, max: 120 },
  ),
);

// ── API Key Authentication ──────────────────────────────────────────
// Allows Bearer btf_sk_... tokens to authenticate against the API keys table.
app.use("/api/trpc/*", apiKeyAuthMiddleware);
app.use("/api/ai/*", apiKeyAuthMiddleware);

// ── Request Telemetry Middleware ──────────────────────────────────────
// `withProjectAttrs` merges the current AsyncLocalStorage frame's
// `project_id` into the attribute bag when the request belongs to a
// project (populated above by `projectAttributionMiddleware`). On
// non-project routes the helper is a no-op and we emit the same
// attribute shape we always have.
app.use("*", async (c, next) => {
  const start = performance.now();
  httpRequestCount.add(
    1,
    withProjectAttrs({ method: c.req.method, path: c.req.path }),
  );
  await next();
  const duration = performance.now() - start;
  httpRequestDuration.record(
    duration,
    withProjectAttrs({
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
    }),
  );
  recordRequest(duration);
});

// ── Global Error Boundary ────────────────────────────────────────────
// Hono's default error handler returns the raw Error message and stack to
// the client. That leaks server internals and gives no correlation id for
// support tickets. Wrap every unhandled throw into a structured, safe JSON
// response and log the underlying error to stderr for the observability
// pipeline to pick up.
app.onError((err, c) => {
  const requestId = c.req.header("x-request-id") ?? crypto.randomUUID();
  const message = err instanceof Error ? err.message : "Unknown error";
  // Log the full error server-side for debugging, but never return the
  // stack trace to the client.
  console.error(`[api:error] ${requestId} ${c.req.method} ${c.req.path}: ${message}`, err);
  c.header("X-Request-ID", requestId);
  return c.json(
    {
      error: "Internal server error",
      requestId,
    },
    500,
  );
});

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// ── Deploy Version Probe ─────────────────────────────────────────────
// The GitHub Actions deploy workflow polls this after `docker compose up`
// to confirm the *new* image is serving traffic. GIT_SHA is baked in at
// image build time via the Dockerfile ARG.
app.get("/version", (c) => {
  c.header("Cache-Control", "no-cache, no-store, must-revalidate");
  return c.json({
    sha: process.env.GIT_SHA ?? "unknown",
    service: "crontech-api",
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

// ── Automated Health Monitor Endpoint ───────────────────────────────
app.get("/health/monitor", (c) => {
  return c.json({
    current: getCurrentHealth(),
    history: getHealthHistory(),
    queue: getQueueStatus(),
  });
});

// ── Empire Health Endpoint (GET /api/healthz/empire) ────────────────
// Single-pane-of-glass self-host probe: postgres, gluecron, gatetest,
// caddy cert expiry, disk free %. Bearer-token gated to avoid leaking
// internal infra URLs to drive-by visitors. See src/healthz/empire.ts.
app.route("/", createEmpireHealthApp());

// ── Metrics Endpoint ────────────────────────────────────────────────
app.get("/metrics", (c) => {
  return c.json(getMetrics());
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

// ── Audit middleware on critical route groups ──────────────────────
app.use("/auth/*", withAudit("auth.action"));
app.use("/webhooks/*", withAudit("webhook.inbound"));

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

// ── Inbound Email Webhook (Resend) ──────────────────────────────────
app.post("/webhooks/inbound-email", async (c) => {
  try {
    const secret = process.env["RESEND_INBOUND_SECRET"];
    if (secret) {
      const provided =
        c.req.header("x-resend-signature") ??
        c.req.header("svix-signature") ??
        c.req.header("authorization");
      if (!provided || !provided.includes(secret)) {
        return c.json({ error: "Invalid signature" }, 401);
      }
    }
    const body = (await c.req.json()) as {
      from?: string | { email?: string };
      to?: string | string[] | { email?: string };
      subject?: string;
      text?: string;
      html?: string;
    };

    const from =
      typeof body.from === "string"
        ? body.from
        : body.from?.email ?? "unknown@unknown";
    const to = Array.isArray(body.to)
      ? body.to[0] ?? (process.env["SUPPORT_EMAIL"] ?? "support@crontech.ai")
      : typeof body.to === "string"
        ? body.to
        : body.to?.email ?? (process.env["SUPPORT_EMAIL"] ?? "support@crontech.ai");
    const subject = body.subject ?? "(no subject)";
    const text = body.text ?? body.html ?? "";

    // Fire-and-forget so we never block email delivery.
    const { processInboundEmail } = await import("./support/auto-responder");
    processInboundEmail({
      from,
      to,
      subject,
      body: text,
      bodyHtml: body.html,
    }).catch((err) => {
      console.error("[inbound-email] processing error:", err);
    });

    return c.json({ received: true });
  } catch (err) {
    console.error("[inbound-email] handler error:", err);
    return c.json({ received: true });
  }
});

// Mount inbound SMS webhook (raw Hono -- HMAC verification uses the raw
// body, so the signature check MUST run before any middleware that
// would consume or rewrite the request body).
// POST /api/sms/inbound — see sms/inbound.ts.
app.route("/", inboundSmsApp);

// Mount Gluecron push-notification receiver (raw Hono -- bearer auth is
// handled inside the route, not via the global middleware stack).
// POST /api/hooks/gluecron/push — see webhooks/gluecron-push.ts.
app.route("/", gluecronPushApp);

// Mount GitHub push webhook receiver (BLK-009) — HMAC-SHA256 verification
// is performed inside the handler against raw body, so it MUST stay
// outside global middleware that would rewrite / consume the body.
// POST /api/webhook/github — see github/webhook.ts.
app.route("/", githubWebhookApp);

// Platform auto-deploy: POST /api/hooks/github/platform
// GitHub pushes to ccantynz-alt/Crontech Main trigger the deploy agent.
app.route("/", platformAutoDeployApp);

// Mount Google OAuth routes (raw Hono -- needs redirects outside tRPC)
app.route("/auth", googleOAuthRoutes);

// Mount GDPR unsubscribe routes (GET + POST /api/unsubscribe, /api/resubscribe)
app.route("/", unsubscribeRoutes);

// Mount AlecRae email webhook receiver — HMAC-SHA256 verification runs
// inside the handler against raw body, so it MUST stay outside global
// middleware that would rewrite / consume the body.
// POST /api/alecrae/webhook — see email/alecrae-webhook.ts.
app.route("/", alecRaeWebhookApp);

// Mount AI routes (raw Hono -- streaming works better outside tRPC)
app.route("/ai", aiRoutes);

// Mount Anthropic chat streaming routes
app.route("/chat", chatStreamRoutes);

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

// Build Theatre: SSE live log stream for /ops
app.route("/", theatreSseApp);

// Live Updates: SSE push notifications for data changes
app.route("/", liveUpdatesApp);

// Terminal: WebSocket PTY at /api/terminal/:projectId
app.route("/", terminalApp);

// BLK-009: SSE live log stream for deployments at
// /api/deployments/:id/logs/stream
app.route("/", deploymentLogsStreamApp);

// Admin deploy trigger — POST /api/admin/deploy (proxies to deploy-agent on localhost:9091)
app.route("/api", adminDeployApp);

// ── Auto-migrate on startup (safe default: only when AUTO_MIGRATE=true) ──
async function maybeRunMigrations(): Promise<void> {
  const enabled = process.env.AUTO_MIGRATE === "true" || process.env.NODE_ENV !== "production";
  if (!enabled) {
    console.log("[startup] Skipping auto-migrate (set AUTO_MIGRATE=true to enable in prod)");
    return;
  }
  try {
    const { runMigrations } = await import("@back-to-the-future/db/migrate" as string).catch(
      async () => await import("../../../packages/db/src/migrate" as string),
    );
    if (typeof runMigrations === "function") {
      await runMigrations();
      console.log("[startup] Migrations applied.");
    }
  } catch (err) {
    console.warn("[startup] Migration failed - starting in degraded mode:", err);
  }
}

maybeRunMigrations().catch((err) => console.warn("[startup] migration wrapper error:", err));

// ── Bun-only long-lived boot path ──────────────────────────────────
// Everything below needs a long-running Node/Bun process: in-memory queues,
// `setInterval` timers, `Bun.serve`. None of it is valid on Cloudflare
// Workers (no `Bun` global, no persistent intervals between requests). Guard
// on `typeof Bun !== "undefined"` so Workers imports this module cleanly.
// Workers uses the `workerHandler` export below for `fetch` + `scheduled`
// instead.
if (typeof Bun !== "undefined") {
  // ── Start automation loops (Bun-only) ────────────────────────────
  startQueue();
  startHealingLoop();
  startHealthMonitor();

  // Webhook dispatcher: drains the `webhook_deliveries` queue every minute
  // in long-running server mode (Bun). On Cloudflare Workers, the same
  // `runDispatcher` call is wired into a cron trigger via the exported
  // `scheduled` handler below.
  const webhookDispatcherInterval = setInterval(() => {
    runDispatcher(defaultDb).catch((err) => {
      console.warn("[webhook-dispatcher] run failed:", err);
    });
  }, 60_000);
  // Unref so the interval does not keep a test process alive.
  if (typeof (webhookDispatcherInterval as unknown as { unref?: () => void }).unref === "function") {
    (webhookDispatcherInterval as unknown as { unref: () => void }).unref();
  }

  const port = Number(process.env.API_PORT) || 3001;

  Bun.serve({
    fetch: app.fetch,
    port,
    websocket,
  });

  console.log(`API server running on http://localhost:${port}`);
  console.log(`  WebSocket: ws://localhost:${port}/api/ws`);
  console.log(`  SSE: http://localhost:${port}/api/realtime/events/:roomId`);
  console.log(`  Terminal: ws://localhost:${port}/api/terminal/:projectId`);
}

// ── Cloudflare Workers entry point ─────────────────────────────────
// The default export is the ModuleWorker shape Cloudflare expects for
// both `fetch` AND `scheduled` cron triggers. `wrangler.toml`'s
// `[triggers] crons = ["*/1 * * * *"]` routes the webhook dispatcher
// through `workerHandler.scheduled`. The raw Hono `app` is still
// exported as a named export so existing tests that call
// `app.request(...)` keep working unchanged.
export { app };

export const workerHandler = {
  fetch: app.fetch,
  async scheduled(
    _event: unknown,
    _env: unknown,
    ctx: { waitUntil: (promise: Promise<unknown>) => void },
  ): Promise<void> {
    ctx.waitUntil(
      runDispatcher(defaultDb)
        .then((result) => {
          console.log(
            `[webhook-dispatcher] scheduled run: delivered=${result.delivered} failed=${result.failed}`,
          );
        })
        .catch((err) => {
          console.warn("[webhook-dispatcher] scheduled run failed:", err);
        }),
    );
  },
};

// default export removed — Bun auto-serve conflicts with explicit Bun.serve()
// on self-hosted deployments. Re-add for Cloudflare Workers if needed.
