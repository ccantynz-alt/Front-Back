// ── Tenant webhook config registry ──────────────────────────────────────
//
// Maps `(tenantId, repoFullName)` → TenantWebhookConfig so the webhook
// handler can resolve the per-tenant secret + branch routing on each
// request.
//
// v1 backing store is in-memory, populated at startup. v2 path: Turso
// table `tenant_webhook_secrets(tenant_id, repo, secret_ciphertext,
// branch_environments_json, default_environment)` with secrets
// envelope-encrypted via the secrets-vault service. The interface here
// is intentionally narrow so swapping the backing store does not touch
// the handler.

import type { TenantWebhookConfig } from "./schemas";

export interface TenantConfigStore {
  get(tenantId: string, repo: string): TenantWebhookConfig | undefined;
  upsert(config: TenantWebhookConfig): void;
  delete(tenantId: string, repo: string): boolean;
}

export class InMemoryTenantConfigStore implements TenantConfigStore {
  private readonly byKey: Map<string, TenantWebhookConfig> = new Map();

  constructor(initial: readonly TenantWebhookConfig[] = []) {
    for (const cfg of initial) {
      this.upsert(cfg);
    }
  }

  get(tenantId: string, repo: string): TenantWebhookConfig | undefined {
    return this.byKey.get(key(tenantId, repo));
  }

  upsert(config: TenantWebhookConfig): void {
    this.byKey.set(key(config.tenantId, config.repo), config);
  }

  delete(tenantId: string, repo: string): boolean {
    return this.byKey.delete(key(tenantId, repo));
  }
}

function key(tenantId: string, repo: string): string {
  return `${tenantId}::${repo}`;
}

/**
 * Resolve which deploy environment a branch maps to, given a tenant
 * config. Returns undefined when no mapping exists (and therefore no
 * build should be triggered).
 *
 * Resolution order:
 *   1. Exact branch match in `branchEnvironments`.
 *   2. Wildcard `*` entry → use the entry's value, or fall back to
 *      `defaultEnvironment` if the wildcard value is the literal `*`.
 *   3. No match → undefined.
 */
export function resolveEnvironment(
  config: TenantWebhookConfig,
  branch: string,
): string | undefined {
  const exact = config.branchEnvironments[branch];
  if (exact !== undefined) {
    return exact;
  }
  const wildcard = config.branchEnvironments["*"];
  if (wildcard !== undefined) {
    return wildcard === "*" ? config.defaultEnvironment : wildcard;
  }
  return undefined;
}
