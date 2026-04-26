/**
 * Crontech Self-Hosted Object Storage — Bun proxy + admin layer (BLK-018 v0).
 *
 * A small Bun.serve() process running on 127.0.0.1:${OBJECT_STORAGE_PROXY_PORT
 * ?? 9094}. It sits in front of the local MinIO container (started by the
 * docker-compose stack in this same directory) and adds:
 *
 *   - Bearer-token authentication for every endpoint except /health.
 *   - Bucket admin verbs (list buckets, create bucket).
 *   - Pass-through for the standard S3 verbs against the v0 default bucket
 *     so an admin can sanity-check the deployment without an S3 client.
 *
 * It is NOT a customer ingress — it listens on 127.0.0.1 only. Public
 * access to the S3 API will go through the edge runtime (BLK-017) once
 * BLK-019's reverse-tunnel daemon lands. For v0 we only need a controlled
 * admin surface that the API server can call over localhost.
 *
 * Auth:   Authorization: Bearer ${OBJECT_STORAGE_SECRET}
 * Health: GET /health (no auth)
 *
 * Routes:
 *   GET    /health                    → { ok, pid }
 *   GET    /buckets                   → { ok, buckets: [{ name, createdAt }] }
 *   POST   /buckets/:name             → { ok, bucket }
 *   GET    /objects/:key              → proxied GET to MinIO
 *   PUT    /objects/:key              → proxied PUT to MinIO
 *   DELETE /objects/:key              → proxied DELETE to MinIO
 *   GET    /objects?prefix=foo/       → list objects in default bucket
 *   POST   /presign/get               → { url, key, expiresAt }
 *   POST   /presign/put               → { url, key, expiresAt }
 *
 * The router is exported as a pure function so unit tests can hit it
 * directly without binding a TCP port.
 */

import {
  ObjectStorageClient,
  isValidBucketName,
  type ObjectStorageClientOptions,
} from "./client";

// ── Configuration ───────────────────────────────────────────────────

const PROXY_HOST = "127.0.0.1";
const DEFAULT_PROXY_PORT = 9094;
const DEFAULT_MINIO_ENDPOINT = "http://127.0.0.1:9000";

export interface ProxyConfig {
  port: number;
  secret: string;
  minioEndpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export function loadConfig(
  env: Record<string, string | undefined> = process.env as Record<
    string,
    string | undefined
  >,
): ProxyConfig {
  const secret = env["OBJECT_STORAGE_SECRET"] ?? "";
  const accessKeyId =
    env["OBJECT_STORAGE_ACCESS_KEY_ID"] ?? env["MINIO_ROOT_USER"] ?? "";
  const secretAccessKey =
    env["OBJECT_STORAGE_SECRET_ACCESS_KEY"] ?? env["MINIO_ROOT_PASSWORD"] ?? "";
  if (!secret) {
    throw new Error(
      "OBJECT_STORAGE_SECRET env var is required — refusing to start",
    );
  }
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "Object storage credentials missing — set OBJECT_STORAGE_ACCESS_KEY_ID + OBJECT_STORAGE_SECRET_ACCESS_KEY (or MINIO_ROOT_USER + MINIO_ROOT_PASSWORD).",
    );
  }
  const portRaw = env["OBJECT_STORAGE_PROXY_PORT"] ?? String(DEFAULT_PROXY_PORT);
  const portParsed = Number.parseInt(portRaw, 10);
  return {
    port: Number.isFinite(portParsed) ? portParsed : DEFAULT_PROXY_PORT,
    secret,
    minioEndpoint: env["OBJECT_STORAGE_ENDPOINT"] ?? DEFAULT_MINIO_ENDPOINT,
    region: env["OBJECT_STORAGE_REGION"] ?? "us-east-1",
    accessKeyId,
    secretAccessKey,
    bucket: env["OBJECT_STORAGE_BUCKET"] ?? "crontech-objects",
  };
}

// ── Auth ─────────────────────────────────────────────────────────────

export function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

export function isAuthorised(req: Request, secret: string): boolean {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  return token.length > 0 && timingSafeEqual(token, secret);
}

// ── In-memory bucket directory ──────────────────────────────────────
//
// MinIO is the source of truth. The proxy keeps a thin in-memory mirror so
// `GET /buckets` and `POST /buckets/:name` feel instantaneous and the admin
// layer can list created buckets without round-tripping a CreateBucket API
// every time. The v1 multi-region work will replace this with a Turso table
// shared across regions.

interface BucketRecord {
  name: string;
  createdAt: string;
}

export class BucketDirectory {
  private readonly buckets: Map<string, BucketRecord> = new Map();

  list(): BucketRecord[] {
    return Array.from(this.buckets.values()).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    );
  }

  has(name: string): boolean {
    return this.buckets.has(name);
  }

  create(name: string): BucketRecord {
    if (this.buckets.has(name)) {
      const existing = this.buckets.get(name);
      if (existing) return existing;
    }
    const record: BucketRecord = {
      name,
      createdAt: new Date().toISOString(),
    };
    this.buckets.set(name, record);
    return record;
  }
}

// ── Router ──────────────────────────────────────────────────────────

