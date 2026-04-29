# @back-to-the-future/region-orchestrator

Multi-region auto-scaling orchestrator for customer services deployed via
`@back-to-the-future/deploy-orchestrator`.

The service tracks per-region traffic for each customer service, predicts
next-hour QPS with a lightweight EMA + day-of-week seasonality model, and
emits cost-aware scaling decisions that respect a latency budget.

## Why this exists

Vercel and Cloudflare auto-scale globally but charge by request count and
egress. Crontech auto-scales **per region** with full cost-awareness — when
latency permits, traffic concentrates in the cheapest region; when latency
is under pressure, the orchestrator widens to more regions immediately. v2
upgrades the in-process predictor for a learned model running on the GPU
tier; the decision engine is decoupled via the `TrafficPredictor` interface
so the swap is transparent.

## Architecture

```
┌──────────────────┐   POST /services/:id/state   ┌────────────────────┐
│ deploy-orch +    │ ───────────────────────────► │ region-orchestrator│
│ telemetry source │                               │  ┌──────────────┐ │
└──────────────────┘                               │  │ ServiceStore │ │
                                                   │  └──────┬───────┘ │
                                                   │         ▼         │
                                                   │  ┌──────────────┐ │
                                                   │  │  Predictor   │ │
                                                   │  └──────┬───────┘ │
                                                   │         ▼         │
                                                   │  ┌──────────────┐ │
                                                   │  │ decideScaling│ │
                                                   │  └──────┬───────┘ │
                                                   └─────────┼─────────┘
                                                             ▼
                                            GET /services/:id/decision
                                            → { actions: [ScaleAction] }
```

## Decision algorithm

The decision engine is a pure function (`src/decision.ts → decideScaling`).

1. **Predict** next-hour QPS per region using the configured predictor.
2. **Desire** = ⌈predicted QPS / target QPS-per-instance⌉, capped by region
   capacity headroom (region capacity minus other services' load).
3. **Latency override**: if observed p95 in a region exceeds
   `latencyBudgetMs`, the engine never scales it down and adds one extra
   instance to absorb pressure.
4. **Cost fit**: regions are sorted cheapest → most-expensive. While total
   projected hourly cost exceeds `costBudgetUsdPerHour`, the engine trims
   one instance from the most expensive non-pressured region. Repeats until
   under budget.
5. **Cooldown**: if any state for the service has scaled within
   `SCALE_COOLDOWN_MS` (5 minutes), the decision returns
   `cooldownActive: true` and emits no actions. Prevents oscillation.

The output is a `ScalingDecision` with one `ScaleAction` per region whose
target instance count differs from the current state.

## Predictor

`src/predictor.ts → EmaSeasonalPredictor` is the v1 implementation:

- **EMA** (default α = 0.3) over the past week of QPS samples per region.
- **Day-of-week factor** = mean QPS at the same UTC weekday and hour
  divided by the global mean of the window. Multiplied with the EMA to
  produce the predicted value.
- Forecasts `HOURLY_FORECAST_POINTS` (12 = every 5 min for 1 hour).

Implementations swap freely via the `TrafficPredictor` interface.

## Region model

```ts
type Region = {
  id: string;          // unique slug — primary key
  code: string;        // kebab-case, 2..16 chars
  location: string;    // human-readable name
  capacity: number;    // total instance ceiling across ALL services
  currentLoad: number; // total instances scheduled across ALL services
  costPerHour: number; // marginal USD per instance per hour
};
```

`capacity` and `currentLoad` are tracked at the region level (not per
service) so the engine can compute *headroom available to this service*
as `capacity - max(0, currentLoad - thisServiceInstances)`.

## HTTP API

| Method | Path | Auth | Body / Notes |
|---|---|---|---|
| `GET` | `/regions` | public | list regions |
| `POST` | `/regions` | admin | upsert a region (Zod-validated) |
| `DELETE` | `/regions/:id` | admin | delete a region |
| `POST` | `/services/:id/state` | public | submit current state + traffic window |
| `GET` | `/services/:id/decision` | public | compute & return next decision |
| `GET` | `/services/:id/predictions` | public | return forecast series for the service |

Admin endpoints expect `Authorization: Bearer <ADMIN_TOKEN>`.

## Environment variables

| Var | Required | Default | Purpose |
|---|---|---|---|
| `REGION_ORCH_ADMIN_TOKEN` | yes | — | Bearer token guarding region CRUD endpoints |
| `REGION_ORCH_PORT` | no | `8787` | HTTP port for the standalone server entry |

## Usage (embedding)

```ts
import { createServer } from "@back-to-the-future/region-orchestrator";

const { fetch } = createServer({
  adminToken: process.env.REGION_ORCH_ADMIN_TOKEN!,
});

Bun.serve({ port: 8787, fetch });
```

## Scripts

```bash
bun test           # run unit + integration tests
bun run check      # tsc --noEmit
bun run lint       # biome check .
```

## Status

v1 — in-memory store, EMA + DoW predictor, cost-aware fitting, cooldown.
v2 (planned): Turso persistence, learned predictor on GPU tier,
multi-tenant isolation per service group.
