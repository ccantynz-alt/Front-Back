// ── Object Storage — HTTP server ──────────────────────────────────────
// S3-compatible HTTP API on top of a StorageDriver. The server is
// unaware of which driver (filesystem in tests, MinIO in production) is
// in play — every operation flows through the StorageDriver contract.
//
// Routes:
//   PUT    /buckets/:bucket/:key                      — single-part upload
//   GET    /buckets/:bucket/:key                      — download
//   HEAD   /buckets/:bucket/:key                      — metadata
//   DELETE /buckets/:bucket/:key                      — delete
//   POST   /buckets/:bucket/:key?uploads              — initiate multipart
//   PUT    /buckets/:bucket/:key?partNumber=N&uploadId=U  — upload part
//   POST   /buckets/:bucket/:key?uploadId=U           — complete multipart
//   DELETE /buckets/:bucket/:key?uploadId=U           — abort multipart
//   PUT    /buckets/:bucket/policy                    — set bucket policy
//   GET    /buckets/:bucket/sign?...                  — mint signed URL
//   GET    /health                                    — healthcheck
//
// Object keys may contain slashes — the catch-all `:key{.+}` matches
// "path/to/file.txt" as a single key. URI-decode every segment.

import { type Context, Hono } from "hono";
import { z } from "zod";
import {
  type ApiKeyVerifier,
  AuthError,
  type AuthIdentity,
  extractBearerKey,
} from "./auth";
import { completeMultipartBodySchema } from "./multipart";
import {
  authorize,
  type BucketPolicyStore,
  type BucketVisibility,
} from "./policy";
import { sign as signUrl, toQueryString, verify as verifySignature } from "./signed-url";
import type { StorageDriver } from "./drivers/types";

export interface ServerOptions {
  driver: StorageDriver;
  policies: BucketPolicyStore;
  verifier: ApiKeyVerifier;
  /** HMAC secret for signed URLs. Must be set if signed URLs are used. */
  signingSecret: string;
  /** Hard limit on body bytes for a single PUT — defaults to 5 GiB. */
  maxObjectBytes?: number;
}

const visibilitySchema = z.enum(["public-read", "private", "authenticated"]);

const policyBodySchema = z.object({
  visibility: visibilitySchema,
});

const signQuerySchema = z.object({
  key: z.string().min(1),
  method: z.enum(["GET", "PUT", "DELETE"]),
  /** Seconds until expiry, capped at 7 days. */
  ttl: z.coerce.number().int().positive().max(60 * 60 * 24 * 7),
});

