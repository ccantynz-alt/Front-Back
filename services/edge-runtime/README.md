# `@back-to-the-future/edge-runtime`

**Crontech's V8-Realm edge runtime — production-deployable, Workers-class.**

Runs untrusted customer JavaScript with the Web Standards `fetch`
handler interface that Cloudflare Workers and Vercel Edge Functions
expose. Customer code uploaded as a self-contained ESM bundle gets a
fresh V8 Realm per bundle, with per-invocation `console` capture, env
+ secret injection, and configurable time + memory limits.

This service is Crontech's answer to "give me a Workers-class runtime
on my own infrastructure, with the same DX, but better defaults and
without the vendor lock-in."

---

## Public API

### Boot

```ts
import { startEdgeRuntime } from "@back-to-the-future/edge-runtime";

const server = await startEdgeRuntime({
  hostname: "127.0.0.1",
  port: 9096,
  secret: process.env.EDGE_RUNTIME_SECRET, // required, used for /admin and /run auth
  onInvocation: (event) => {
    // Forward captured console output + outcome to the log pipeline.
    // event.bundleId, event.result.logs.lines, event.result.outcome
  },
});
```

The standalone runner (`bun run start`) reads its config from env:

| Variable                  | Required | Default     | Notes                          |
| ------------------------- | -------- | ----------- | ------------------------------ |
| `EDGE_RUNTIME_SECRET`     | yes      | —           | `Bearer` token for admin + run |
| `EDGE_RUNTIME_HOST`       | no       | `127.0.0.1` |                                |
| `EDGE_RUNTIME_PORT`       | no       | `9096`      |                                |
| `EDGE_RUNTIME_TIMEOUT_MS` | no       | `5000`      | Legacy-worker invocation cap   |

### HTTP routes

All routes except `/health` require `Authorization: Bearer ${SECRET}`.

| Method   | Path                  | Purpose                                      |
| -------- | --------------------- | -------------------------------------------- |
| `GET`    | `/health`             | Unauthenticated liveness probe + mode info   |
| `POST`   | `/admin/bundles`      | Register or replace a bundle                 |
| `GET`    | `/admin/bundles`      | List registered bundles (no secret values)   |
| `DELETE` | `/admin/bundles/:id`  | Remove a bundle                              |
| `*`      | `/run/:id/*`          | Dispatch the request to the named bundle    |

### Bundle upsert payload

```jsonc
{
  "id": "my-app",                       // [a-z0-9_-]+ (1-100 chars)
  "code": "export default { ... }",     // ESM source, ≤ 2 MiB
  "entrypoint": "worker.js",            // optional label
  "env": { "API_URL": "https://..." },  // public env, bound to globalThis.env
  "secrets": { "API_KEY": "..." },      // secret env, never returned by GET
  "limits": {                            // optional; defaults below
    "timeoutMs": 30000,                 //  50–60_000
    "memoryMb": 128                     //  8–1024
  }
}
```

### Customer bundle shape

The runtime accepts the same handler shapes as Cloudflare Workers and
Vercel Edge Functions:

```js
// Modern (recommended) — module-style default export
export default {
  async fetch(request, env) {
    return new Response(`Hello from ${env.GREETING}`);
  },
};
```

```js
// Legacy — addEventListener('fetch', ...)
addEventListener("fetch", (event) => {
  event.respondWith(new Response("hi"));
});
```

A bundle that does not export a fetch handler nor register a listener
is rejected at compile time with a `500 bundle init failed`.

### Per-invocation guarantees

- `globalThis.env` is bound to the merged `{ ...env, ...secrets }` for
  the request being served — secrets win on conflict.
- `globalThis.console.log/warn/error/info/debug` are captured per
  invocation. Captured lines are returned to the dispatcher via the
  `onInvocation` hook (BLK-014 forwards them to Loki).
- Wall-clock time is capped by `limits.timeoutMs` (default 30 s).
  When the budget elapses the runtime returns `504 gateway timeout`.
- Heap-delta during the invocation is sampled every 25 ms; when the
  delta exceeds `limits.memoryMb`, the runtime returns `507 memory
  limit exceeded`. (Best-effort on a shared heap — see "Trade-offs".)
- `eval` and `new Function(...)` are disabled inside the isolate. Code
  generation from strings is forbidden so customer code cannot escape
  the static-analysis bar we set at compile time.

