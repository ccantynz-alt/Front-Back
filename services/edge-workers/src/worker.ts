// ── Cloudflare Worker Entry Point ─────────────────────────────────────
// Edge-deployed API server. Sub-5ms cold starts across 330+ cities.
// This wraps the Hono API server for Cloudflare Workers runtime.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";

// ── Cloudflare Bindings ──────────────────────────────────────────────

interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  CACHE: KVNamespace;
  AI: Ai;
  COLLAB_ROOM: DurableObjectNamespace;
  RATE_LIMITER: DurableObjectNamespace;
  ENVIRONMENT: string;
  API_VERSION: string;
  API_ORIGIN: string;
  OPENAI_API_KEY: string;
  DATABASE_AUTH_TOKEN: string;
  QDRANT_API_KEY?: string;
  NEON_DATABASE_URL?: string;
}

// ── CORS Origins ────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  "https://marcoreid.com",
  "https://www.marcoreid.com",
  "https://accounting.marcoreid.com",
  "https://legal.marcoreid.com",
  "https://immigration.marcoreid.com",
  "https://api.marcoreid.com",
  "http://localhost:3000",
  "http://localhost:3001",
];

// ── Subdomain → Vertical Router ─────────────────────────────────────
// Maps subdomains to vertical products. The worker reads the Host
// header and routes traffic to the right vertical.

type Vertical = "main" | "accounting" | "legal" | "immigration" | "api";

function resolveVertical(hostname: string): Vertical {
  // Strip port if present
  const host = hostname.split(":")[0] ?? hostname;

  if (host === "api.marcoreid.com") return "api";
  if (host === "accounting.marcoreid.com") return "accounting";
  if (host === "legal.marcoreid.com") return "legal";
  if (host === "immigration.marcoreid.com") return "immigration";
  // Main domain (marcoreid.com, www.marcoreid.com, localhost)
  return "main";
}

// ── Worker App ───────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use("*", secureHeaders());
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: ALLOWED_ORIGINS,
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "X-Request-ID",
      "X-Forwarded-For",
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    exposeHeaders: [
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
      "X-Request-ID",
    ],
    maxAge: 86400,
    credentials: true,
  }),
);

// ── Request ID Middleware ────────────────────────────────────────────

app.use("*", async (c, next) => {
  const requestId =
    c.req.header("X-Request-ID") ?? crypto.randomUUID();
  c.header("X-Request-ID", requestId);
  await next();
});

// ── Vertical Routing Middleware ──────────────────────────────────────
// Reads the Host header and sets a "vertical" header that downstream
// handlers use to render the right content / apply the right branding.

app.use("*", async (c, next) => {
  const hostname = c.req.header("host") ?? "localhost";
  const vertical = resolveVertical(hostname);
  c.header("X-Vertical", vertical);
  c.set("vertical" as never, vertical as never);
  await next();
});

// ── Vertical-Specific Routes ─────────────────────────────────────────

// accounting.marcoreid.com root → serves accounting landing page
app.get("/", async (c) => {
  const vertical = c.req.header("host")?.split(":")[0] ?? "";
  if (vertical === "accounting.marcoreid.com") {
    return c.redirect("/accounting", 302);
  }
  if (vertical === "legal.marcoreid.com") {
    return c.redirect("/legal-services", 302);
  }
  if (vertical === "immigration.marcoreid.com") {
    return c.redirect("/immigration", 302);
  }
  // Main domain falls through to normal handler
  return c.text("Marco Reid — route to main app");
});

// ── Rate Limiting Middleware (via Durable Objects) ───────────────────

app.use("/api/*", async (c, next) => {
  const clientIp =
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Forwarded-For") ??
    "unknown";
  const path = c.req.path;

  // Determine rate limit based on path
  let limit = 60;
  let window = 60;
  if (path.startsWith("/api/ai/")) {
    limit = 20;
    window = 60;
  } else if (path.startsWith("/api/trpc/")) {
    limit = 200;
    window = 60;
  }

  try {
    const id = c.env.RATE_LIMITER.idFromName("global");
    const stub = c.env.RATE_LIMITER.get(id);

    const url = new URL(c.req.url);
    url.pathname = "/check";
    url.searchParams.set("key", `${clientIp}:${path}`);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("window", String(window));

    const rateLimitRes = await stub.fetch(url.toString());
    const rateLimitData = (await rateLimitRes.json()) as {
      allowed: boolean;
      remaining: number;
    };

    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", String(rateLimitData.remaining));
    c.header(
      "X-RateLimit-Reset",
      String(Math.ceil(Date.now() / 1000) + window),
    );

    if (!rateLimitData.allowed) {
      return c.json(
        {
          error: "Too Many Requests",
          retryAfter: window,
          timestamp: new Date().toISOString(),
        },
        429,
      );
    }
  } catch {
    // If rate limiter is unavailable, allow the request through
    // (fail open to avoid blocking legitimate traffic)
  }

  await next();
});

