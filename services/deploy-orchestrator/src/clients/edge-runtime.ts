import {
  type EdgeRuntimeBundleResponse,
  EdgeRuntimeBundleResponseSchema,
} from "../schemas";
import type { FetchLike } from "./fetch";

/**
 * Thin HTTP client wrapper for services/edge-runtime (Wave 1 BLK-017).
 * Documented endpoints:
 *   POST /admin/bundles      → register a bundle
 *   DELETE /admin/bundles/:id → drain + remove
 *   POST /admin/bundles/:id/warm → keep warm during blue-green window
 *   GET /admin/bundles/:id/health → liveness probe
 */
export interface EdgeRuntimeClient {
  registerBundle(input: {
    id: string;
    hash: string;
    code: string;
    env: Record<string, string>;
    secrets: Record<string, string>;
    limits: { cpuMs: number; memoryMb: number };
  }): Promise<EdgeRuntimeBundleResponse>;
  deleteBundle(bundleId: string): Promise<void>;
  warmBundle(bundleId: string, ttlSeconds: number): Promise<void>;
  health(bundleId: string): Promise<{ ok: boolean }>;
}

export interface EdgeRuntimeHttpConfig {
  baseUrl: string;
  authToken: string;
  fetch?: FetchLike;
}

export function createEdgeRuntimeHttpClient(
  cfg: EdgeRuntimeHttpConfig,
): EdgeRuntimeClient {
  const f = cfg.fetch ?? fetch;
  const headers = (): HeadersInit => ({
    Authorization: `Bearer ${cfg.authToken}`,
    "Content-Type": "application/json",
  });

  return {
    async registerBundle(input) {
      const res = await f(`${cfg.baseUrl}/admin/bundles`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        throw new Error(`edge-runtime register failed: ${res.status}`);
      }
      return EdgeRuntimeBundleResponseSchema.parse(await res.json());
    },
    async deleteBundle(bundleId) {
      const res = await f(
        `${cfg.baseUrl}/admin/bundles/${encodeURIComponent(bundleId)}`,
        { method: "DELETE", headers: headers() },
      );
      if (!res.ok && res.status !== 404) {
        throw new Error(`edge-runtime delete failed: ${res.status}`);
      }
    },
    async warmBundle(bundleId, ttlSeconds) {
      const res = await f(
        `${cfg.baseUrl}/admin/bundles/${encodeURIComponent(bundleId)}/warm`,
        {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ ttlSeconds }),
        },
      );
      if (!res.ok) {
        throw new Error(`edge-runtime warm failed: ${res.status}`);
      }
    },
    async health(bundleId) {
      const res = await f(
        `${cfg.baseUrl}/admin/bundles/${encodeURIComponent(bundleId)}/health`,
        { headers: headers() },
      );
      return { ok: res.ok };
    },
  };
}
