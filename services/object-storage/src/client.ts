/**
 * Crontech Self-Hosted Object Storage — typed S3 client (BLK-018 v0).
 *
 * Pure typed wrapper around the S3 protocol implementing only what the v0
 * proxy + admin layer needs:
 *
 *   - putObject     : single-shot upload (Buffer / Uint8Array / string)
 *   - getObject     : fetch raw bytes + content-type metadata
 *   - deleteObject  : remove a key
 *   - listObjects   : list keys under an optional prefix
 *   - presignGet    : query-string-signed GET URL with TTL
 *   - presignPut    : query-string-signed PUT URL with TTL
 *
 * Signing follows the AWS Signature v4 query-string protocol so the same
 * implementation works against any S3-compatible backend (MinIO,
 * Backblaze B2, Wasabi, Garage, SeaweedFS). Force-path-style addressing
 * is used unconditionally — virtual-hosted-style requires DNS we do not
 * own at v0.
 *
 * Why hand-rolled instead of @aws-sdk/client-s3:
 *
 *   1. The SDK adds ~500KB to the worker bundle for six methods.
 *   2. The SDK pulls in a credentials provider chain we do not need.
 *   3. Hand-rolling is cheaper than tree-shaking the SDK to fit our budget.
 *   4. Keeps the client provider-agnostic — packages/storage already wraps
 *      the SDK for the R2 path; this wrapper is the self-hosted twin.
 */

import { createHash, createHmac } from "node:crypto";

// ── Types ────────────────────────────────────────────────────────────

export interface ObjectStorageClientOptions {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /**
   * Optional fetch override. Defaults to the global `fetch`. Tests inject a
   * mock here to keep network out of the assertion path.
   */
  fetch?: typeof fetch;
}

export interface PutObjectInput {
  key: string;
  body: Uint8Array | Buffer | string;
  contentType: string;
}

export interface PutObjectResult {
  key: string;
  bucket: string;
  etag: string | null;
}

export interface GetObjectInput {
  key: string;
}

export interface GetObjectResult {
  body: Uint8Array;
  contentType: string | null;
  contentLength: number | null;
  etag: string | null;
}

export interface DeleteObjectInput {
  key: string;
}

export interface DeleteObjectResult {
  key: string;
  deleted: true;
}

export interface ListObjectsInput {
  prefix?: string;
  maxKeys?: number;
}

export interface ListedObject {
  key: string;
  size: number;
  etag: string | null;
  lastModified: string | null;
}

export interface ListObjectsResult {
  bucket: string;
  prefix: string;
  objects: ListedObject[];
  truncated: boolean;
}

export interface PresignInput {
  key: string;
  /** TTL in seconds. Hard-clamped to [60, 3600]. */
  expiresIn: number;
  /** Optional Content-Type binding for PUT presigns. */
  contentType?: string;
}

export interface PresignResult {
  url: string;
  key: string;
  expiresAt: string;
}

// ── Validation helpers (pure, exported for tests) ────────────────────

const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 3600;

export function clampTtl(seconds: number): number {
  if (!Number.isFinite(seconds)) return MIN_TTL_SECONDS;
  if (seconds < MIN_TTL_SECONDS) return MIN_TTL_SECONDS;
  if (seconds > MAX_TTL_SECONDS) return MAX_TTL_SECONDS;
  return Math.floor(seconds);
}

export function sanitiseKey(key: string): string {
  if (typeof key !== "string") throw new TypeError("key must be a string");
  const trimmed = key.replace(/^\/+/, "").replace(/\.\.\//g, "");
  if (trimmed.length === 0) throw new Error("key must not be empty");
  return trimmed;
}

export function isValidBucketName(name: string): boolean {
  // S3 + MinIO bucket-name rules: 3-63 chars, lowercase letters / digits /
  // hyphens, must start + end alphanumeric, no consecutive hyphens, no IP-
  // shaped names. Simple and strict — we own the namespace.
  if (typeof name !== "string") return false;
  if (name.length < 3 || name.length > 63) return false;
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name)) return false;
  if (name.includes("--")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(name)) return false;
  return true;
}

