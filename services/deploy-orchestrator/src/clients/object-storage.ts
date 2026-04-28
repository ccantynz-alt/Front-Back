import {
  type ObjectStoragePutResponse,
  ObjectStoragePutResponseSchema,
} from "../schemas";
import type { FetchLike } from "./fetch";

/**
 * Thin HTTP client wrapper for services/object-storage (Wave 1 BLK-018).
 * Speaks the documented S3-compatible API: PUT/GET on /buckets/:bucket/:key.
 *
 * Pure interface — no runtime side-effects on import. The orchestrator
 * injects either the real fetch-backed client or a mock at the boundary.
 */
export interface ObjectStorageClient {
  put(args: {
    bucket: string;
    key: string;
    body: Uint8Array | ReadableStream<Uint8Array>;
    contentType?: string;
    sha256?: string;
  }): Promise<ObjectStoragePutResponse>;
  delete(args: { bucket: string; key: string }): Promise<void>;
  signedUrl(args: {
    bucket: string;
    key: string;
    ttlSeconds: number;
  }): Promise<string>;
}

export interface ObjectStorageHttpConfig {
  baseUrl: string;
  authToken: string;
  fetch?: FetchLike;
}

export function createObjectStorageHttpClient(
  cfg: ObjectStorageHttpConfig,
): ObjectStorageClient {
  const f = cfg.fetch ?? fetch;
  const headers = (extra: Record<string, string> = {}): HeadersInit => ({
    Authorization: `Bearer ${cfg.authToken}`,
    ...extra,
  });

  return {
    async put({ bucket, key, body, contentType, sha256 }) {
      const url = `${cfg.baseUrl}/buckets/${encodeURIComponent(
        bucket,
      )}/${encodeURIComponent(key)}`;
      const extra: Record<string, string> = {
        "Content-Type": contentType ?? "application/octet-stream",
      };
      if (sha256) extra["X-Content-SHA256"] = sha256;
      const res = await f(url, {
        method: "PUT",
        headers: headers(extra),
        body: body as BodyInit,
      });
      if (!res.ok) {
        throw new Error(`object-storage PUT failed: ${res.status}`);
      }
      return ObjectStoragePutResponseSchema.parse(await res.json());
    },
    async delete({ bucket, key }) {
      const url = `${cfg.baseUrl}/buckets/${encodeURIComponent(
        bucket,
      )}/${encodeURIComponent(key)}`;
      const res = await f(url, { method: "DELETE", headers: headers() });
      if (!res.ok && res.status !== 404) {
        throw new Error(`object-storage DELETE failed: ${res.status}`);
      }
    },
    async signedUrl({ bucket, key, ttlSeconds }) {
      const url = `${cfg.baseUrl}/buckets/${encodeURIComponent(
        bucket,
      )}/${encodeURIComponent(key)}/sign?ttl=${ttlSeconds}`;
      const res = await f(url, { method: "POST", headers: headers() });
      if (!res.ok) {
        throw new Error(`object-storage sign failed: ${res.status}`);
      }
      const data = (await res.json()) as { url?: unknown };
      if (typeof data.url !== "string") {
        throw new Error("object-storage sign: malformed response");
      }
      return data.url;
    },
  };
}
