// ── Cloudflare Worker Entry Point ─────────────────────────────────────
// Edge-deployed API server. Sub-5ms cold starts across 330+ cities.
// This wraps the Hono API server for Cloudflare Workers runtime.

import { Hono } from "hono";
import { cors } from "hono/cors";
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
  OPENAI_API_KEY: string;
  DATABASE_AUTH_TOKEN: string;
  QDRANT_API_KEY?: string;
  NEON_DATABASE_URL?: string;
}

// ── Worker App ───────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>().basePath("/api");

// Security headers
app.use("*", secureHeaders());

// CORS
app.use(
  "*",
  cors({
    origin: ["https://backtothefuture.dev", "http://localhost:3000"],
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    maxAge: 86400,
  }),
);

// Health check
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    environment: c.env.ENVIRONMENT,
    timestamp: new Date().toISOString(),
    runtime: "cloudflare-workers",
    region: (c.req.raw as Request & { cf?: { colo?: string } }).cf?.colo ?? "unknown",
  });
});

// ── Workers AI (Edge Inference) ──────────────────────────────────────

app.post("/ai/edge-inference", async (c) => {
  const body = await c.req.json() as { prompt: string; model?: string };
  const model = body.model ?? "@cf/meta/llama-3.1-8b-instruct";

  try {
    const response = await c.env.AI.run(model as BaseAiTextGenerationModels, {
      prompt: body.prompt,
      max_tokens: 512,
    });

    return c.json({
      response,
      model,
      runtime: "workers-ai",
    });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Inference failed" },
      500,
    );
  }
});

// ── R2 Asset Storage ─────────────────────────────────────────────────

app.get("/assets/:key", async (c) => {
  const key = c.req.param("key");
  const object = await c.env.STORAGE.get(key);

  if (!object) {
    return c.json({ error: "Not found" }, 404);
  }

  const headers = new Headers();
  headers.set("Content-Type", object.httpMetadata?.contentType ?? "application/octet-stream");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("ETag", object.httpEtag);

  return new Response(object.body, { headers });
});

app.put("/assets/:key", async (c) => {
  const key = c.req.param("key");
  const body = await c.req.arrayBuffer();
  const contentType = c.req.header("Content-Type") ?? "application/octet-stream";

  await c.env.STORAGE.put(key, body, {
    httpMetadata: { contentType },
  });

  return c.json({ key, size: body.byteLength });
});

// ── KV Cache ─────────────────────────────────────────────────────────

app.get("/cache/:key", async (c) => {
  const value = await c.env.CACHE.get(c.req.param("key"));
  if (!value) return c.json({ error: "Not found" }, 404);
  return c.json({ value: JSON.parse(value) });
});

app.put("/cache/:key", async (c) => {
  const body = await c.req.json() as { value: unknown; ttl?: number };
  const ttl = body.ttl ?? 3600;
  await c.env.CACHE.put(
    c.req.param("key"),
    JSON.stringify(body.value),
    { expirationTtl: ttl },
  );
  return c.json({ success: true });
});

// ── Durable Objects (WebSocket Collaboration Rooms) ──────────────────

app.get("/collab/:roomId/ws", async (c) => {
  const roomId = c.req.param("roomId");
  const id = c.env.COLLAB_ROOM.idFromName(roomId);
  const stub = c.env.COLLAB_ROOM.get(id);
  return stub.fetch(c.req.raw);
});

export default app;

// ── Durable Object: Collaboration Room ───────────────────────────────

export class CollabRoom {
  private state: DurableObjectState;
  private connections = new Map<WebSocket, { userId: string; name?: string }>();

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    this.state.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string): Promise<void> {
    try {
      const data = JSON.parse(message) as { type: string; userId?: string; [key: string]: unknown };

      if (data.type === "join" && data.userId) {
        this.connections.set(ws, { userId: data.userId, name: data.name as string });
        // Broadcast user joined
        this.broadcast(
          JSON.stringify({
            type: "user_joined",
            userId: data.userId,
            users: Array.from(this.connections.values()),
          }),
          ws,
        );
      } else {
        // Relay all other messages to other connections
        this.broadcast(message, ws);
      }
    } catch {
      // Invalid message
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
    const window = Number(url.searchParams.get("window") ?? "60"); // seconds

    const now = Math.floor(Date.now() / 1000);
    const windowKey = `${key}:${Math.floor(now / window)}`;

    const current = ((await this.state.storage.get(windowKey)) as number) ?? 0;

    if (current >= limit) {
      return new Response(JSON.stringify({ allowed: false, remaining: 0 }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }

    await this.state.storage.put(windowKey, current + 1);

    return new Response(
      JSON.stringify({ allowed: true, remaining: limit - current - 1 }),
      { headers: { "Content-Type": "application/json" } },
    );
  }
}