// ── AWS Sigv4 helpers ────────────────────────────────────────────────

function hexHash(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function uriEncode(value: string, encodeSlash: boolean): string {
  let out = "";
  for (const ch of value) {
    if (/[A-Za-z0-9\-._~]/.test(ch)) {
      out += ch;
    } else if (ch === "/") {
      out += encodeSlash ? "%2F" : "/";
    } else {
      const bytes = new TextEncoder().encode(ch);
      for (const b of bytes) {
        out += `%${b.toString(16).toUpperCase().padStart(2, "0")}`;
      }
    }
  }
  return out;
}

interface SigningInputs {
  method: "GET" | "PUT" | "DELETE" | "HEAD" | "POST";
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  key: string;
  /** Map of additional canonical query-string params (already encoded keys/values are fine). */
  query?: Record<string, string>;
  /** Signed headers map (host always added). */
  signedHeaders?: Record<string, string>;
  /** Hex-encoded SHA-256 of the body, or `UNSIGNED-PAYLOAD`. */
  payloadHash: string;
  /** Date in RFC 3339 basic-format, e.g. 20260426T123000Z. */
  amzDate: string;
}

interface SignedRequest {
  url: string;
  headers: Record<string, string>;
}

function deriveSigningKey(
  secretAccessKey: string,
  shortDate: string,
  region: string,
): Buffer {
  const kDate = hmac(`AWS4${secretAccessKey}`, shortDate);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

function signCanonicalRequest(inputs: SigningInputs): SignedRequest {
  const url = new URL(inputs.endpoint);
  const host = url.host;
  const shortDate = inputs.amzDate.slice(0, 8);
  const credentialScope = `${shortDate}/${inputs.region}/s3/aws4_request`;
  const canonicalUri = `/${uriEncode(inputs.bucket, false)}/${uriEncode(inputs.key, false)}`;

  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": inputs.payloadHash,
    "x-amz-date": inputs.amzDate,
    ...(inputs.signedHeaders ?? {}),
  };
  const signedHeaderKeys = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort();
  const canonicalHeaders =
    signedHeaderKeys
      .map((k) => `${k}:${(headers[k] ?? "").trim().replace(/\s+/g, " ")}`)
      .join("\n") + "\n";
  const signedHeaderList = signedHeaderKeys.join(";");

  const queryEntries = Object.entries(inputs.query ?? {});
  const canonicalQuery = queryEntries
    .map<[string, string]>(([k, v]) => [uriEncode(k, true), uriEncode(v, true)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const canonicalRequest = [
    inputs.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaderList,
    inputs.payloadHash,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    inputs.amzDate,
    credentialScope,
    hexHash(canonicalRequest),
  ].join("\n");

  const signingKey = deriveSigningKey(
    inputs.secretAccessKey,
    shortDate,
    inputs.region,
  );
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign)
    .digest("hex");

  const authHeader =
    `AWS4-HMAC-SHA256 Credential=${inputs.accessKeyId}/${credentialScope},` +
    ` SignedHeaders=${signedHeaderList}, Signature=${signature}`;

  const search = canonicalQuery.length > 0 ? `?${canonicalQuery}` : "";
  return {
    url: `${url.origin}${canonicalUri}${search}`,
    headers: { ...headers, Authorization: authHeader },
  };
}

interface PresignInputs {
  method: "GET" | "PUT";
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  key: string;
  expiresIn: number;
  amzDate: string;
  contentType?: string;
}

function buildPresignedUrl(inputs: PresignInputs): string {
  const url = new URL(inputs.endpoint);
  const host = url.host;
  const shortDate = inputs.amzDate.slice(0, 8);
  const credentialScope = `${shortDate}/${inputs.region}/s3/aws4_request`;
  const canonicalUri = `/${uriEncode(inputs.bucket, false)}/${uriEncode(inputs.key, false)}`;

  const signedHeaders: Record<string, string> = { host };
  if (inputs.method === "PUT" && inputs.contentType) {
    signedHeaders["content-type"] = inputs.contentType;
  }
  const signedHeaderKeys = Object.keys(signedHeaders).sort();
  const canonicalHeaders =
    signedHeaderKeys.map((k) => `${k}:${signedHeaders[k]}`).join("\n") + "\n";
  const signedHeaderList = signedHeaderKeys.join(";");

  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${inputs.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": inputs.amzDate,
    "X-Amz-Expires": String(inputs.expiresIn),
    "X-Amz-SignedHeaders": signedHeaderList,
  };

  const canonicalQuery = Object.entries(query)
    .map<[string, string]>(([k, v]) => [uriEncode(k, true), uriEncode(v, true)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const canonicalRequest = [
    inputs.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaderList,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    inputs.amzDate,
    credentialScope,
    hexHash(canonicalRequest),
  ].join("\n");

  const signingKey = deriveSigningKey(
    inputs.secretAccessKey,
    shortDate,
    inputs.region,
  );
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign)
    .digest("hex");

  return `${url.origin}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

// ── Date helper ──────────────────────────────────────────────────────

export function isoBasicDate(now: Date = new Date()): string {
  // 20260426T123000Z — RFC 3339 basic format used by Sigv4.
  const pad = (n: number): string => n.toString().padStart(2, "0");
  return (
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  );
}

// ── XML parsing helper for ListObjectsV2 ─────────────────────────────

export function parseListObjectsXml(xml: string): {
  objects: ListedObject[];
  truncated: boolean;
} {
  const objects: ListedObject[] = [];
  // We only need the small subset of ListBucketResult emitted by S3 / MinIO.
  // No external XML parser — the format is regular and trusted.
  const contentRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
  let match: RegExpExecArray | null;
  while ((match = contentRegex.exec(xml)) !== null) {
    const block = match[1] ?? "";
    const key = (block.match(/<Key>([^<]+)<\/Key>/)?.[1] ?? "").trim();
    if (!key) continue;
    const sizeStr = block.match(/<Size>([^<]+)<\/Size>/)?.[1] ?? "0";
    const size = Number.parseInt(sizeStr, 10);
    const etag = block.match(/<ETag>([^<]+)<\/ETag>/)?.[1] ?? null;
    const lastModified =
      block.match(/<LastModified>([^<]+)<\/LastModified>/)?.[1] ?? null;
    objects.push({
      key,
      size: Number.isFinite(size) ? size : 0,
      etag: etag ? etag.replace(/^"|"$/g, "") : null,
      lastModified,
    });
  }
  const truncatedMatch = xml.match(/<IsTruncated>([^<]+)<\/IsTruncated>/)?.[1];
  const truncated = (truncatedMatch ?? "").trim().toLowerCase() === "true";
  return { objects, truncated };
}

// ── Body normalisation ───────────────────────────────────────────────

function toBytes(body: Uint8Array | Buffer | string): Uint8Array {
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (Buffer.isBuffer(body)) return new Uint8Array(body);
  return body;
}

// ── Client class ─────────────────────────────────────────────────────

export class ObjectStorageClient {
  private readonly endpoint: string;
  private readonly region: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly bucket: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ObjectStorageClientOptions) {
    if (!options.endpoint) throw new Error("endpoint is required");
    if (!options.accessKeyId) throw new Error("accessKeyId is required");
    if (!options.secretAccessKey) {
      throw new Error("secretAccessKey is required");
    }
    if (!isValidBucketName(options.bucket)) {
      throw new Error(`invalid bucket name: ${options.bucket}`);
    }
    this.endpoint = options.endpoint.replace(/\/+$/, "");
    this.region = options.region;
    this.accessKeyId = options.accessKeyId;
    this.secretAccessKey = options.secretAccessKey;
    this.bucket = options.bucket;
    this.fetchImpl = options.fetch ?? fetch;
  }

  getBucket(): string {
    return this.bucket;
  }

  getEndpoint(): string {
    return this.endpoint;
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const key = sanitiseKey(input.key);
    const bytes = toBytes(input.body);
    const amzDate = isoBasicDate();
    const payloadHash = hexHash(bytes);

    const signed = signCanonicalRequest({
      method: "PUT",
      endpoint: this.endpoint,
      region: this.region,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      bucket: this.bucket,
      key,
      payloadHash,
      amzDate,
      signedHeaders: {
        "content-type": input.contentType,
        "content-length": String(bytes.byteLength),
      },
    });

    const res = await this.fetchImpl(signed.url, {
      method: "PUT",
      headers: signed.headers,
      // Wrap in a Blob — Uint8Array is not in the BodyInit overload set
      // for the global `fetch` typings (only the Bun-specific overload
      // accepts it). Blob is the portable representation.
      body: new Blob([bytes as BlobPart]),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`putObject ${key} failed: ${res.status} ${text}`);
    }
    return {
      key,
      bucket: this.bucket,
      etag: res.headers.get("etag"),
    };
  }

  async getObject(input: GetObjectInput): Promise<GetObjectResult> {
    const key = sanitiseKey(input.key);
    const amzDate = isoBasicDate();
    const signed = signCanonicalRequest({
      method: "GET",
      endpoint: this.endpoint,
      region: this.region,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      bucket: this.bucket,
      key,
      payloadHash: hexHash(""),
      amzDate,
    });

    const res = await this.fetchImpl(signed.url, {
      method: "GET",
      headers: signed.headers,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`getObject ${key} failed: ${res.status} ${text}`);
    }
    const buf = await res.arrayBuffer();
    const contentLengthHeader = res.headers.get("content-length");
    return {
      body: new Uint8Array(buf),
      contentType: res.headers.get("content-type"),
      contentLength: contentLengthHeader
        ? Number.parseInt(contentLengthHeader, 10)
        : null,
      etag: res.headers.get("etag"),
    };
  }

  async deleteObject(input: DeleteObjectInput): Promise<DeleteObjectResult> {
    const key = sanitiseKey(input.key);
    const amzDate = isoBasicDate();
    const signed = signCanonicalRequest({
      method: "DELETE",
      endpoint: this.endpoint,
      region: this.region,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      bucket: this.bucket,
      key,
      payloadHash: hexHash(""),
      amzDate,
    });

    const res = await this.fetchImpl(signed.url, {
      method: "DELETE",
      headers: signed.headers,
    });
    if (!res.ok && res.status !== 404) {
      const text = await res.text().catch(() => "");
      throw new Error(`deleteObject ${key} failed: ${res.status} ${text}`);
    }
    return { key, deleted: true };
  }

  async listObjects(
    input: ListObjectsInput = {},
  ): Promise<ListObjectsResult> {
    const prefix = input.prefix ?? "";
    const maxKeys = Math.min(Math.max(input.maxKeys ?? 1000, 1), 1000);
    const amzDate = isoBasicDate();
    const query: Record<string, string> = {
      "list-type": "2",
      "max-keys": String(maxKeys),
    };
    if (prefix.length > 0) query["prefix"] = prefix;

    // ListObjectsV2 hits the bucket root: /<bucket>/?list-type=2
    // Reuse the canonical signer with key='' to keep one code path.
    const url = new URL(this.endpoint);
    const host = url.host;
    const shortDate = amzDate.slice(0, 8);
    const credentialScope = `${shortDate}/${this.region}/s3/aws4_request`;
    const canonicalUri = `/${uriEncode(this.bucket, false)}/`;
    const headers: Record<string, string> = {
      host,
      "x-amz-content-sha256": hexHash(""),
      "x-amz-date": amzDate,
    };
    const signedHeaderKeys = Object.keys(headers).sort();
    const canonicalHeaders =
      signedHeaderKeys.map((k) => `${k}:${headers[k]}`).join("\n") + "\n";
    const signedHeaderList = signedHeaderKeys.join(";");
    const canonicalQuery = Object.entries(query)
      .map<[string, string]>(([k, v]) => [
        uriEncode(k, true),
        uriEncode(v, true),
      ])
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${k}=${v}`)
      .join("&");
    const canonicalRequest = [
      "GET",
      canonicalUri,
      canonicalQuery,
      canonicalHeaders,
      signedHeaderList,
      hexHash(""),
    ].join("\n");
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      hexHash(canonicalRequest),
    ].join("\n");
    const signingKey = deriveSigningKey(
      this.secretAccessKey,
      shortDate,
      this.region,
    );
    const signature = createHmac("sha256", signingKey)
      .update(stringToSign)
      .digest("hex");
    const authHeader =
      `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope},` +
      ` SignedHeaders=${signedHeaderList}, Signature=${signature}`;

    const res = await this.fetchImpl(
      `${url.origin}${canonicalUri}?${canonicalQuery}`,
      {
        method: "GET",
        headers: { ...headers, Authorization: authHeader },
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`listObjects failed: ${res.status} ${text}`);
    }
    const xml = await res.text();
    const { objects, truncated } = parseListObjectsXml(xml);
    return { bucket: this.bucket, prefix, objects, truncated };
  }

  presignGet(input: PresignInput): PresignResult {
    const key = sanitiseKey(input.key);
    const expiresIn = clampTtl(input.expiresIn);
    const now = new Date();
    const amzDate = isoBasicDate(now);
    const url = buildPresignedUrl({
      method: "GET",
      endpoint: this.endpoint,
      region: this.region,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      bucket: this.bucket,
      key,
      expiresIn,
      amzDate,
    });
    return {
      url,
      key,
      expiresAt: new Date(now.getTime() + expiresIn * 1000).toISOString(),
    };
  }

  presignPut(input: PresignInput): PresignResult {
    const key = sanitiseKey(input.key);
    const expiresIn = clampTtl(input.expiresIn);
    const now = new Date();
    const amzDate = isoBasicDate(now);
    const url = buildPresignedUrl({
      method: "PUT",
      endpoint: this.endpoint,
      region: this.region,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      bucket: this.bucket,
      key,
      expiresIn,
      amzDate,
      ...(input.contentType ? { contentType: input.contentType } : {}),
    });
    return {
      url,
      key,
      expiresAt: new Date(now.getTime() + expiresIn * 1000).toISOString(),
    };
  }
}

