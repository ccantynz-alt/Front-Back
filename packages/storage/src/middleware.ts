/**
 * Hono middleware for multipart file uploads to Cloudflare R2.
 *
 * Validates file size (configurable via `MAX_UPLOAD_SIZE_MB` env var,
 * default 50 MB) and content type against an allowlist before streaming
 * the file body to R2.
 */

import type { Context, MiddlewareHandler } from "hono";
import { uploadFile } from "./client";

// ── Configuration ─────────────────────────────────────────────────────

const MAX_UPLOAD_SIZE_MB = Number(process.env.MAX_UPLOAD_SIZE_MB || "50");
const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

/** MIME types accepted by the upload middleware. */
export const DEFAULT_ALLOWED_TYPES: ReadonlySet<string> = new Set([
  // Images
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/avif",
  // Documents
  "application/pdf",
  "application/json",
  "text/plain",
  "text/html",
  "text/css",
  "text/csv",
  // Archives
  "application/zip",
  "application/gzip",
  // Video
  "video/mp4",
  "video/webm",
  // Audio
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
]);

export interface UploadMiddlewareOptions {
  /** Override allowed content types. */
  allowedTypes?: ReadonlySet<string>;
  /** Override max upload size in bytes. */
  maxSizeBytes?: number;
}

export interface UploadedFile {
  key: string;
  url: string;
  size: number;
  contentType: string;
}

/**
 * Return the configured max upload size in bytes (exported for tests).
 */
export function getMaxUploadSizeBytes(override?: number): number {
  return override ?? MAX_UPLOAD_SIZE_BYTES;
}

/**
 * Validate file size against configured maximum.
 *
 * @returns error message if invalid, null if valid.
 */
export function validateFileSize(sizeBytes: number, maxBytes?: number): string | null {
  const limit = getMaxUploadSizeBytes(maxBytes);
  if (sizeBytes > limit) {
    const limitMB = Math.round(limit / (1024 * 1024));
    return `File size ${Math.round(sizeBytes / (1024 * 1024))}MB exceeds maximum ${limitMB}MB`;
  }
  return null;
}

/**
 * Validate content type against the allowlist.
 *
 * @returns error message if invalid, null if valid.
 */
export function validateContentType(
  contentType: string,
  allowedTypes: ReadonlySet<string> = DEFAULT_ALLOWED_TYPES,
): string | null {
  if (!allowedTypes.has(contentType)) {
    return `Content type "${contentType}" is not allowed. Allowed types: ${[...allowedTypes].join(", ")}`;
  }
  return null;
}

/**
 * Create Hono middleware that handles multipart/form-data uploads.
 *
 * Expects a `tenantId` to be present in the request context (set by auth
 * middleware). Falls back to "default" tenant if not set.
 *
 * The middleware reads the `file` field from the multipart body, validates
 * size and content type, streams to R2, and sets the result on `c.set()`.
 */
export function uploadMiddleware(options: UploadMiddlewareOptions = {}): MiddlewareHandler {
  const allowedTypes = options.allowedTypes ?? DEFAULT_ALLOWED_TYPES;
  const maxSizeBytes = options.maxSizeBytes ?? MAX_UPLOAD_SIZE_BYTES;

  return async (c: Context, next): Promise<Response | undefined> => {
    const contentTypeHeader = c.req.header("content-type") ?? "";
    if (!contentTypeHeader.includes("multipart/form-data")) {
      return c.json({ error: "Expected multipart/form-data" }, 400);
    }

    const body = await c.req.parseBody();
    const file = body.file;

    if (!file || !(file instanceof File)) {
      return c.json({ error: "Missing 'file' field in multipart body" }, 400);
    }

    // Validate content type
    const typeError = validateContentType(file.type, allowedTypes);
    if (typeError) {
      return c.json({ error: typeError }, 415);
    }

    // Validate file size
    const sizeError = validateFileSize(file.size, maxSizeBytes);
    if (sizeError) {
      return c.json({ error: sizeError }, 413);
    }

    // Determine tenant
    const tenantId =
      (c.get("tenantId") as string | undefined) ??
      (c.get("userId") as string | undefined) ??
      "default";

    // Generate a unique key
    const ext = file.name.split(".").pop() ?? "bin";
    const key = `uploads/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    // Stream to R2
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadFile(tenantId, key, buffer, file.type);

    if (!result) {
      return c.json({ error: "Storage not configured. File upload unavailable." }, 503);
    }

    const uploaded: UploadedFile = {
      key: result.key,
      url: result.key, // presigned download URL should be generated separately
      size: file.size,
      contentType: file.type,
    };

    c.set("uploadedFile", uploaded);
    await next();
    return undefined;
  };
}
