import {
  type TunnelRouteResponse,
  TunnelRouteResponseSchema,
} from "../schemas";
import type { FetchLike } from "./fetch";

/**
 * Thin HTTP client wrapper for services/tunnel (Wave 1 BLK-019).
 * Maintains the hostname → bundle-id route registry. Atomic swap is the
 * primary use-case for blue-green deploys; the tunnel registers a new
 * route and the old route is left in-place until `drainOldRoute` runs.
 */
export interface TunnelClient {
  upsertRoute(input: {
    hostname: string;
    bundleId: string;
  }): Promise<TunnelRouteResponse>;
  deleteRoute(hostname: string): Promise<void>;
  /** Bind hostname to bundleId atomically (returns previous bundle if any). */
  swap(input: {
    hostname: string;
    bundleId: string;
  }): Promise<{ previousBundleId?: string }>;
}

export interface TunnelHttpConfig {
  baseUrl: string;
  authToken: string;
  fetch?: FetchLike;
}

export function createTunnelHttpClient(cfg: TunnelHttpConfig): TunnelClient {
  const f = cfg.fetch ?? fetch;
  const headers = (): HeadersInit => ({
    Authorization: `Bearer ${cfg.authToken}`,
    "Content-Type": "application/json",
  });

  return {
    async upsertRoute(input) {
      const res = await f(`${cfg.baseUrl}/routes`, {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        throw new Error(`tunnel upsert failed: ${res.status}`);
      }
      return TunnelRouteResponseSchema.parse(await res.json());
    },
    async deleteRoute(hostname) {
      const res = await f(
        `${cfg.baseUrl}/routes/${encodeURIComponent(hostname)}`,
        { method: "DELETE", headers: headers() },
      );
      if (!res.ok && res.status !== 404) {
        throw new Error(`tunnel delete failed: ${res.status}`);
      }
    },
    async swap(input) {
      const res = await f(`${cfg.baseUrl}/routes/swap`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        throw new Error(`tunnel swap failed: ${res.status}`);
      }
      const data = (await res.json()) as { previousBundleId?: string };
      const out: { previousBundleId?: string } = {};
      if (typeof data.previousBundleId === "string") {
        out.previousBundleId = data.previousBundleId;
      }
      return out;
    },
  };
}
