// ── R2 Object Storage Worker ──────────────────────────────────────────
// Edge-deployed R2 worker for serving static assets and site files.
// Supports full CRUD operations with proper Content-Type handling.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";

// ── Cloudflare Bindings ──────────────────────────────────────────────

export interface R2Env {
  R2_BUCKET: R2Bucket;
  ENVIRONMENT: string;
}

// ── Content-Type Mapping ─────────────────────────────────────────────

const CONTENT_TYPE_MAP: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wasm": "application/wasm",
  ".xml": "application/xml",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
};

function getContentType(key: string): string {
  const ext = key.substring(key.lastIndexOf(".")).toLowerCase();
  return CONTENT_TYPE_MAP[ext] ?? "application/octet-stream";
}

// ── Worker App ───────────────────────────────────────────────────────

const app = new Hono<{ Bindings: R2Env }>();

// Security headers
app.use("*", secureHeaders());

// CORS
app.use(
  "*",
  cors({
    origin: ["https://backtothefuture.dev", "http://localhost:3000"],
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "PUT", "DELETE", "HEAD", "OPTIONS"],
    maxAge: 86400,
  }),
);

// ── Health Check ─────────────────────────────────────────────────────

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "r2-worker",
    environment: c.env.ENVIRONMENT,
    timestamp: new Date().toISOString(),
  });
});

// ── List Objects ─────────────────────────────────────────────────────

app.get("/list", async (c) => {
  const prefix = c.req.query("prefix") ?? "";
  const limit = Number(c.req.query("limit") ?? "100");
  const cursor = c.req.query("cursor");

  const options: R2ListOptions = { prefix, limit };
  if (cursor) {
    options.cursor = cursor;
  }

  const listed = await c.env.R2_BUCKET.list(options);

  return c.json({
    objects: listed.objects.map((obj) => ({
      key: obj.key,
      size: obj.size,
      etag: obj.etag,
      uploaded: obj.uploaded.toISOString(),
    })),
    truncated: listed.truncated,
    cursor: listed.truncated ? listed.cursor : undefined,
  });
});

// ── HEAD - Check Object Exists ───────────────────────────────────────

app.on("HEAD", "/:key{.+}", async (c) => {
  const key = c.req.param("key");
  const head = await c.env.R2_BUCKET.head(key);

  if (!head) {
    return c.body(null, 404);
  }

  return c.body(null, 200, {
    "Content-Type": head.httpMetadata?.contentType ?? getContentType(key),
    "Content-Length": String(head.size),
    ETag: head.etag,
    "Last-Modified": head.uploaded.toUTCString(),
  });
});

// ── GET - Fetch Object ───────────────────────────────────────────────

app.get("/:key{.+}", async (c) => {
  const key = c.req.param("key");
  const object = await c.env.R2_BUCKET.get(key);

  if (!object) {
    return c.json({ error: "Not found" }, 404);
  }

  const contentType = object.httpMetadata?.contentType ?? getContentType(key);

  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Content-Length", String(object.size));
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("ETag", object.httpEtag);
  headers.set("Last-Modified", object.uploaded.toUTCString());

  return new Response(object.body, { headers });
});

// ── PUT - Store Object ───────────────────────────────────────────────

app.put("/:key{.+}", async (c) => {
  const key = c.req.param("key");
  const body = await c.req.arrayBuffer();
  const contentType = c.req.header("Content-Type") ?? getContentType(key);

  const object = await c.env.R2_BUCKET.put(key, body, {
    httpMetadata: { contentType },
  });

  return c.json({
    key,
    size: body.byteLength,
    etag: object?.etag,
    contentType,
  });
});

// ── DELETE - Remove Object ───────────────────────────────────────────

app.delete("/:key{.+}", async (c) => {
  const key = c.req.param("key");

  await c.env.R2_BUCKET.delete(key);

  return c.json({ deleted: true, key });
});

export default app;
