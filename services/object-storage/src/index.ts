// ── Object Storage — entrypoint ───────────────────────────────────────
// Spins up the HTTP server on $OBJECT_STORAGE_PORT (default 4001),
// backed by either the FilesystemDriver or the MinioDriver depending
// on whether MinIO env vars are present.
//
// Importable too: `import { createServer } from
// "@back-to-the-future/object-storage/server"` to embed the engine in
// another service or in tests.

import { staticVerifier, type ApiKeyVerifier } from "./auth";
import { FilesystemDriver } from "./drivers/fs";
import { MinioDriver } from "./drivers/minio";
import type { StorageDriver } from "./drivers/types";
import { InMemoryPolicyStore } from "./policy";
import { createServer } from "./server";

export { createServer } from "./server";
export type { ServerOptions } from "./server";
export { FilesystemDriver, StorageError } from "./drivers/fs";
export { MinioDriver } from "./drivers/minio";
export type { MinioDriverOptions } from "./drivers/minio";
export type { StorageDriver, ObjectMetadata } from "./drivers/types";
export {
  InMemoryPolicyStore,
  authorize,
} from "./policy";
export type { BucketPolicy, BucketPolicyStore, BucketVisibility } from "./policy";
export { sign, verify, toQueryString } from "./signed-url";
export { staticVerifier, extractBearerKey, AuthError } from "./auth";
export type { ApiKeyVerifier, AuthIdentity } from "./auth";

interface BuildDriverEnv {
  MINIO_ENDPOINT?: string | undefined;
  MINIO_REGION?: string | undefined;
  MINIO_ACCESS_KEY_ID?: string | undefined;
  MINIO_SECRET_ACCESS_KEY?: string | undefined;
  OBJECT_STORAGE_FS_ROOT?: string | undefined;
}

export function buildDriverFromEnv(env?: BuildDriverEnv): StorageDriver {
  const e: BuildDriverEnv = env ?? {
    MINIO_ENDPOINT: process.env["MINIO_ENDPOINT"],
    MINIO_REGION: process.env["MINIO_REGION"],
    MINIO_ACCESS_KEY_ID: process.env["MINIO_ACCESS_KEY_ID"],
    MINIO_SECRET_ACCESS_KEY: process.env["MINIO_SECRET_ACCESS_KEY"],
    OBJECT_STORAGE_FS_ROOT: process.env["OBJECT_STORAGE_FS_ROOT"],
  };
  const endpoint = e.MINIO_ENDPOINT;
  const accessKeyId = e.MINIO_ACCESS_KEY_ID;
  const secretAccessKey = e.MINIO_SECRET_ACCESS_KEY;
  if (
    typeof endpoint === "string" &&
    typeof accessKeyId === "string" &&
    typeof secretAccessKey === "string" &&
    endpoint.length > 0
  ) {
    return new MinioDriver({
      endpoint,
      region: e.MINIO_REGION ?? "us-east-1",
      accessKeyId,
      secretAccessKey,
    });
  }
  const fsRoot = e.OBJECT_STORAGE_FS_ROOT ?? `${process.cwd()}/.object-storage-data`;
  return new FilesystemDriver(fsRoot);
}

if (import.meta.main) {
  const driver = buildDriverFromEnv();
  const policies = new InMemoryPolicyStore();

  const seededIdentity = {
    principal: "dev",
    writableBuckets: new Set<string>(["dev"]),
    readableBuckets: new Set<string>(["dev"]),
  };
  const verifier: ApiKeyVerifier = staticVerifier(
    new Map([[process.env["OBJECT_STORAGE_DEV_KEY"] ?? "dev-key", seededIdentity]]),
  );

  const signingSecret =
    process.env["OBJECT_STORAGE_SIGNING_SECRET"] ?? "dev-signing-secret-change-me";

  const app = createServer({
    driver,
    policies,
    verifier,
    signingSecret,
  });

  const port = Number.parseInt(process.env["OBJECT_STORAGE_PORT"] ?? "4001", 10);
  console.log(`[object-storage] listening on :${port}`);

  Bun.serve({ port, fetch: app.fetch });
}
