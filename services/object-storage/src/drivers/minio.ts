// ── Object Storage — MinIO driver ─────────────────────────────────────
// Talks to a MinIO server via its S3-compatible HTTP API. We sign every
// request with AWS Signature V4 (path-style; MinIO's default). No third-
// party SDK — the surface area we need is small enough to hand-roll, and
// keeping deps minimal matches Crontech's "no unnecessary deps" doctrine.
//
// What we send to MinIO:
//   PUT    /:bucket/:key                                  — single-part upload
//   GET    /:bucket/:key                                  — download
//   HEAD   /:bucket/:key                                  — metadata
//   DELETE /:bucket/:key                                  — delete
//   POST   /:bucket/:key?uploads                          — initiate multipart
//   PUT    /:bucket/:key?partNumber=N&uploadId=U          — upload part
//   POST   /:bucket/:key?uploadId=U                       — complete multipart
//   DELETE /:bucket/:key?uploadId=U                       — abort multipart
//
// On the way back from MinIO we recompute SHA-256 over object bodies so
// our ETag is the strong-hash flavour our HTTP layer promises (S3's
// native ETag is MD5-of-MD5s for multipart and is not interchangeable).

import { createHash, createHmac } from "node:crypto";
import type {
  GetResult,
  MultipartCompletion,
  MultipartInit,
  ObjectMetadata,
  PutOptions,
  StorageDriver,
  UploadedPart,
} from "./types";

export interface MinioDriverOptions {
  /** Endpoint URL, e.g. "http://localhost:9000". */
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Optional fetch override — used in tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

interface S3InitiateMultipartUploadResult {
  Bucket: string;
  Key: string;
  UploadId: string;
}

export class MinioDriver implements StorageDriver {
  private readonly endpoint: string;
  private readonly region: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly host: string;

  constructor(options: MinioDriverOptions) {
    this.endpoint = options.endpoint.replace(/\/+$/, "");
    this.region = options.region;
    this.accessKeyId = options.accessKeyId;
    this.secretAccessKey = options.secretAccessKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.host = new URL(this.endpoint).host;
  }

  async ensureBucket(bucket: string): Promise<void> {
    const headRes = await this.signedFetch("HEAD", `/${encodeURIComponent(bucket)}/`);
    if (headRes.status === 200 || headRes.status === 204) return;
    const putRes = await this.signedFetch("PUT", `/${encodeURIComponent(bucket)}/`);
    if (putRes.status >= 400 && putRes.status !== 409) {
      throw new Error(`minio: ensureBucket failed (${putRes.status})`);
    }
  }

  async putObject(
    bucket: string,
    key: string,
    body: ReadableStream<Uint8Array> | Uint8Array,
    options?: PutOptions,
  ): Promise<ObjectMetadata> {
    const bytes = body instanceof Uint8Array ? body : await drain(body);
    const headers: Record<string, string> = {};
    if (options?.contentType !== undefined) {
      headers["content-type"] = options.contentType;
    }
    const res = await this.signedFetch(
      "PUT",
      `/${encodeURIComponent(bucket)}/${encodeKey(key)}`,
      bytes,
      headers,
    );
    if (res.status >= 400) {
      throw new Error(`minio: putObject failed (${res.status})`);
    }
    return {
      key,
      bucket,
      size: bytes.byteLength,
      etag: createHash("sha256").update(bytes).digest("hex"),
      contentType: options?.contentType,
      lastModified: new Date(),
    };
  }

