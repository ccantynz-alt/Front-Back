import { z } from "zod";
import type { SecretsBundle } from "../schemas";
import type { FetchLike } from "./fetch";

/**
 * Thin HTTP client wrapper for services/secrets-vault.
 *
 * The vault exposes two endpoints we use:
 *   GET  /tenants/:tenantId/secrets               → { tenantId, keys: string[] }
 *   POST /tenants/:tenantId/secrets/bundle        → { tenantId, env: Record<string,string> }
 *     body: { keys: string[] }
 *
 * The vault does not distinguish env-grade vs secret-grade values — every
 * value is treated as sensitive. We therefore map all returned values to
 * `secrets` and leave `env` empty. Project-scoped namespacing (per-project
 * key prefixes) is a v2 concern; v1 fetches the whole tenant set.
 */
export interface SecretsVaultClient {
  fetchBundle(input: {
    tenantId: string;
    projectId: string;
    sha: string;
  }): Promise<SecretsBundle>;
}

export interface SecretsVaultHttpConfig {
  baseUrl: string;
  authToken: string;
  requesterId?: string;
  fetch?: FetchLike;
}

const ListResponseSchema = z.object({
  tenantId: z.string(),
  keys: z.array(z.string()),
});

const BundleResponseSchema = z.object({
  tenantId: z.string(),
  env: z.record(z.string(), z.string()),
});

export function createSecretsVaultHttpClient(
  cfg: SecretsVaultHttpConfig,
): SecretsVaultClient {
  const f = cfg.fetch ?? fetch;
  const requesterId = cfg.requesterId ?? "deploy-orchestrator";
  const baseHeaders = {
    Authorization: `Bearer ${cfg.authToken}`,
    "X-Crontech-Requester": requesterId,
    Accept: "application/json",
  };
  return {
    async fetchBundle({ tenantId }) {
      const tid = encodeURIComponent(tenantId);
      const listRes = await f(`${cfg.baseUrl}/tenants/${tid}/secrets`, {
        headers: baseHeaders,
      });
      if (!listRes.ok) {
        throw new Error(`secrets-vault list failed: ${listRes.status}`);
      }
      const { keys } = ListResponseSchema.parse(await listRes.json());
      if (keys.length === 0) {
        return { env: {}, secrets: {} };
      }
      const bundleRes = await f(`${cfg.baseUrl}/tenants/${tid}/secrets/bundle`, {
        method: "POST",
        headers: { ...baseHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ keys }),
      });
      if (!bundleRes.ok) {
        throw new Error(`secrets-vault bundle failed: ${bundleRes.status}`);
      }
      const { env } = BundleResponseSchema.parse(await bundleRes.json());
      return { env: {}, secrets: env };
    },
  };
}
