# Crontech Edge Runtime — v0

Block: `BLK-017 — Crontech Edge Runtime v0`
Service: `services/edge-runtime/`
Status: v0 self-hosted, single-region, single-tenant. v1 introduces real
V8 isolates plus multi-region Anycast routing.

---

## What this service is

The edge runtime is the **self-hosted execution surface** that runs
customer bundles next to their users. A "bundle" is an already-built
JavaScript artifact that exports a default `(req: Request) => Response`
handler. Operators upload a bundle through the runtime's admin API; the
runtime then dispatches every request that matches `/run/:id/*` to that
bundle inside a sandboxed worker and streams the response back.

This is the runtime that competes with hosted edge platforms — but on
hardware we own, with our own routing, our own observability, and our
own zero-cost ceiling. v0 is the smallest cut that proves the dispatch
loop works end-to-end. v1 raises it to production multi-region.

The existing `services/edge-workers/` workspace is a Cloudflare Worker
**consumer** — it ships handlers *to* a managed edge. The new
`services/edge-runtime/` workspace is the **execution surface itself**.
The two coexist without overlap.

---

## v0 architecture

```
                       ┌─────────────────────────────────────┐
                       │  services/edge-runtime/src/index.ts │
                       │                                     │
   HTTP request  ───►  │  Bun.serve on 127.0.0.1:9096        │
                       │  ├─ /health                          │
                       │  ├─ /admin/bundles  (Bearer auth)    │
                       │  └─ /run/:id/*      (Bearer auth)    │
                       │                                     │
                       │     │                               │
                       │     ▼                               │
                       │  parsePath() → in-memory registry   │
                       │     │                               │
                       │     ▼                               │
                       │  spawn Bun Worker (worker-host.ts)  │
                       │     ├─ init {code, entrypoint}      │
                       │     │   └─► loads bundle as ESM     │
                       │     │       via data: URL import    │
                       │     ├─ invoke {serialised request}  │
                       │     │   └─► calls default handler   │
                       │     └─ response {serialised}        │
                       │                                     │
                       │  5s hard timeout per invocation     │
                       │  worker terminated after each call  │
                       └─────────────────────────────────────┘
```

### File layout

| File | Role |
|---|---|
| `src/index.ts` | HTTP server + dispatch orchestration. Public exports. |
| `src/registry.ts` | In-memory `BundleRegistry` + Zod schemas. |
| `src/dispatch.ts` | Pure helpers — request/response (de)serialisation, bundle hash. |
| `src/worker-host.ts` | Bun Worker entrypoint — loads + invokes a bundle. |
| `src/*.test.ts` | Unit tests. The worker is mocked via the `WorkerSpawner` seam. |

### Wire protocol (parent ↔ worker)

Both directions are validated with Zod (`WorkerMessageSchema`,
`WorkerReplySchema`) before being trusted. The parent always sends
`init` first and waits for `ready`; if `ready` does not arrive within
the configured timeout, the parent terminates the worker and answers
the original request with `504 Gateway Timeout`.

| Direction | Type | Payload |
|---|---|---|
| parent → worker | `init` | `{ code, entrypoint }` — the bundle to evaluate |
| worker → parent | `ready` | bundle loaded, awaiting invoke |
| parent → worker | `invoke` | `{ request: SerialisedRequest }` |
| worker → parent | `response` | `{ response: SerialisedResponse }` |
| worker → parent | `error` | `{ message }` — for any thrown error |

A new worker is spawned per request in v0. v1 will pool warm workers
keyed by bundle hash to hit the sub-1ms warm-dispatch target.

### Auth

Every `/admin/*` and `/run/*` request must present
`Authorization: Bearer ${EDGE_RUNTIME_SECRET}`. The comparison uses a
constant-time-ish loop (both strings are the same length) to avoid
timing leaks. v1 will add per-bundle scoped tokens; v0 is a single
shared secret because the only client is the deploy agent on the same
host.

---

## v0 → v1 trade-off — Bun Workers vs V8 isolates

**The block specification calls for V8 isolates. v0 ships Bun Workers.**
This is a deliberate, time-boxed compromise.

### Why Bun Workers

- They are the **highest-fidelity** isolation primitive Bun ships
  natively today.
- They run TypeScript / ES modules without an extra build step, which
  matches our deploy-artifact format.
- The `Worker` constructor + `postMessage` wire protocol can be swapped
  out behind a single `WorkerSpawner` interface — the rest of the
  runtime does not care what is on the other side of the message port.