// ── Global Error Handler ─────────────────────────────────────────────

app.onError((err, c) => {
  const isProduction = c.env.ENVIRONMENT === "production";
  const requestId = c.res.headers.get("X-Request-ID") ?? "unknown";

  console.error(
    `[${c.env.ENVIRONMENT}] [${requestId}] Unhandled error:`,
    err.message,
  );

  return c.json(
    {
      error: isProduction ? "Internal Server Error" : err.message,
      status: 500,
      requestId,
      timestamp: new Date().toISOString(),
    },
    500,
  );
});

// ── Health Check ─────────────────────────────────────────────────────

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    environment: c.env.ENVIRONMENT,
    version: c.env.API_VERSION,
    timestamp: new Date().toISOString(),
    runtime: "cloudflare-workers",
    region:
      (c.req.raw as Request & { cf?: { colo?: string } }).cf?.colo ??
      "unknown",
  });
});

app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    environment: c.env.ENVIRONMENT,
    version: c.env.API_VERSION,
    timestamp: new Date().toISOString(),
    runtime: "cloudflare-workers",
    region:
      (c.req.raw as Request & { cf?: { colo?: string } }).cf?.colo ??
      "unknown",
  });
});

// ── tRPC Proxy ──────────────────────────────────────────────────────

app.all("/api/trpc/*", async (c) => {
  const apiOrigin = c.env.API_ORIGIN ?? "http://localhost:3001";
  const url = new URL(c.req.url);
  const targetUrl = `${apiOrigin}${url.pathname}${url.search}`;

  try {
    const headers = new Headers(c.req.raw.headers);
    headers.set(
      "X-Forwarded-For",
      c.req.header("CF-Connecting-IP") ?? "unknown",
    );
    headers.set("X-Forwarded-Proto", "https");

    const response = await fetch(targetUrl, {
      method: c.req.method,
      headers,
      body:
        c.req.method !== "GET" && c.req.method !== "HEAD"
          ? c.req.raw.body
          : undefined,
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    return c.json(
      {
        error: "API proxy error",
        detail:
          error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      502,
    );
  }
});

// ── Workers AI (Edge Inference) ──────────────────────────────────────

app.post("/api/ai/edge-inference", async (c) => {
  const body = (await c.req.json()) as {
    prompt: string;
    model?: string;
  };
  const model = body.model ?? "@cf/meta/llama-3.1-8b-instruct";

  try {
    const response = await c.env.AI.run(
      model as BaseAiTextGenerationModels,
      {
        prompt: body.prompt,
        max_tokens: 512,
      },
    );

    return c.json({
      response,
      model,
      runtime: "workers-ai",
    });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Inference failed",
        timestamp: new Date().toISOString(),
      },
      500,
    );
  }
});

// ── R2 Asset Storage ─────────────────────────────────────────────────

app.get("/api/assets/:key", async (c) => {
  const key = c.req.param("key");
  const object = await c.env.STORAGE.get(key);

  if (!object) {
    return c.json(
      { error: "Not found", timestamp: new Date().toISOString() },
      404,
    );
  }

  const headers = new Headers();
  headers.set(
    "Content-Type",
    object.httpMetadata?.contentType ?? "application/octet-stream",
  );
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("ETag", object.httpEtag);

  return new Response(object.body, { headers });
});

app.put("/api/assets/:key", async (c) => {
  const key = c.req.param("key");
  const body = await c.req.arrayBuffer();
  const contentType =
    c.req.header("Content-Type") ?? "application/octet-stream";

  await c.env.STORAGE.put(key, body, {
    httpMetadata: { contentType },
  });

  return c.json({
    key,
    size: body.byteLength,
    timestamp: new Date().toISOString(),
  });
});

// ── KV Cache ─────────────────────────────────────────────────────────

app.get("/api/cache/:key", async (c) => {
  const value = await c.env.CACHE.get(c.req.param("key"));
  if (!value) {
    return c.json(
      { error: "Not found", timestamp: new Date().toISOString() },
      404,
    );
  }
  return c.json({ value: JSON.parse(value) });
});

app.put("/api/cache/:key", async (c) => {
  const body = (await c.req.json()) as {
    value: unknown;
    ttl?: number;
  };
  const ttl = body.ttl ?? 3600;
  await c.env.CACHE.put(
    c.req.param("key"),
    JSON.stringify(body.value),
    { expirationTtl: ttl },
  );
  return c.json({ success: true });
});

// ── D1 Database Access ───────────────────────────────────────────────

app.post("/api/db/query", async (c) => {
  const body = (await c.req.json()) as {
    sql: string;
    params?: unknown[];
  };
  if (!body.sql) {
    return c.json(
      {
        error: "Missing sql in request body",
        timestamp: new Date().toISOString(),
      },
      400,
    );
  }

  try {
    const stmt = c.env.DB.prepare(body.sql);
    const bound = body.params ? stmt.bind(...body.params) : stmt;
    const result = await bound.all();
    return c.json({ results: result.results, meta: result.meta });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Query failed",
        timestamp: new Date().toISOString(),
      },
      500,
    );
  }
});

