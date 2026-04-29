// ── Managed Databases Entry Point ─────────────────────────────────────
// Wires env to the registry + provisioners and starts the internal HTTP
// server bound to 127.0.0.1. Refuses to boot without master KEK + token.

import { AuditLogger } from "./audit";
import { parseMasterKey } from "./crypto";
import {
  type DbProvisioner,
  NeonProvisioner,
  type NeonTransport,
  type RedisCommand,
  RedisLocalProvisioner,
} from "./provisioners";
import { DatabaseRegistry } from "./registry";
import { createServer } from "./server";
import type { DbType } from "./types";

export { AuditLogger } from "./audit";
export {
  decryptConnectionString,
  deriveTenantDek,
  encryptConnectionString,
  parseMasterKey,
} from "./crypto";
export {
  DatabaseRegistry,
  NotFoundError,
  QuotaExceededError,
  TenantMismatchError,
  UnsupportedOperationError,
} from "./registry";
export type { PublicDbView } from "./registry";
export {
  NeonProvisioner,
  RedisLocalProvisioner,
} from "./provisioners";
export type {
  BranchRequest,
  BranchResult,
  DbProvisioner,
  DeprovisionRequest,
  NeonTransport,
  ProvisionRequest,
  ProvisionResult,
  RedisCommand,
  RestoreRequest,
  RestoreResult,
  RotateRequest,
  RotateResult,
  SnapshotRequest,
  SnapshotResult,
} from "./provisioners";
export { createServer } from "./server";
export type {
  AuditAction,
  AuditEntry,
  AuditSink,
  BranchRecord,
  Clock,
  ConnectionStringRef,
  DatabaseRecord,
  DbStatus,
  DbType,
  EncryptedBlob,
  Region,
  SizeTier,
  SnapshotRecord,
} from "./types";

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

function defaultNeonTransport(baseUrl: string, apiKey: string): NeonTransport {
  return async (path, init) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: init.method,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    if (!res.ok) {
      throw new Error(`neon api ${init.method} ${path} -> ${res.status}`);
    }
    return res.json();
  };
}

function defaultRedisCommand(_clusterUrl: string): RedisCommand {
  return async (_command, _args) => {
    // Production binding is supplied by the bare-metal cluster admin
    // service (out of scope for this control plane). The default is a
    // hard error so misconfigurations fail loud.
    throw new Error(
      "no redis admin transport configured — set MANAGED_DBS_REDIS_TRANSPORT",
    );
  };
}

function main(): void {
  const masterKey = parseMasterKey(readEnv("MANAGED_DBS_MASTER_KEY"));
  const authToken = readEnv("MANAGED_DBS_TOKEN");
  const audit = new AuditLogger();

  const provisioners = new Map<DbType, DbProvisioner>();

  if (process.env["MANAGED_DBS_NEON_API_KEY"]) {
    const baseUrl = process.env["MANAGED_DBS_NEON_BASE_URL"] ?? "https://console.neon.tech/api/v2";
    const apiKey = process.env["MANAGED_DBS_NEON_API_KEY"] ?? "";
    provisioners.set(
      "postgres",
      new NeonProvisioner({ transport: defaultNeonTransport(baseUrl, apiKey) }),
    );
  }
  if (process.env["MANAGED_DBS_REDIS_HOST"]) {
    const host = process.env["MANAGED_DBS_REDIS_HOST"] ?? "127.0.0.1";
    const port = Number(process.env["MANAGED_DBS_REDIS_PORT"] ?? "6379");
    provisioners.set(
      "redis",
      new RedisLocalProvisioner({
        command: defaultRedisCommand(`redis://${host}:${port}`),
        clusterHost: host,
        clusterPort: port,
      }),
    );
  }

  const registry = new DatabaseRegistry({ masterKey, provisioners, audit });
  const app = createServer({ registry, authToken, audit });

  const port = Number(process.env["MANAGED_DBS_PORT"] ?? "9120");
  Bun.serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });
  console.log(
    JSON.stringify({
      component: "managed-databases",
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
