// ── Secrets Vault Entry Point ─────────────────────────────────────────
// Starts the internal HTTP server on localhost only. Reads master KEK
// and internal bearer token from env. Refuses to boot without them.

import { AuditLogger } from "./audit";
import { parseMasterKey } from "./crypto";
import { RateLimiter } from "./rate-limit";
import { createServer } from "./server";
import { VaultStore } from "./store";

export { AuditLogger } from "./audit";
export {
  decryptValue,
  deriveTenantDek,
  encryptValue,
  parseMasterKey,
} from "./crypto";
export type { EncryptedBlob } from "./crypto";
export { RateLimiter } from "./rate-limit";
export { createServer } from "./server";
export { VaultStore } from "./store";
export type { AuditAction, AuditEntry, AuditSink, Clock } from "./types";

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

function main(): void {
  const masterKey = parseMasterKey(readEnv("SECRETS_VAULT_MASTER_KEY"));
  const authToken = readEnv("SECRETS_VAULT_INTERNAL_TOKEN");
  const audit = new AuditLogger();
  const rateLimiter = new RateLimiter();
  const store = new VaultStore({ masterKey, audit });
  const app = createServer({ store, authToken, rateLimiter, audit });

  const port = Number(process.env["SECRETS_VAULT_PORT"] ?? "9100");
  // 127.0.0.1 only — the vault MUST NOT be reachable from outside the
  // Crontech internal network.
  Bun.serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });
  console.log(
    JSON.stringify({
      component: "secrets-vault",
      event: "server.start",
      port,
      hostname: "127.0.0.1",
      timestamp: new Date().toISOString(),
    }),
  );
}

if (import.meta.main) {
  main();
}