### Public exports

```ts
import {
  startEdgeRuntime,            // HTTP dispatcher
  invokeIsolate,               // direct invocation primitive
  clearCompiledCache,          // test helper
  BundleRegistry, BundleSchema, BundleIdSchema,
  computeBundleHash,
  ConsoleCapture, runWithLimits, DEFAULT_LIMITS,
} from "@back-to-the-future/edge-runtime";
```

---

## Architecture

### Three-layer model

```
HTTP layer      → src/index.ts        // routing, auth, admin CRUD
Dispatch layer  → src/invoke.ts       // routes between isolate + legacy
Execution layer → src/isolate.ts      // V8 Realm + sandbox + handler
                  src/console-capture.ts
                  src/limits.ts
```

### Isolation guarantee

Each registered bundle gets its own `vm.Context` (V8 Realm). Bundle A's
`globalThis.X` is invisible to bundle B. This matches the per-Worker
guarantee Cloudflare Workers offers.

`console` and `env` are not part of the cached Realm — they live on a
**per-invocation slot** that the dispatcher mutates before each call.
The customer's bundle reads them through accessor properties, so even
though the compiled module is reused for performance, every request
sees its own logs and its own env without leakage.

### Compilation cache

Compilation (parse + link + evaluate) is cached keyed by the bundle's
SHA-256 content hash. A redeploy with the same hash hits the cache and
costs ~sub-1 ms; a redeploy with a new hash misses and pays the parse
cost (~5–20 ms for a typical bundle on a warm host).

The cache is process-local. Multi-region propagation lives in the
deploy-agent (BLK-009), which calls `POST /admin/bundles` on every
edge node after a successful build.

### Trade-offs

- **Shared V8 heap.** `node:vm` Contexts share the host process's V8
  isolate. This matches Cloudflare's per-Worker-Realm model (CF Workers
  also share a process-wide isolate). Memory pressure between bundles
  is mitigated by the per-request heap-delta cap, but the cap is
  best-effort on a shared heap. Operators running adversarial
  multi-tenant workloads should pin one runtime process per tenant
  until v2.
- **No imports.** v1 bundles must be flat — no top-level `import`
  resolution. The deploy agent runs a bundler before upload, so this
  is a non-issue in production. v2 will plumb imports through Turso for
  multi-region module distribution.
- **No `eval`.** Disabled at the Context level. Bundles that need
  dynamic execution should use the platform's queue / RPC primitives
  instead.

### v2 roadmap

- `isolated-vm`-style separate V8 isolates per bundle (waiting on Bun
  support, or Rust harness via `rusty_v8`).
- Cooperative cancellation via `AbortSignal` in the customer Promise.
- Module imports resolved against a Turso-backed module registry.
- Per-tenant per-bundle bearer auth on `/run/:id` instead of the global
  operator secret.

---

## Testing

```bash
# Run the suite (Bun's built-in test runner)
EDGE_RUNTIME_SECRET=testtest bun test

# Type-check
bun run check

# Lint
bunx biome check .
```

The suite covers:

- **Cold-start** — first invocation under 200 ms (typically < 50 ms),
  warm path under 20 ms.
- **Tenant isolation** — bundle A's globals do not leak to bundle B.
  `eval` is rejected.
- **Env injection** — env + secrets visible on `globalThis.env` and
  the second handler argument; secrets do not leak across tenants.
- **Time limits** — hung handlers return `504` close to the budget.
- **Memory limits** — heap-delta cap deterministically returns `507`
  via injected memory readings; a real heap-allocation test verifies
  the runtime does not let the customer respond `200` after blowing
  the cap.
- **Console capture** — every `console.*` call is captured, fresh per
  invocation, never leaked to the host log stream.
- **Handler shape errors** — non-Response returns turn into `500`s.
- **Admin CRUD** — bundle upsert/list/delete with secret values
  scrubbed from the public list view.

---

## Why this exists

Crontech is the developer platform for the next decade. Edge runtimes
are no longer a vendor's secret sauce — they are commodity. We ship
ours so customers running on their own metal get the same Workers-class
DX without the vendor lock-in, and so the platform's own deploy
pipeline (BLK-009) has a target it owns end-to-end.
