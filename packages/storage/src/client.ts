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

function isConfigured(): boolean {
  return Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);
}

// ── Lazy S3 Client ────────────────────────────────────────────────────

let _client: S3Client | null = null;

export function getS3Client(): S3Client | null {
  if (_client) return _client;
  if (!isConfigured()) {
    console.warn(
      "[storage] R2 env vars missing (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY). " +
        "File storage disabled — returning null from all operations.",
    );
    return null;
  }
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

export function getBucketName(): string {
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