### Why this is NOT good enough for v1

- **Bun Workers are not V8 isolates.** They are dedicated threads in
  the host process. A bundle that calls `process.exit()`, allocates
  unbounded memory, or saturates the worker's event loop can still hurt
  the host.
- **Memory is not metered per bundle.** A real V8 isolate exposes
  `IsolateHandle::SetResourceConstraints` so we can enforce a hard
  memory cap. Bun Workers offer no equivalent today.
- **Cold-start performance is in the right neighbourhood (~10-30ms in
  practice) but not at the sub-5ms target the block calls for.** True
  V8 isolates with a snapshot-based cold start hit single-digit ms.

### v1 plan

The `WorkerSpawner` seam in `src/index.ts` is the **only** place that
touches the underlying isolation primitive. v1 replaces
`defaultSpawnWorker` with one of:

1. A Rust harness embedding V8 directly (preferred — gives us snapshot
   support, memory metering, and a per-bundle CPU clock).
2. `isolated-vm` — viable if we move the host to Node.js or run the
   worker host as a Node child process.

The wire protocol (`init` / `invoke` / `ready` / `response` / `error`)
is already V8-isolate-friendly. The bundle format (default-export of
`(Request) => Response`) is already V8-isolate-friendly. v1 is a
focused swap, not a rewrite.

**Until v1 lands, treat the v0 runtime as `self-hosted, single-tenant,
trusted-operator`.** Do not point untrusted user bundles at it.

---

## Why single-region for v0

The block target is "v1: 3+ regions with Anycast routing." v0 runs on
one node intentionally:

- **Routing complexity.** Anycast + per-region health checks + DNS
  failover are their own block (`BLK-019` Tunnel work touches the
  routing layer). v0 ships first, v1 wires regions in.
- **State.** v0 keeps the bundle registry in memory. The moment we add
  region #2 we need a shared store (Turso is the obvious answer — it is
  already the platform default for edge state). That is v1.
- **Observability.** Multi-region debugging requires structured
  per-node logs, request IDs, and a regional dashboard. v0's
  per-process console.log is fine for one box; it falls over the
  moment we have three.

---

## Exit criteria — where each one is met or deferred

The block specification's exit criteria, mapped to this v0:

| Spec line | v0 status | Notes |
|---|---|---|
| Self-hosted V8-isolate edge runtime | **Deferred to v1** | v0 uses Bun Workers as a documented stand-in. The `WorkerSpawner` seam is the swap point. |
| Multi-region nodes | **Deferred to v1** | v0 is single-region. |
| Sub-5ms cold start | **Partially met** | Bun Worker boot is fast but not yet at the spec target. v1 with V8 + snapshots hits it. |
| Sub-1ms warm dispatch | **Deferred to v1** | v0 spawns a fresh worker per invoke. v1 adds a warm pool keyed by bundle hash. |
| Deploys are artifact uploads | **Met** | `POST /admin/bundles` accepts `{ id, code, entrypoint }`. |
| Routed via DNS to nearest healthy node | **Deferred to v1** | Single node in v0; no Anycast layer yet. |

The v0 unit tests cover: registry CRUD, request/response round-trip
(de)serialisation, deterministic bundle hashing, the auth gate, the
admin API surface, the run-route 404 path, the run-route happy path
through a mocked worker, the 504 hard-timeout path, and the
worker-reported 500 error path.

---

## Run it

```bash
EDGE_RUNTIME_SECRET=$(openssl rand -hex 32) bun run --filter @back-to-the-future/edge-runtime start
```

Register a bundle:

```bash
curl -sX POST http://127.0.0.1:9096/admin/bundles \
  -H "Authorization: Bearer $EDGE_RUNTIME_SECRET" \
  -H "Content-Type: application/json" \
  -d '{ "id": "hello", "code": "export default () => new Response(\"hi\")" }'
```

Hit it:

```bash
curl -i -H "Authorization: Bearer $EDGE_RUNTIME_SECRET" \
  http://127.0.0.1:9096/run/hello
```

---

## Non-scope reminders

The following items are explicitly **not** in v0. Do not add them
without Craig's authorization:

- Multi-region orchestration / Anycast routing
- Wrangler-compatible API surface
- Persistent bundle store (Turso comes in v1)
- WASM execution beyond what Bun supports out of the box
- Per-tenant scoped tokens (single shared secret in v0)
- A warm-worker pool

When v1 ships, every one of those gates lifts in turn.