// ── Default factory from env ─────────────────────────────────────────

const DEFAULT_ENDPOINT = "http://127.0.0.1:9000";
const DEFAULT_REGION = "us-east-1";
const DEFAULT_BUCKET = "crontech-objects";

export interface CreateClientFromEnvOptions {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
}

export function createClientFromEnv(
  options: CreateClientFromEnvOptions = {},
): ObjectStorageClient | null {
  const env = options.env ?? (process.env as Record<string, string | undefined>);
  const accessKeyId = env["OBJECT_STORAGE_ACCESS_KEY_ID"] ?? env["MINIO_ROOT_USER"];
  const secretAccessKey =
    env["OBJECT_STORAGE_SECRET_ACCESS_KEY"] ?? env["MINIO_ROOT_PASSWORD"];
  if (!accessKeyId || !secretAccessKey) return null;
  const init: ObjectStorageClientOptions = {
    endpoint: env["OBJECT_STORAGE_ENDPOINT"] ?? DEFAULT_ENDPOINT,
    region: env["OBJECT_STORAGE_REGION"] ?? DEFAULT_REGION,
    accessKeyId,
    secretAccessKey,
    bucket: env["OBJECT_STORAGE_BUCKET"] ?? DEFAULT_BUCKET,
  };
  if (options.fetch) init.fetch = options.fetch;
  return new ObjectStorageClient(init);
}
