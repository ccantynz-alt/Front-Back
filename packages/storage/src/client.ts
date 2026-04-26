/**
 * Cloudflare R2 file storage client (S3-compatible).
 *
 * Wraps @aws-sdk/client-s3 configured for Cloudflare R2. Every key is
 * automatically scoped to a tenant via `{tenantId}/` prefix to enforce
 * data isolation at the storage layer.
 *
 * If R2 env vars are missing the module logs a warning and returns
 * null from all operations (graceful degradation for local dev).
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
// ── Configuration ─────────────────────────────────────────────────────

const R2_ACCOUNT_ID = process.env["R2_ACCOUNT_ID"];
const R2_ACCESS_KEY_ID = process.env["R2_ACCESS_KEY_ID"];
const R2_SECRET_ACCESS_KEY = process.env["R2_SECRET_ACCESS_KEY"];
const R2_BUCKET_NAME = process.env["R2_BUCKET_NAME"] ?? "crontech-assets";

// BLK-018 — Self-hosted object storage backend.
// When `OBJECT_STORAGE_ENDPOINT` is set the storage layer talks to our own
// MinIO cluster (services/object-storage/) instead of Cloudflare R2. The
// S3 protocol is identical so the same client + presign code paths run on
// both backends — only the endpoint and bucket name change.
const OBJECT_STORAGE_ENDPOINT = process.env["OBJECT_STORAGE_ENDPOINT"];
const OBJECT_STORAGE_REGION = process.env["OBJECT_STORAGE_REGION"] ?? "us-east-1";
const OBJECT_STORAGE_ACCESS_KEY_ID =
  process.env["OBJECT_STORAGE_ACCESS_KEY_ID"];
const OBJECT_STORAGE_SECRET_ACCESS_KEY =
  process.env["OBJECT_STORAGE_SECRET_ACCESS_KEY"];
const OBJECT_STORAGE_BUCKET = process.env["OBJECT_STORAGE_BUCKET"];

function isConfigured(): boolean {
  if (
    OBJECT_STORAGE_ENDPOINT &&
    OBJECT_STORAGE_ACCESS_KEY_ID &&
    OBJECT_STORAGE_SECRET_ACCESS_KEY
  ) {
    return true;
  }
  return Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);
}

/** Backend in active use. Exported for diagnostics + tests. */
export type StorageBackend = "self-hosted" | "r2" | "none";

export function getStorageBackend(): StorageBackend {
  if (
    OBJECT_STORAGE_ENDPOINT &&
    OBJECT_STORAGE_ACCESS_KEY_ID &&
    OBJECT_STORAGE_SECRET_ACCESS_KEY
  ) {
    return "self-hosted";
  }
  if (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY) {
    return "r2";
  }
  return "none";
}

// ── Lazy S3 Client ────────────────────────────────────────────────────

let _client: S3Client | null = null;

export function getS3Client(): S3Client | null {
  if (_client) return _client;
  const backend = getStorageBackend();
  if (backend === "none") {
    console.warn(
      "[storage] No backend configured. Set either OBJECT_STORAGE_ENDPOINT (BLK-018 self-hosted) " +
        "or R2_ACCOUNT_ID + R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY (legacy R2). " +
        "File storage disabled — returning null from all operations.",
    );
    return null;
  }
  if (backend === "self-hosted") {
    // The `getStorageBackend()` check above guarantees these env vars
    // are defined — the type narrowing across module-scope constants
    // is too coarse for TS, so we re-assert here.
    if (
      !OBJECT_STORAGE_ENDPOINT ||
      !OBJECT_STORAGE_ACCESS_KEY_ID ||
      !OBJECT_STORAGE_SECRET_ACCESS_KEY
    ) {
      return null;
    }
    _client = new S3Client({
      region: OBJECT_STORAGE_REGION,
      endpoint: OBJECT_STORAGE_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: OBJECT_STORAGE_ACCESS_KEY_ID,
        secretAccessKey: OBJECT_STORAGE_SECRET_ACCESS_KEY,
      },
    });
    return _client;
  }
  // backend === "r2"
  if (!isConfigured()) return null;
  _client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID!,
      secretAccessKey: R2_SECRET_ACCESS_KEY!,
    },
  });
  return _client;
}