// ── Durable Objects: Collaboration Rooms ─────────────────────────────

app.get("/api/collab/:roomId/ws", async (c) => {
  const roomId = c.req.param("roomId");
  const id = c.env.COLLAB_ROOM.idFromName(roomId);
  const stub = c.env.COLLAB_ROOM.get(id);
  return stub.fetch(c.req.raw);
});

// ── Rate Limiter Check (explicit endpoint) ──────────────────────────

app.get("/api/rate-limit/check", async (c) => {
  const key = c.req.query("key") ?? "default";
  const limit = c.req.query("limit") ?? "60";
  const window = c.req.query("window") ?? "60";

  const id = c.env.RATE_LIMITER.idFromName("global");
  const stub = c.env.RATE_LIMITER.get(id);

  const url = new URL(c.req.url);
  url.pathname = "/check";
  url.searchParams.set("key", key);
  url.searchParams.set("limit", limit);
  url.searchParams.set("window", window);

  return stub.fetch(url.toString());
});

// ── Stripe Webhook Proxy ────────────────────────────────────────────

app.post("/api/webhooks/stripe", async (c) => {
  const apiOrigin = c.env.API_ORIGIN ?? "http://localhost:3001";
  const targetUrl = `${apiOrigin}/api/webhooks/stripe`;

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: c.req.raw.headers,
      body: c.req.raw.body,
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    return c.json(
      {
        error: "Webhook proxy error",
        detail:
          error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      502,
    );
  }
});

// ── 404 Handler ──────────────────────────────────────────────────────

app.notFound((c) => {
  return c.json(
    {
      error: "Not Found",
      path: c.req.path,
      timestamp: new Date().toISOString(),
    },
    404,
  );
});

// ── Export App + Durable Object Classes ──────────────────────────────

export default app;

// ── Durable Object: Collaboration Room ───────────────────────────────

export class CollabRoom {
  private state: DurableObjectState;
  private connections = new Map<
    WebSocket,
    { userId: string; name?: string }
  >();

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response(
        JSON.stringify({
          error: "Expected WebSocket upgrade",
          timestamp: new Date().toISOString(),
        }),
        {
          status: 426,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    this.state.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string,
  ): Promise<void> {
    try {
      const data = JSON.parse(message) as {
        type: string;
        userId?: string;
        name?: string;
        [key: string]: unknown;
      };

      if (data.type === "join" && data.userId) {
        this.connections.set(ws, {
          userId: data.userId,
          name: data.name,
        });
        this.broadcast(
          JSON.stringify({
            type: "user_joined",
            userId: data.userId,
            users: Array.from(this.connections.values()),
          }),
          ws,
        );
      } else if (data.type === "leave") {
        const info = this.connections.get(ws);
        this.connections.delete(ws);
        if (info) {
          this.broadcast(
            JSON.stringify({
              type: "user_left",
              userId: info.userId,
            }),
          );
        }
      } else {
        // Relay all other messages to other participants
        this.broadcast(message, ws);
      }
    } catch {
      // Invalid message -- silently ignore
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const info = this.connections.get(ws);
    this.connections.delete(ws);

    if (info) {
      this.broadcast(
        JSON.stringify({ type: "user_left", userId: info.userId }),
      );
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.connections.delete(ws);
  }

  private broadcast(message: string, exclude?: WebSocket): void {
    for (const [ws] of this.connections) {
      if (ws === exclude) continue;
      try {
        ws.send(message);
      } catch {
        this.connections.delete(ws);
      }
    }
  }
}

// ── Durable Object: Rate Limiter ─────────────────────────────────────

export class RateLimiter {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const key = url.searchParams.get("key") ?? "default";
    const limit = Number(url.searchParams.get("limit") ?? "60");
    const window = Number(url.searchParams.get("window") ?? "60");

    const now = Math.floor(Date.now() / 1000);
    const windowKey = `${key}:${Math.floor(now / window)}`;

    const current =
      ((await this.state.storage.get(windowKey)) as number) ?? 0;

    if (current >= limit) {
      return new Response(
        JSON.stringify({
          allowed: false,
          remaining: 0,
          limit,
          window,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(window - (now % window)),
            "X-RateLimit-Limit": String(limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(
              now + (window - (now % window)),
            ),
          },
        },
      );
    }

    await this.state.storage.put(windowKey, current + 1);

    return new Response(
      JSON.stringify({
        allowed: true,
        remaining: limit - current - 1,
        limit,
        window,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": String(limit - current - 1),
          "X-RateLimit-Reset": String(
            now + (window - (now % window)),
          ),
        },
      },
    );
  }
}
