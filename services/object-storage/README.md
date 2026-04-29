# `@back-to-the-future/object-storage`

Crontech's S3-compatible object storage service. Drop-in replacement for
Cloudflare R2 / AWS S3 for the Crontech platform — backed by MinIO in
production, the local filesystem in tests and dev.

## Why this exists

The platform needs a unified object-storage primitive: every Crontech
service (build artifacts, generated videos, AI training data, user
uploads, image CDN) writes to the same plane, with the same auth model,
the same audit trail, and the same SHA-256 ETag everywhere.

We refuse to lock the platform to a single vendor. The HTTP layer is
driver-agnostic — swap MinIO for AWS S3, GCS, or any S3-compatible
backend by writing one driver. No callers change.

## Architecture

```
┌─────────────────────────────────────┐
│ HTTP layer (Hono)                   │
│  • auth (API key / signed URL)      │
│  • bucket policies                  │
│  • SHA-256 ETag enforcement         │
└──────────────┬──────────────────────┘
               │
               ▼
   ┌──────────────────────┐
   │   StorageDriver      │  ← contract in `drivers/types.ts`
   └─┬──────────┬─────────┘
     │          │
     ▼          ▼
 Filesystem   MinIO (S3-compatible HTTP, AWS Sig V4)
  (tests)    (production)
```

We chose **direct S3 protocol over the official MinIO SDK** because:

- Keeps the dependency footprint to two packages (`hono`, `zod`).
- Gives full control over streaming, ETag computation, and signing.
- Matches the rest of the Crontech stack — every service in this repo
  hand-rolls its protocol layer for the same reason.

## Public HTTP API

All routes are mounted under the host root. Object keys may contain
slashes — `path/to/file.txt` is a single key.

| Method | Path | Description |
|---|---|---|
| `PUT`    | `/buckets/:bucket/:key` | Upload object (single-part) |
| `GET`    | `/buckets/:bucket/:key` | Download object |
| `HEAD`   | `/buckets/:bucket/:key` | Object metadata only |
| `DELETE` | `/buckets/:bucket/:key` | Delete object |
| `POST`   | `/buckets/:bucket/:key?uploads` | Initiate multipart upload |
| `PUT`    | `/buckets/:bucket/:key?partNumber=N&uploadId=U` | Upload one part |
| `POST`   | `/buckets/:bucket/:key?uploadId=U` | Complete multipart upload |
| `DELETE` | `/buckets/:bucket/:key?uploadId=U` | Abort multipart upload |
| `PUT`    | `/buckets/:bucket/policy` | Set bucket policy |
| `GET`    | `/buckets/:bucket/sign?key=&method=&ttl=` | Mint a pre-signed URL |
| `GET`    | `/health` | Liveness check |

### Authentication

Two paths:

1. **API key (Bearer header)** — `Authorization: Bearer <key>`. The
   platform issues keys and supplies a verifier (see `ApiKeyVerifier`).
2. **Signed URLs** — `?signed=<hex>&expires=<unix-seconds>&method=<m>&principal=<id>`.
   HMAC-SHA256 over a canonical string of `(method, bucket, key, expiresAt, principal)`.
   Signed URLs override the bearer-header path — the URL alone authorizes.

Anonymous access is only permitted on `public-read` buckets, and only
for `GET`.

### Bucket policies

Three canonical visibility modes:

| Visibility | Anonymous read | Authenticated read | Member write |
|---|---|---|---|
| `public-read` | yes | yes | yes (member) |
| `authenticated` | no | yes | yes (member) |
| `private` | no | yes (member only) | yes (member) |

`PUT /buckets/:bucket/policy` body:

```json
{ "visibility": "public-read" }
```

### Integrity

Every object response carries:

- `ETag: "<sha256-hex>"` — strong hash over the full body.
- `x-amz-meta-sha256-etag: <sha256-hex>` — same value, machine-friendly.
- `Content-Length`, `Last-Modified`, `Content-Type` (if set on PUT).

The driver is responsible for computing the hash. Multipart completion
recomputes the hash over the concatenated body — the per-part etags are
verified against the supplied list before assembly.

## Pointing a real S3 client at it

The HTTP API is **Crontech-flavoured**, not pure S3 — the route layout
is `/buckets/:bucket/:key` rather than `/<bucket>.<host>/<key>`. To
point an S3 client at the storage server itself, target the underlying
MinIO endpoint directly (the auth/policy layer in this service is for
*Crontech* clients, not for raw S3 clients).

```ts
// AWS SDK example pointing directly at the MinIO backend
import { S3Client } from "@aws-sdk/client-s3";
const s3 = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT,           // http://localhost:9000
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY_ID!,
    secretAccessKey: process.env.MINIO_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});
```

Crontech services should always go through the Crontech HTTP API
(this service) — never directly to MinIO — so policy enforcement,
audit trail, and signed-URL issuance stay in one place.

## Running locally

```bash
# Filesystem driver (no MinIO needed)
bun run --hot services/object-storage/src/index.ts

# MinIO driver
MINIO_ENDPOINT=http://localhost:9000 \
MINIO_ACCESS_KEY_ID=minioadmin \
MINIO_SECRET_ACCESS_KEY=minioadmin \
bun run --hot services/object-storage/src/index.ts
```

## Embedding

```ts
import { createServer, FilesystemDriver, InMemoryPolicyStore, staticVerifier }
  from "@back-to-the-future/object-storage";

const driver = new FilesystemDriver("/var/data/objstore");
const policies = new InMemoryPolicyStore();
const verifier = staticVerifier(new Map([
  ["dev-key", {
    principal: "dev",
    writableBuckets: new Set(["dev"]),
    readableBuckets: new Set(["dev"]),
  }],
]));

const app = createServer({
  driver,
  policies,
  verifier,
  signingSecret: process.env.OBJECT_STORAGE_SIGNING_SECRET!,
});

Bun.serve({ port: 4001, fetch: app.fetch });
```

## Tests

```bash
cd services/object-storage && bun test
```

Coverage:

- HTTP layer end-to-end: `test/server.test.ts`
- Filesystem driver edge cases: `test/fs-driver.test.ts`
- MinIO driver wire format: `test/minio-driver.test.ts`
- Pre-signed URL signing: `test/signed-url.test.ts`
- Bucket-policy authorization matrix: `test/policy.test.ts`

## Environment variables

| Variable | Purpose |
|---|---|
| `MINIO_ENDPOINT` | MinIO/S3 endpoint URL (e.g. `http://minio:9000`). When set, switches from FS driver to MinIO. |
| `MINIO_REGION` | AWS region for Sig V4 (default `us-east-1`). |
| `MINIO_ACCESS_KEY_ID` | MinIO/S3 access key. Required for MinIO driver. |
| `MINIO_SECRET_ACCESS_KEY` | MinIO/S3 secret key. Required for MinIO driver. |
| `OBJECT_STORAGE_FS_ROOT` | Filesystem root (FS driver). Defaults to `<cwd>/.object-storage-data`. |
| `OBJECT_STORAGE_PORT` | HTTP listen port. Default `4001`. |
| `OBJECT_STORAGE_SIGNING_SECRET` | HMAC secret for pre-signed URLs. Override the dev default in production. |
| `OBJECT_STORAGE_DEV_KEY` | Single-key dev verifier. Only used when running standalone. |