/**
 * Reset the cached S3 client. Used by tests that mutate `process.env` and
 * need the next `getS3Client()` call to re-evaluate the backend selection.
 */
export function resetStorageClientForTesting(): void {
  _client = null;
}

/**
 * BLK-018 — Unified factory that returns a configured S3 client and the
 * bucket name to use. Returns null when no backend is configured.
 *
 * Why this exists: callers used to only have `getS3Client()` + `getBucketName()`.
 * This composes them so the service-selection logic lives in one place and
 * future backend additions (e.g. multi-region replicas in BLK-018 v1) only
 * touch this one factory.
 */
export interface StorageClientHandle {
  client: S3Client;
  bucket: string;
  backend: StorageBackend;
}

export function getStorageClient(): StorageClientHandle | null {
  const backend = getStorageBackend();
  if (backend === "none") return null;
  const client = getS3Client();
  if (!client) return null;
  return { client, bucket: getBucketName(), backend };
}

export function getBucketName(): string {
  // Prefer the self-hosted bucket name when the BLK-018 backend is in use,
  // otherwise fall back to the R2 bucket name. Defaults stay backwards-compatible.
  if (getStorageBackend() === "self-hosted") {
    return OBJECT_STORAGE_BUCKET ?? "crontech-objects";
  }
  return R2_BUCKET_NAME;
}

// ── Tenant-scoped key helper ──────────────────────────────────────────

export function scopedKey(tenantId: string, key: string): string {
  // Strip leading slash and prevent path-traversal attempts
  const sanitised = key.replace(/^\/+/, "").replace(/\.\.\//g, "");
  return `${tenantId}/${sanitised}`;
}

// ── File operations ───────────────────────────────────────────────────

export interface UploadResult {
  key: string;
  bucket: string;
  etag: string | undefined;
}

export async function uploadFile(
  tenantId: string,
  key: string,
  body: Buffer | Uint8Array | ReadableStream | string,
  contentType: string,
): Promise<UploadResult | null> {
  const client = getS3Client();
  if (!client) return null;

  const fullKey = scopedKey(tenantId, key);
  const result = await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: fullKey,
      Body: body,
      ContentType: contentType,
    }),
  );

  return {
    key: fullKey,
    bucket: R2_BUCKET_NAME,
    etag: result.ETag,
  };
}

export interface DownloadResult {
  body: ReadableStream | null;
  contentType: string | undefined;
  contentLength: number | undefined;
}

export async function downloadFile(
  tenantId: string,
  key: string,
): Promise<DownloadResult | null> {
  const client = getS3Client();
  if (!client) return null;

  const fullKey = scopedKey(tenantId, key);
  const result = await client.send(
    new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: fullKey,
    }),
  );

  return {
    body: result.Body?.transformToWebStream() ?? null,
    contentType: result.ContentType,
    contentLength: result.ContentLength,
  };
}

export async function deleteFile(
  tenantId: string,
  key: string,
): Promise<boolean> {
  const client = getS3Client();
  if (!client) return false;

  const fullKey = scopedKey(tenantId, key);
  await client.send(
    new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: fullKey,
    }),
  );
  return true;
}

export async function fileExists(
  tenantId: string,
  key: string,
): Promise<boolean> {
  const client = getS3Client();
  if (!client) return false;

  const fullKey = scopedKey(tenantId, key);
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: fullKey,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export interface FileMetadata {
  contentType: string | undefined;
  contentLength: number | undefined;
  lastModified: Date | undefined;
  etag: string | undefined;
}

export async function getFileMetadata(
  tenantId: string,
  key: string,
): Promise<FileMetadata | null> {
  const client = getS3Client();
  if (!client) return null;

  const fullKey = scopedKey(tenantId, key);
  try {
    const result = await client.send(
      new HeadObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: fullKey,
      }),
    );
    return {
      contentType: result.ContentType,
      contentLength: result.ContentLength,
      lastModified: result.LastModified,
      etag: result.ETag,
    };
  } catch {
    return null;
  }
}
