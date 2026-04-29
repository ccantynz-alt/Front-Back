# @back-to-the-future/worker-runtime

> **Long-running customer worker processes at the edge.** Render's "background worker" + Heroku's "worker dyno", reimagined for the AI-native era.

## What this is

`worker-runtime` is the Crontech service type for **long-lived, non-request-scoped processes**: queue consumers, WebSocket servers, IRC/Discord bots, persistent AI agents, daemons that must stay alive between requests.

It is **not** the same thing as `edge-runtime` (BLK-017). The difference:

| Service | Lifetime | Compute model | Best for |
|---|---|---|---|
| `edge-runtime` | ms → seconds | V8 isolate per request | HTTP handlers, edge functions |
| `worker-runtime` | hours → forever | Long-lived OS subprocess | Queue workers, WS servers, daemons |

## Why we win

- **Run customer processes at the edge.** Co-located with their data and users; no cross-region hops on every queue tick.
- **Auto-restart on crash.** Exponential backoff capped at 5 minutes. Crashing 50 times in a row marks the worker `failed` so you do not loop forever.
- **Billed by actual CPU, not idle wall-time.** A WebSocket server with no connected clients pays cents, not dollars.
- **First-class log streaming.** SSE follow mode + 10K-line per-stream ring buffer.
- **Strict resource caps.** Memory enforcement (best-effort RSS in v1, cgroups in v2). Optional wall-clock timeout for finite jobs.

## HTTP control plane

Default port `127.0.0.1:9097`. Set `WORKER_RUNTIME_PORT` to override.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness probe (unauthenticated). |
| `POST` | `/workers` | Register a new worker. |
| `GET` | `/workers` | List workers + their state. |
| `GET` | `/workers/:workerId` | Detail + supervisor state. |
| `DELETE` | `/workers/:workerId` | Stop and deregister. |
| `POST` | `/workers/:workerId/start` | Spawn the process. |
| `POST` | `/workers/:workerId/stop` | Graceful SIGTERM → SIGKILL. |
| `POST` | `/workers/:workerId/restart` | Stop + start. |
| `GET` | `/workers/:workerId/logs` | Snapshot (`?since=<seq>`) or SSE stream (`?follow=1`). |

Every authenticated route requires:

```
Authorization: Bearer ${WORKER_RUNTIME_TOKEN}
```

### Registration body

```json
{
  "workerId": "queue-consumer-1",
  "tenantId": "tenant-acme",
  "tarballUrl": "https://cdn.example.com/build-abc123.tar.gz",
  "sha256": "<64 hex chars — verified before extract>",
  "command": ["bun", "run", "worker.ts"],
  "env": { "NODE_ENV": "production" },
  "secrets": { "DB_URL": "postgres://..." },
  "limits": {
    "cpuShares": 1024,
    "memBytes": 268435456,
    "timeoutMs": null
  },
  "restartPolicy": "on-failure",
  "gracePeriodMs": 10000
}
```

Note that `secrets` are merged into the child process environment but never echoed in any list/detail response — only the keys are returned.

## Lifecycle

```
                 ┌──────────┐
        register │ stopped  │
        ────────▶│          │
                 └────┬─────┘
                      │ POST /start
                      ▼
                 ┌──────────┐ exit==0     ┌──────────┐
                 │ starting │ & on-failure│ stopped  │
                 └────┬─────┘ ─────────▶  └──────────┘
                      │ spawned
                      ▼
       ┌────────▶┌──────────┐
       │         │ running  │ exit!=0   ┌──────────┐ backoff fires ┌──────────┐
       │         └────┬─────┘ ─────────▶│ crashed  │ ─────────────▶│ starting │
       │              │ POST /stop      └──────────┘                └──────────┘
       │              ▼                       │ maxRestarts reached
       │         ┌──────────┐                  ▼
       │         │ stopped  │              ┌──────────┐
       │         └──────────┘              │ failed   │
       │                                    └──────────┘
       │ POST /restart
       └─────────────────────────────────────────────────
```

### Restart policies

| Policy | Clean exit (code 0) | Failure (non-zero / signal) |
|---|---|---|
| `always` | restart | restart |
| `on-failure` (default) | stop | restart |
| `never` | stop | crashed (no restart) |

Failed restarts use exponential backoff: `1s, 2s, 4s, 8s, …` capped at **5 minutes**. After `maxRestarts` (default 50) failed attempts the worker is marked `failed` and the supervisor stops scheduling restarts. A subsequent `POST /workers/:id/start` resets the counter.

### Stop semantics

`/stop` sends `SIGTERM`, then waits up to `gracePeriodMs` (default 10 s) for the process to exit cooperatively. After the grace period, the supervisor sends `SIGKILL`. An intentional `/stop` is **never** interpreted as a crash — even if the customer process exits non-zero, the supervisor transitions to `stopped` and does not schedule a restart.

## Resource enforcement (v1)

| Resource | v1 enforcement | v2 plan |
|---|---|---|
| Memory | RSS sampled every `memorySampleIntervalMs` (default 1 s); SIGKILL if RSS > `memBytes` | Linux cgroups (`memory.max`) |
| CPU | None — `cpuShares` is documented intent only | Linux cgroups (`cpu.weight`) |
| Wall-clock | Per-process `timeoutMs` if set | unchanged |

The default RSS reader returns `-1` ("unavailable"); when that happens the supervisor logs nothing and skips the kill, so v1 is safe on platforms where Bun does not expose per-subprocess RSS. Operators on Linux can swap in a `/proc/<pid>/statm`-based reader through the `ProcessSpawner` interface.

## Log API

- **Snapshot mode**: `GET /workers/:id/logs?since=<seq>` returns `{ workerId, count, lines: LogLine[] }`. `since` is the last `sequence` you saw; lines are returned in monotonic order.
- **Follow mode**: `GET /workers/:id/logs?follow=1` returns an SSE stream (`text/event-stream`). The first frames flush the backlog; subsequent frames are live.

The ring buffer keeps the last **10 000 lines per stream per worker** (so up to 20 000 total). Older lines are evicted in FIFO order. Production deployments forward to Loki via OpenTelemetry — see `services/analytics`.

## Environment variables

| Variable | Default | Required |
|---|---|---|
| `WORKER_RUNTIME_TOKEN` | — | yes (≥ 8 chars) |
| `WORKER_RUNTIME_HOST` | `127.0.0.1` | no |
| `WORKER_RUNTIME_PORT` | `9097` | no |

## Tests

```sh
bun test services/worker-runtime
```

Tests are deterministic — the spawner, tarball preparer, and clock are all injected via interfaces (`ProcessSpawner`, `TarballPreparer`, `TimerLike`). No real `Bun.spawn` is invoked in CI.

## Storage

- **v1**: in-memory registry. A runtime restart loses every registration; the deploy-agent service is expected to re-register on boot.
- **v2 (planned)**: Turso-backed registry so a restart resumes supervision without external help. Schema lives in `packages/db/schema/worker-runtime.ts` (TBD).
