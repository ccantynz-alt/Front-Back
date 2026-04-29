import type { EdgeRuntimeClient } from "../src/clients/edge-runtime";
import type { ObjectStorageClient } from "../src/clients/object-storage";
import type { SecretsVaultClient } from "../src/clients/secrets-vault";
import type { TunnelClient } from "../src/clients/tunnel";
import type { BundleReader, HealthChecker, StatusEmitter } from "../src/pipeline";
import type { DeploymentRecord } from "../src/schemas";

interface ObjectEntry {
  bucket: string;
  key: string;
  size: number;
  sha256: string | undefined;
}

export function createMockObjectStorage(opts?: {
  failOnPut?: boolean;
}): ObjectStorageClient & { store: Map<string, ObjectEntry>; deletes: string[] } {
  const store = new Map<string, ObjectEntry>();
  const deletes: string[] = [];
  return {
    store,
    deletes,
    async put({ bucket, key, body, sha256 }) {
      if (opts?.failOnPut) throw new Error("object-storage simulated failure");
      const size = body instanceof Uint8Array ? body.byteLength : 0;
      store.set(`${bucket}/${key}`, { bucket, key, size, sha256 });
      return { bucket, key, etag: `etag-${size}` };
    },
    async delete({ bucket, key }) {
      deletes.push(`${bucket}/${key}`);
      store.delete(`${bucket}/${key}`);
    },
    async signedUrl({ bucket, key }) {
      return `https://mock.test/${bucket}/${key}?sig=ok`;
    },
  };
}

export function createMockEdgeRuntime(opts?: {
  failOnRegister?: boolean;
}): EdgeRuntimeClient & {
  bundles: Map<string, { hash: string }>;
  warmed: Array<{ bundleId: string; ttlSeconds: number }>;
  deleted: string[];
} {
  const bundles = new Map<string, { hash: string }>();
  const warmed: Array<{ bundleId: string; ttlSeconds: number }> = [];
  const deleted: string[] = [];
  return {
    bundles,
    warmed,
    deleted,
    async registerBundle(input) {
      if (opts?.failOnRegister) {
        throw new Error("edge-runtime simulated failure");
      }
      bundles.set(input.id, { hash: input.hash });
      return { bundleId: input.id, hash: input.hash, status: "registered" };
    },
    async deleteBundle(bundleId) {
      deleted.push(bundleId);
      bundles.delete(bundleId);
    },
    async warmBundle(bundleId, ttlSeconds) {
      warmed.push({ bundleId, ttlSeconds });
    },
    async health() {
      return { ok: true };
    },
  };
}

export function createMockTunnel(opts?: {
  failOnSwap?: boolean;
  initialRoutes?: Record<string, string>;
}): TunnelClient & {
  routes: Map<string, string>;
  swapHistory: Array<{ hostname: string; bundleId: string; previous?: string }>;
  deletes: string[];
} {
  const routes = new Map<string, string>(
    Object.entries(opts?.initialRoutes ?? {}),
  );
  const swapHistory: Array<{
    hostname: string;
    bundleId: string;
    previous?: string;
  }> = [];
  const deletes: string[] = [];
  return {
    routes,
    swapHistory,
    deletes,
    async upsertRoute({ hostname, bundleId }) {
      routes.set(hostname, bundleId);
      return { hostname, bundleId, routeId: `r-${hostname}` };
    },
    async deleteRoute(hostname) {
      deletes.push(hostname);
      routes.delete(hostname);
    },
    async swap({ hostname, bundleId }) {
      if (opts?.failOnSwap) throw new Error("tunnel simulated failure");
      const previous = routes.get(hostname);
      const entry: { hostname: string; bundleId: string; previous?: string } = {
        hostname,
        bundleId,
      };
      if (previous !== undefined) entry.previous = previous;
      swapHistory.push(entry);
      routes.set(hostname, bundleId);
      const out: { previousBundleId?: string } = {};
      if (previous !== undefined) out.previousBundleId = previous;
      return out;
    },
  };
}

export function createMockSecrets(): SecretsVaultClient {
  return {
    async fetchBundle() {
      return {
        env: { NODE_ENV: "production", LOG_LEVEL: "info" },
        secrets: { API_KEY: "shh" },
      };
    },
  };
}

export function createMockBundleReader(opts?: {
  entrypointFor?: Record<string, string>;
}): BundleReader & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    async readEntrypoint({ tarballPath, entrypoint }) {
      reads.push(`${tarballPath}::${entrypoint}`);
      return (
        opts?.entrypointFor?.[entrypoint] ??
        `// generated entry for ${entrypoint}\nexport default { fetch: () => new Response('ok') };`
      );
    },
    async readTarball() {
      return new Uint8Array([0x1, 0x2, 0x3, 0x4]);
    },
  };
}

export function createMockHealth(opts?: { ok?: boolean }): HealthChecker {
  return {
    async probe() {
      return { ok: opts?.ok ?? true };
    },
  };
}

export function createMockEmitter(): StatusEmitter & {
  records: DeploymentRecord[];
} {
  const records: DeploymentRecord[] = [];
  return {
    records,
    emit(record) {
      records.push({ ...record });
    },
  };
}

export const fixedClock = (iso = "2026-04-28T12:00:00.000Z"): (() => Date) => {
  let n = 0;
  return () => new Date(new Date(iso).getTime() + n++ * 1000);
};