  async getObject(bucket: string, key: string): Promise<GetResult> {
    const res = await this.signedFetch("GET", `/${encodeURIComponent(bucket)}/${encodeKey(key)}`);
    if (res.status === 404) {
      throw new Error(`minio: object not found ${bucket}/${key}`);
    }
    if (res.status >= 400) {
      throw new Error(`minio: getObject failed (${res.status})`);
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    const etag = createHash("sha256").update(buf).digest("hex");
    const lastModifiedHeader = res.headers.get("last-modified");
    const lastModified =
      lastModifiedHeader !== null ? new Date(lastModifiedHeader) : new Date();
    const metadata: ObjectMetadata = {
      key,
      bucket,
      size: buf.byteLength,
      etag,
      contentType: res.headers.get("content-type") ?? undefined,
      lastModified,
    };
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(buf);
        controller.close();
      },
    });
    return { metadata, body };
  }

  async headObject(bucket: string, key: string): Promise<ObjectMetadata | null> {
    const res = await this.signedFetch("HEAD", `/${encodeURIComponent(bucket)}/${encodeKey(key)}`);
    if (res.status === 404) return null;
    if (res.status >= 400) {
      throw new Error(`minio: headObject failed (${res.status})`);
    }
    const sizeHeader = res.headers.get("content-length");
    const size = sizeHeader !== null ? Number.parseInt(sizeHeader, 10) : 0;
    const etagHeader = res.headers.get("x-amz-meta-sha256-etag") ?? res.headers.get("etag");
    const etag = (etagHeader ?? "").replace(/"/g, "");
    return {
      key,
      bucket,
      size,
      etag,
      contentType: res.headers.get("content-type") ?? undefined,
      lastModified: new Date(res.headers.get("last-modified") ?? Date.now()),
    };
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    const res = await this.signedFetch(
      "DELETE",
      `/${encodeURIComponent(bucket)}/${encodeKey(key)}`,
    );
    if (res.status >= 400 && res.status !== 404) {
      throw new Error(`minio: deleteObject failed (${res.status})`);
    }
  }

  async initMultipart(
    bucket: string,
    key: string,
    options?: PutOptions,
  ): Promise<MultipartInit> {
    const headers: Record<string, string> = {};
    if (options?.contentType !== undefined) {
      headers["content-type"] = options.contentType;
    }
    const res = await this.signedFetch(
      "POST",
      `/${encodeURIComponent(bucket)}/${encodeKey(key)}?uploads=`,
      undefined,
      headers,
    );
    if (res.status >= 400) {
      throw new Error(`minio: initMultipart failed (${res.status})`);
    }
    const xml = await res.text();
    const parsed = parseInitiateMultipartUploadXml(xml);
    return { uploadId: parsed.UploadId };
  }

  async uploadPart(
    bucket: string,
    key: string,
    uploadId: string,
    partNumber: number,
    body: ReadableStream<Uint8Array> | Uint8Array,
  ): Promise<UploadedPart> {
    const bytes = body instanceof Uint8Array ? body : await drain(body);
    const path = `/${encodeURIComponent(bucket)}/${encodeKey(key)}?partNumber=${partNumber}&uploadId=${encodeURIComponent(uploadId)}`;
    const res = await this.signedFetch("PUT", path, bytes);
    if (res.status >= 400) {
      throw new Error(`minio: uploadPart failed (${res.status})`);
    }
    return {
      partNumber,
      etag: createHash("sha256").update(bytes).digest("hex"),
      size: bytes.byteLength,
    };
  }

  async completeMultipart(
    bucket: string,
    key: string,
    uploadId: string,
    parts: ReadonlyArray<{ partNumber: number; etag: string }>,
  ): Promise<MultipartCompletion> {
    const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);
    const xml = renderCompleteMultipartUploadXml(sorted);
    const res = await this.signedFetch(
      "POST",
      `/${encodeURIComponent(bucket)}/${encodeKey(key)}?uploadId=${encodeURIComponent(uploadId)}`,
      new TextEncoder().encode(xml),
      { "content-type": "application/xml" },
    );
    if (res.status >= 400) {
      throw new Error(`minio: completeMultipart failed (${res.status})`);
    }
    const head = await this.headObject(bucket, key);
    if (head === null) {
      throw new Error(`minio: completeMultipart returned no object`);
    }
    return { metadata: head };
  }

  async abortMultipart(bucket: string, key: string, uploadId: string): Promise<void> {
    const res = await this.signedFetch(
      "DELETE",
      `/${encodeURIComponent(bucket)}/${encodeKey(key)}?uploadId=${encodeURIComponent(uploadId)}`,
    );
    if (res.status >= 400 && res.status !== 404) {
      throw new Error(`minio: abortMultipart failed (${res.status})`);
    }
  }

  // ── AWS Sig V4 ─────────────────────────────────────────────────────

  private async signedFetch(
    method: string,
    pathWithQuery: string,
    body?: Uint8Array,
    extraHeaders?: Record<string, string>,
  ): Promise<Response> {
    const url = `${this.endpoint}${pathWithQuery}`;
    const parsed = new URL(url);
    const now = new Date();
    const amzDate = `${now.toISOString().replace(/[:-]|\.\d{3}/g, "")}`; // YYYYMMDDTHHMMSSZ
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = createHash("sha256")
      .update(body ?? new Uint8Array(0))
      .digest("hex");

    const headers: Record<string, string> = {
      ...extraHeaders,
      host: this.host,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
    };

    // Build canonical request.
    const canonicalQuery = canonicalizeQuery(parsed.searchParams);
    const sortedHeaderNames = Object.keys(headers)
      .map((h) => h.toLowerCase())
      .sort();
    const canonicalHeaders =
      sortedHeaderNames
        .map((name) => {
          const value = headers[name] ?? headers[Object.keys(headers).find((k) => k.toLowerCase() === name) ?? ""];
          return `${name}:${(value ?? "").trim()}\n`;
        })
        .join("") || "";
    const signedHeaders = sortedHeaderNames.join(";");
    const canonicalRequest = [
      method,
      parsed.pathname,
      canonicalQuery,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      createHash("sha256").update(canonicalRequest).digest("hex"),
    ].join("\n");

    const kDate = hmac(`AWS4${this.secretAccessKey}`, dateStamp);
    const kRegion = hmac(kDate, this.region);
    const kService = hmac(kRegion, "s3");
    const kSigning = hmac(kService, "aws4_request");
    const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");

    const authHeader = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const init: RequestInit = {
      method,
      headers: { ...headers, authorization: authHeader },
    };
    if (body !== undefined) {
      init.body = body as unknown as BodyInit;
    }
    return this.fetchImpl(url, init);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function canonicalizeQuery(params: URLSearchParams): string {
  const entries: Array<[string, string]> = [];
  for (const [k, v] of params.entries()) entries.push([k, v]);
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return entries.map(([k, v]) => `${rfc3986(k)}=${rfc3986(v)}`).join("&");
}

function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeKey(key: string): string {
  // Encode each path segment but keep the slashes — S3-style.
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  // biome-ignore lint/correctness/noConstantCondition: drain loop
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value !== undefined) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

function parseInitiateMultipartUploadXml(xml: string): S3InitiateMultipartUploadResult {
  // Minimal regex-based extraction — enough for MinIO's well-formed XML
  // responses. Avoids pulling in an XML parser dep.
  const tag = (name: string): string => {
    const m = new RegExp(`<${name}>([^<]+)</${name}>`).exec(xml);
    return m?.[1] ?? "";
  };
  return {
    Bucket: tag("Bucket"),
    Key: tag("Key"),
    UploadId: tag("UploadId"),
  };
}

function renderCompleteMultipartUploadXml(
  parts: ReadonlyArray<{ partNumber: number; etag: string }>,
): string {
  const inner = parts
    .map(
      (p) =>
        `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>"${p.etag}"</ETag></Part>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><CompleteMultipartUpload>${inner}</CompleteMultipartUpload>`;
}