export interface RouterDeps {
  config: ProxyConfig;
  buckets: BucketDirectory;
  client: ObjectStorageClient;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleRequest(
  req: Request,
  deps: RouterDeps,
): Promise<Response> {
  const url = new URL(req.url);
  const { pathname } = url;
  const method = req.method;

  if (pathname === "/health" && method === "GET") {
    return json({ ok: true, pid: process.pid, bucket: deps.config.bucket });
  }

  if (!isAuthorised(req, deps.config.secret)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  // GET /buckets
  if (pathname === "/buckets" && method === "GET") {
    return json({ ok: true, buckets: deps.buckets.list() });
  }

  // POST /buckets/:name
  const bucketCreateMatch = /^\/buckets\/([^/]+)$/.exec(pathname);
  if (bucketCreateMatch && method === "POST") {
    const name = decodeURIComponent(bucketCreateMatch[1] ?? "");
    if (!isValidBucketName(name)) {
      return json({ ok: false, error: "invalid bucket name" }, 400);
    }
    const record = deps.buckets.create(name);
    return json({ ok: true, bucket: record }, 201);
  }

  // GET /objects?prefix=foo
  if (pathname === "/objects" && method === "GET") {
    const prefix = url.searchParams.get("prefix") ?? "";
    try {
      const result = await deps.client.listObjects({ prefix });
      return json({ ok: true, ...result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "list failed";
      return json({ ok: false, error: msg }, 502);
    }
  }

  // /objects/:key — supports GET / PUT / DELETE
  const objectMatch = /^\/objects\/(.+)$/.exec(pathname);
  if (objectMatch) {
    const rawKey = decodeURIComponent(objectMatch[1] ?? "");
    if (method === "GET") {
      try {
        const obj = await deps.client.getObject({ key: rawKey });
        return new Response(new Blob([obj.body as BlobPart]), {
          status: 200,
          headers: {
            "Content-Type": obj.contentType ?? "application/octet-stream",
            ...(obj.contentLength !== null
              ? { "Content-Length": String(obj.contentLength) }
              : {}),
            ...(obj.etag ? { ETag: obj.etag } : {}),
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "get failed";
        return json({ ok: false, error: msg }, 502);
      }
    }
    if (method === "PUT") {
      const contentType =
        req.headers.get("content-type") ?? "application/octet-stream";
      const buf = await req.arrayBuffer();
      try {
        const result = await deps.client.putObject({
          key: rawKey,
          body: new Uint8Array(buf),
          contentType,
        });
        return json({ ok: true, ...result }, 201);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "put failed";
        return json({ ok: false, error: msg }, 502);
      }
    }
    if (method === "DELETE") {
      try {
        const result = await deps.client.deleteObject({ key: rawKey });
        return json({ ok: true, ...result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "delete failed";
        return json({ ok: false, error: msg }, 502);
      }
    }
  }

  // POST /presign/get | /presign/put
  if (pathname === "/presign/get" && method === "POST") {
    const body = await readJsonBody(req);
    if (!body || typeof body.key !== "string") {
      return json({ ok: false, error: "key is required" }, 400);
    }
    const expiresIn =
      typeof body.expiresIn === "number" ? body.expiresIn : 900;
    try {
      const result = deps.client.presignGet({ key: body.key, expiresIn });
      return json({ ok: true, ...result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "presign failed";
      return json({ ok: false, error: msg }, 400);
    }
  }
  if (pathname === "/presign/put" && method === "POST") {
    const body = await readJsonBody(req);
    if (!body || typeof body.key !== "string") {
      return json({ ok: false, error: "key is required" }, 400);
    }
    const expiresIn =
      typeof body.expiresIn === "number" ? body.expiresIn : 900;
    try {
      const presignInput: {
        key: string;
        expiresIn: number;
        contentType?: string;
      } = { key: body.key, expiresIn };
      if (typeof body.contentType === "string") {
        presignInput.contentType = body.contentType;
      }
      const result = deps.client.presignPut(presignInput);
      return json({ ok: true, ...result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "presign failed";
      return json({ ok: false, error: msg }, 400);
    }
  }

  return json({ ok: false, error: "not found" }, 404);
}

interface PresignBody {
  key?: unknown;
  expiresIn?: unknown;
  contentType?: unknown;
}

async function readJsonBody(req: Request): Promise<PresignBody | null> {
  try {
    const raw = (await req.json()) as PresignBody;
    return raw;
  } catch {
    return null;
  }
}

// ── Bootstrap helper for tests ──────────────────────────────────────

export function buildClientFromConfig(
  config: ProxyConfig,
  fetchImpl?: typeof fetch,
): ObjectStorageClient {
  const init: ObjectStorageClientOptions = {
    endpoint: config.minioEndpoint,
    region: config.region,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    bucket: config.bucket,
  };
  if (fetchImpl) init.fetch = fetchImpl;
  return new ObjectStorageClient(init);
}

// ── Server bootstrap ────────────────────────────────────────────────

function startServer(): void {
  const config = loadConfig();
  const buckets = new BucketDirectory();
  buckets.create(config.bucket); // default bucket always present
  const client = buildClientFromConfig(config);

  Bun.serve({
    port: config.port,
    hostname: PROXY_HOST,
    async fetch(req) {
      return handleRequest(req, { config, buckets, client });
    },
  });
  console.log(
    `[object-storage] proxy listening on http://${PROXY_HOST}:${config.port}`,
  );
  console.log(
    `[object-storage] backend MinIO endpoint: ${config.minioEndpoint}`,
  );
  console.log(`[object-storage] default bucket: ${config.bucket}`);
}

// Only auto-start when executed directly (not when imported by tests).
if (import.meta.main) {
  startServer();
}