export function createServer(opts: ServerOptions): Hono {
  const app = new Hono();
  const maxBytes = opts.maxObjectBytes ?? 5 * 1024 * 1024 * 1024;

  // ── Health ────────────────────────────────────────────────────────
  app.get("/health", (c) => c.json({ status: "ok" }));

  // ── Auth helper ──────────────────────────────────────────────────
  // Resolves an identity from a bearer token. Returns `null` for
  // anonymous (unauthenticated) requests.
  const resolveIdentity = async (
    headerKey: string | null,
  ): Promise<AuthIdentity | null> => {
    if (headerKey === null) return null;
    return await opts.verifier(headerKey);
  };

  // ── Authorize helper ────────────────────────────────────────────
  // Decides whether a request may proceed against a bucket+key for a
  // given verb. Honors signed URLs when the `signed=` query param is
  // present (and overrides bearer-token auth in that case).
  const authorizeRequest = async (
    c: Context,
    bucket: string,
    key: string,
    verb: "read" | "write",
  ): Promise<{ ok: true } | { ok: false; status: number; body: string }> => {
    const search = new URL(c.req.url).searchParams;
    if (search.has("signed")) {
      const expectedMethod =
        verb === "read" ? "GET" : c.req.method === "DELETE" ? "DELETE" : "PUT";
      const result = verifySignature(
        search,
        { method: expectedMethod, bucket, key },
        opts.signingSecret,
      );
      if (!result.ok) {
        return { ok: false, status: 403, body: `signed-url ${result.reason ?? "invalid"}` };
      }
      return { ok: true };
    }
    const identity = await resolveIdentity(extractBearerKey(c));
    const policy = await opts.policies.get(bucket);
    if (!authorize(policy, identity, verb, bucket)) {
      return { ok: false, status: identity === null ? 401 : 403, body: "access denied" };
    }
    return { ok: true };
  };

  // ── Set bucket policy ───────────────────────────────────────────
  app.put("/buckets/:bucket/policy", async (c) => {
    const bucket = decodeURIComponent(c.req.param("bucket"));
    // Setting a policy requires write access to the bucket.
    const identity = await resolveIdentity(extractBearerKey(c));
    if (identity === null) return c.text("authentication required", 401);
    if (!identity.writableBuckets.has(bucket)) {
      return c.text("access denied", 403);
    }
    const json = await c.req.json().catch(() => null);
    const parsed = policyBodySchema.safeParse(json);
    if (!parsed.success) {
      return c.text(`invalid policy body: ${parsed.error.message}`, 400);
    }
    const visibility: BucketVisibility = parsed.data.visibility;
    await opts.driver.ensureBucket(bucket);
    await opts.policies.set({ bucket, visibility });
    return c.json({ bucket, visibility });
  });

  // ── Mint signed URL ─────────────────────────────────────────────
  app.get("/buckets/:bucket/sign", async (c) => {
    const bucket = decodeURIComponent(c.req.param("bucket"));
    const identity = await resolveIdentity(extractBearerKey(c));
    if (identity === null) return c.text("authentication required", 401);
    const queryParsed = signQuerySchema.safeParse({
      key: c.req.query("key"),
      method: c.req.query("method"),
      ttl: c.req.query("ttl"),
    });
    if (!queryParsed.success) {
      return c.text(`invalid sign query: ${queryParsed.error.message}`, 400);
    }
    const { key, method, ttl } = queryParsed.data;
    // Issuer must have write access to grant write/delete signed URLs.
    if ((method === "PUT" || method === "DELETE") && !identity.writableBuckets.has(bucket)) {
      return c.text("access denied", 403);
    }
    const expiresAt = Math.floor(Date.now() / 1000) + ttl;
    const signed = signUrl(
      { method, bucket, key, expiresAt, principal: identity.principal },
      opts.signingSecret,
    );
    return c.json({
      url: `/buckets/${encodeURIComponent(bucket)}/${encodeURI(key)}?${toQueryString(signed)}`,
      expiresAt,
    });
  });

  // ── HEAD object ─────────────────────────────────────────────────
  app.on("HEAD", "/buckets/:bucket/:key{.+}", async (c) => {
    const bucket = decodeURIComponent(c.req.param("bucket"));
    const key = decodeURIComponent(c.req.param("key"));
    const auth = await authorizeRequest(c, bucket, key, "read");
    if (!auth.ok) return c.text(auth.body, auth.status as 401 | 403);
    const meta = await opts.driver.headObject(bucket, key);
    if (meta === null) return c.text("not found", 404);
    return new Response(null, { status: 200, headers: metaToHeaders(meta) });
  });

  // ── GET object ──────────────────────────────────────────────────
  app.get("/buckets/:bucket/:key{.+}", async (c) => {
    const bucket = decodeURIComponent(c.req.param("bucket"));
    const key = decodeURIComponent(c.req.param("key"));
    const auth = await authorizeRequest(c, bucket, key, "read");
    if (!auth.ok) return c.text(auth.body, auth.status as 401 | 403);
    try {
      const result = await opts.driver.getObject(bucket, key);
      return new Response(result.body, {
        status: 200,
        headers: metaToHeaders(result.metadata),
      });
    } catch (err) {
      if (err instanceof Error && /not found/i.test(err.message)) {
        return c.text("not found", 404);
      }
      throw err;
    }
  });

  // ── POST endpoints (multipart init / complete) ──────────────────
  app.post("/buckets/:bucket/:key{.+}", async (c) => {
    const bucket = decodeURIComponent(c.req.param("bucket"));
    const key = decodeURIComponent(c.req.param("key"));
    const auth = await authorizeRequest(c, bucket, key, "write");
    if (!auth.ok) return c.text(auth.body, auth.status as 401 | 403);
    const url = new URL(c.req.url);
    if (url.searchParams.has("uploads")) {
      const contentType = c.req.header("content-type") ?? undefined;
      const init = await opts.driver.initMultipart(
        bucket,
        key,
        contentType !== undefined ? { contentType } : undefined,
      );
      return c.json({ uploadId: init.uploadId, bucket, key });
    }
    const uploadId = url.searchParams.get("uploadId");
    if (uploadId !== null) {
      const json = await c.req.json().catch(() => null);
      const parsed = completeMultipartBodySchema.safeParse(json);
      if (!parsed.success) {
        return c.text(`invalid complete body: ${parsed.error.message}`, 400);
      }
      try {
        const completed = await opts.driver.completeMultipart(
          bucket,
          key,
          uploadId,
          parsed.data.parts,
        );
        return c.json({
          bucket,
          key,
          etag: completed.metadata.etag,
          size: completed.metadata.size,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "internal error";
        if (/etag mismatch|invalid_part/.test(msg)) return c.text(msg, 400);
        if (/unknown uploadId|invalid_upload/.test(msg)) return c.text(msg, 404);
        throw err;
      }
    }
    return c.text("expected ?uploads or ?uploadId", 400);
  });

  // ── PUT endpoints (single-part + multipart part upload) ─────────
  app.put("/buckets/:bucket/:key{.+}", async (c) => {
    const bucket = decodeURIComponent(c.req.param("bucket"));
    const key = decodeURIComponent(c.req.param("key"));
    const auth = await authorizeRequest(c, bucket, key, "write");
    if (!auth.ok) return c.text(auth.body, auth.status as 401 | 403);

    const url = new URL(c.req.url);
    const uploadId = url.searchParams.get("uploadId");
    const partNumberRaw = url.searchParams.get("partNumber");
    const lengthHeader = c.req.header("content-length");
    const declaredLength = lengthHeader !== undefined ? Number.parseInt(lengthHeader, 10) : null;
    if (declaredLength !== null && Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      return c.text(`object exceeds max size (${maxBytes} bytes)`, 413);
    }

    const body = c.req.raw.body;
    if (body === null) {
      return c.text("empty body", 400);
    }
    const stream = body;

    if (uploadId !== null && partNumberRaw !== null) {
      const partNumber = Number.parseInt(partNumberRaw, 10);
      if (!Number.isInteger(partNumber) || partNumber <= 0) {
        return c.text("partNumber must be a positive integer", 400);
      }
      try {
        const part = await opts.driver.uploadPart(bucket, key, uploadId, partNumber, stream);
        return c.json({ partNumber: part.partNumber, etag: part.etag, size: part.size });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "internal error";
        if (/unknown uploadId|invalid_upload/.test(msg)) return c.text(msg, 404);
        throw err;
      }
    }

    const contentType = c.req.header("content-type") ?? undefined;
    const meta = await opts.driver.putObject(
      bucket,
      key,
      stream,
      contentType !== undefined ? { contentType } : undefined,
    );
    return new Response(JSON.stringify({ bucket, key, etag: meta.etag, size: meta.size }), {
      status: 201,
      headers: { ...metaToHeaders(meta), "content-type": "application/json" },
    });
  });

  // ── DELETE endpoints ────────────────────────────────────────────
  app.delete("/buckets/:bucket/:key{.+}", async (c) => {
    const bucket = decodeURIComponent(c.req.param("bucket"));
    const key = decodeURIComponent(c.req.param("key"));
    const auth = await authorizeRequest(c, bucket, key, "write");
    if (!auth.ok) return c.text(auth.body, auth.status as 401 | 403);
    const url = new URL(c.req.url);
    const uploadId = url.searchParams.get("uploadId");
    if (uploadId !== null) {
      await opts.driver.abortMultipart(bucket, key, uploadId);
      return new Response(null, { status: 204 });
    }
    await opts.driver.deleteObject(bucket, key);
    return new Response(null, { status: 204 });
  });

  // ── Centralised error handler ───────────────────────────────────
  app.onError((err, c) => {
    if (err instanceof AuthError) {
      return c.text(err.message, err.statusCode as 401 | 403);
    }
    const msg = err instanceof Error ? err.message : "internal error";
    return c.text(`object-storage error: ${msg}`, 500);
  });

  return app;
}

function metaToHeaders(meta: { etag: string; size: number; contentType: string | undefined; lastModified: Date }): Record<string, string> {
  const headers: Record<string, string> = {
    etag: `"${meta.etag}"`,
    "x-amz-meta-sha256-etag": meta.etag,
    "content-length": String(meta.size),
    "last-modified": meta.lastModified.toUTCString(),
  };
  if (meta.contentType !== undefined) {
    headers["content-type"] = meta.contentType;
  }
  return headers;
}
