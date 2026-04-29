# `@back-to-the-future/deploy-orchestrator`

> Wave 2, BLK-009 stage 3 — **artefact → live URL** in seconds.

The deploy-orchestrator is the third stage of Crontech's git-push deploy
pipeline. It takes a `BuildArtefact` produced by the build-runner
(stage 2) and drives it through the side-effect chain that ends with a
live, traffic-serving deployment on the edge runtime.

```
git push   →   git-webhook   →   build-runner   →   deploy-orchestrator   →   live URL
                 (stage 1)        (stage 2)              (this service)
```

---

## Input contract

The orchestrator consumes a Zod-validated `BuildArtefact`:

```ts
{
  buildId: string;
  tenantId: string;
  projectId: string;
  sha: string;              // git sha (7-40 hex chars)
  framework:                // see Framework enum
    | "solidstart" | "nextjs" | "remix" | "astro"
    | "sveltekit" | "hono" | "node" | "static";
  tarballPath: string;      // local FS path or signed URL
  sizeBytes: number;
  sha256: string;           // 64 hex chars
  hostname: string;         // public hostname this build serves under
  entrypointOverride?: string;
  limits: { cpuMs: number; memoryMb: number };
}
```

The schema lives in `src/schemas.ts` and is re-exported from the package
root.

---

## Deployment lifecycle

Every deploy emits a `DeploymentRecord` on the configured `StatusEmitter`
at each transition. Status progression on the happy path:

```
queued → uploading → registering → routing → health-checking → swapping → live
```

On failure, the pipeline transitions to `rolling-back`, undoes every
side-effect that has already happened (in reverse order), and ends in
`failed`.

| Step | Side-effect | Rollback |
|------|-------------|----------|
| 1. Upload | `objectStorage.put()` to `bundles/{tenantId}/{buildId}.tar` | `delete` the object |
| 2. Read entrypoint | (pure) — framework-aware path resolution | n/a |
| 3. Fetch env+secrets | `secrets.fetchBundle()` | n/a (read-only) |
| 4. Register | `edgeRuntime.registerBundle()` with `id, hash, code, env, secrets, limits` | `deleteBundle` |
| 5. Atomic swap | `tunnel.swap({ hostname, bundleId })` | `swap` back to previous, or `deleteRoute` if first deploy |
| 6. Health-check | GET `https://{hostname}/` once, expect 2xx within 10s | n/a (rolls back upstream steps) |
| 7. Blue-green warm | `edgeRuntime.warmBundle(previousBundleId, ttl)` (best-effort) | n/a |

Health-check failure is the only step that can roll back a successful
swap — it explicitly restores the previous bundle's tunnel route before
deleting the new bundle, so traffic is never stranded on a failing
deploy.

---

## Blue-green swap timing

After a successful swap, the previous bundle is kept warm via
`edgeRuntime.warmBundle()` for `blueGreenWarmMs` (default **60 000 ms /
60 s**). This window absorbs in-flight requests against the old bundle
while the tunnel registry propagates the new mapping. Tunable via
`DeployDeps.blueGreenWarmMs`.

The health-check timeout is separately tunable via
`DeployDeps.healthTimeoutMs` (default **10 000 ms / 10 s**).

---

## Rollback model

Rollback is **best-effort**: every step is wrapped, and rollback errors
are swallowed so the pipeline always finishes in a `failed` state with
the original error preserved. Worst-case orphaned resources (a stale
bundle in object-storage, a draining edge bundle) are reaped by the
next successful deploy or by background sweepers — they never leak
further than the next deploy.

---

## Concurrency

Concurrent deploys for the **same** tenant are queued FIFO — a
`TenantQueue` ensures the second deploy can read the first deploy's
bundle as its `previousBundleId`, which keeps blue-green correct.

Deploys for **different** tenants run fully in parallel.

```ts
import { DeployOrchestrator } from "@back-to-the-future/deploy-orchestrator";

const orch = new DeployOrchestrator(deps);
await Promise.all([
  orch.deploy(artefactA), // tenant_a — runs concurrently
  orch.deploy(artefactB), // tenant_b — runs concurrently
  orch.deploy(artefactC), // tenant_a — queues behind A
]);
```

---

## Environment variables

The orchestrator itself is configuration-driven via injected clients —
no env vars are read at import time. The HTTP client factories expect
the caller to supply:

| Variable | Used by | Purpose |
|----------|---------|---------|
| `OBJECT_STORAGE_BASE_URL` | `createObjectStorageHttpClient` | base URL of services/object-storage |
| `OBJECT_STORAGE_TOKEN` | `createObjectStorageHttpClient` | bearer token |
| `EDGE_RUNTIME_BASE_URL` | `createEdgeRuntimeHttpClient` | base URL of services/edge-runtime |
| `EDGE_RUNTIME_TOKEN` | `createEdgeRuntimeHttpClient` | bearer token |
| `TUNNEL_BASE_URL` | `createTunnelHttpClient` | base URL of services/tunnel |
| `TUNNEL_TOKEN` | `createTunnelHttpClient` | bearer token |
| `SECRETS_VAULT_BASE_URL` | `createSecretsVaultHttpClient` | base URL of services/secrets-vault (Wave 2 Agent 4) |
| `SECRETS_VAULT_TOKEN` | `createSecretsVaultHttpClient` | bearer token |
| `BUNDLES_BUCKET` | pipeline | object-storage bucket name (default `bundles`) |

Read these in your service entrypoint and feed them into the factories.

---

## Testing

```bash
bun test services/deploy-orchestrator
```

Every external surface is mocked via the helpers in `test/mocks.ts` —
no real HTTP, no real filesystem. The test suite covers:

- happy-path end-to-end pipeline
- framework-aware entrypoint extraction (all 8 frameworks)
- entrypoint override + path-traversal rejection
- rollback at every step (upload, register, swap, health-check)
- blue-green swap with previous-bundle warm
- per-tenant FIFO queueing
- cross-tenant parallelism
- HTTP client wrapper request/response shape

---

## Integration points

- **Stage 2 (build-runner)** emits a `BuildArtefact` and hands it to the
  orchestrator's `deploy()`.
- **services/edge-runtime** is the bundle host — POST `/admin/bundles`.
- **services/object-storage** is bundle persistent storage — PUT
  `/buckets/:bucket/:key`.
- **services/tunnel** is the hostname → bundle-id router —
  POST `/routes/swap`.
- **services/secrets-vault** (Wave 2 sibling) returns env + secrets
  for the bundle — GET `/tenants/:t/projects/:p/bundle?sha=…`.

If a sibling service's contract changes, the matching client wrapper in
`src/clients/` is the single point of update.
