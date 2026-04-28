# @back-to-the-future/cron-scheduler

The Crontech cron primitive — Render's cron jobs / Vercel cron, but
AI-native and edge-deployable. A 1-second-resolution scheduler with
per-job timezones, exponential-backoff retries, dead-letter queue, and
a typed HTTP control plane.

## Architecture

```
HTTP API ──> JobRegistry <── Scheduler tick-loop ──> Dispatcher ──> target
                 │                                       │
                 └─ runs[] ◀────────────────────────────┘
                 └─ deadLetter[] ◀── retry exhaustion ──┘
```

- **Parser** (`parser.ts`) — 5-field cron grammar plus `@hourly` / `@daily`
  / `@weekly` / `@monthly` / `@yearly` shortcuts. `nextFire` walks
  forward in 1-minute steps in the job's IANA timezone, honoring DST
  forward-jumps (skipped local minutes are silently skipped) and
  fall-back (ambiguous local times fire on the FIRST matching UTC
  instant only).
- **Registry** (`registry.ts`) — in-memory job store + per-job run
  history (last 500) + global dead-letter ring buffer (last 1000).
  Storage-agnostic interface — swap for Drizzle/Turso without touching
  the scheduler.
- **Scheduler** (`scheduler.ts`) — 1s-resolution tick loop. On each
  tick: schedule jobs without a `nextRunAt`, dispatch every job whose
  `nextRunAt <= now`, retry on failure with exponential backoff, then
  re-schedule the next fire-time.
- **Dispatcher** (`dispatcher.ts`) — HTTP-call abstraction (mocked in
  tests via the `Transport` injection point). Single attempt, 30s
  default timeout. The scheduler owns retry semantics.
- **Server** (`server.ts`) — pure `fetch(request)` handler so the
  control plane can run on Bun, Node, or Cloudflare Workers without
  changes.

## Cron grammar

```
┌───────── minute       (0–59)
│ ┌──────── hour         (0–23)
│ │ ┌─────── day-of-month (1–31)
│ │ │ ┌────── month        (1–12 or JAN–DEC)
│ │ │ │ ┌───── day-of-week  (0–7 or SUN–SAT; both 0 and 7 = Sunday)
│ │ │ │ │
* * * * *
```

Each field supports `*`, integer literals, ranges (`a-b`), lists
(`a,b,c`), and steps (`*/n`, `a-b/n`). Day-of-month and day-of-week
follow Vixie-cron OR semantics: when BOTH are restricted, the job
fires when EITHER matches.

Shortcuts: `@yearly` (`@annually`), `@monthly`, `@weekly`, `@daily`
(`@midnight`), `@hourly`.

## Timezone behaviour

Each job carries a `tz` field (default `UTC`) — any IANA zone the host
runtime's `Intl.DateTimeFormat` supports.

- **Forward DST jumps** (e.g. 02:00 doesn't exist on US spring-forward
  Sunday): the matching minute is silently skipped. A `0 2 * * *` rule
  fires the next valid 02:00.
- **Backward DST jumps** (e.g. 01:00 exists twice on US fall-back
  Sunday): the rule fires on the FIRST matching UTC instant only.

## Retry policy

```ts
retryPolicy: {
  maxAttempts: 3,        // total attempts including the first
  backoffMs: 1_000,      // initial delay
  maxBackoffMs: 300_000  // cap on a single backoff (default 5m)
}
```

Backoff is exponential with factor 2: `backoffMs * 2^(attempt - 1)`,
capped at `maxBackoffMs`. After the final attempt fails, the run is
recorded with `terminal: true` and an entry is appended to the
dead-letter queue for the tenant.

## Dispatcher targets

| `target.type`   | Semantics |
|-----------------|-----------|
| `edge-runtime`  | Fire-and-poll into the Crontech edge-runtime worker  |
| `worker`        | Direct invocation of a worker-runtime instance       |
| `webhook`       | Generic HTTP POST to an arbitrary endpoint           |

All three currently share the same HTTP fetch transport — the type is
recorded for routing/observability and to let the AI optimiser v2
reason about them differently. Each request includes:

```
content-type:        application/json
x-cron-job-id:       <job id>
x-cron-tenant-id:    <tenant id>
x-cron-attempt:      <attempt number, 1-indexed>
x-cron-scheduled-for: <ms-epoch of the scheduled fire-time>
```

## HTTP API

All routes require `Authorization: Bearer $CRON_SCHEDULER_TOKEN`.

| Method | Path                       | Description |
|--------|----------------------------|-------------|
| GET    | `/health`                  | liveness probe |
| GET    | `/jobs?tenantId=&status=`  | list jobs (filterable) |
| POST   | `/jobs`                    | create job, returns next-5 fire-time preview |
| GET    | `/jobs/:id`                | current state + last 20 runs |
| DELETE | `/jobs/:id`                | remove job + history |
| POST   | `/jobs/:id/pause`          | pause |
| POST   | `/jobs/:id/resume`         | resume |
| POST   | `/jobs/:id/trigger`        | manual fire (bypasses schedule) |
| GET    | `/jobs/:id/runs?since=`    | execution history (ms-epoch since) |
| GET    | `/dead-letter?tenantId=`   | dead-lettered runs |

## Environment variables

| Variable                | Default   | Description |
|-------------------------|-----------|-------------|
| `CRON_SCHEDULER_TOKEN`  | (required) | Bearer token for every API call |
| `CRON_SCHEDULER_PORT`   | `8787`     | HTTP listen port |
| `CRON_SCHEDULER_HOST`   | `0.0.0.0`  | HTTP bind hostname |

## AI optimiser v2 hook

The `Scheduler` accepts an `onEvent` callback that fires for every
state transition (`scheduled`, `dispatching`, `run-complete`,
`dead-letter`, `skipped`). The v2 schedule optimiser plugs into this
stream to detect chronically-failing jobs, suggest backoff tuning,
and reroute targets between the three compute tiers.

## Testing

```bash
bun test services/cron-scheduler
```

Tests cover: parser correctness on canonical examples, DST forward and
backward edge cases, scheduler tick semantics with a virtual clock,
retry + exponential-backoff timing, dead-letter on exhaustion, pause /
resume, manual trigger, and the full HTTP CRUD surface.
