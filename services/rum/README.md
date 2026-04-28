# @back-to-the-future/rum — Crontech Real User Monitoring

Privacy-first Real User Monitoring for Crontech-hosted apps. A direct,
purposeful answer to Vercel Speed Insights — built smaller, faster, and
without cookies.

> **BLK-027 — Wave 3 of the Vercel-sweep.**
> Beats Speed Insights on three axes:
> 1. **Privacy** — zero cookies, zero localStorage, zero fingerprinting.
> 2. **Granularity** — per-route P50 / P75 / P95 / **and P99** (Vercel ships P75 only on the public dash).
> 3. **Footprint** — beacon ships at **847 bytes gzipped** vs Speed Insights ~3 KB. Hard-failed in CI if it ever exceeds 2 KB.

---

## Architecture

Two cooperating parts:

| Part | Path | Role |
| --- | --- | --- |
| **Beacon** | `src/beacon/index.ts` | Tiny browser snippet. Captures Web Vitals + nav timing. Batches and ships on `pagehide` via `sendBeacon`. |
| **Collector** | `src/collector/` | Hono service. Validates batches, ingests into a per-tenant ring buffer, lazily computes percentiles. |

Build artifacts land in `dist/beacon/rum.min.js` (and `.gz`). Beacon size is
asserted in `test/beacon-build.test.ts` so the budget is enforced on every
test run.

---

## Embedding the beacon

Customers add a single script tag. There is nothing else to wire up.

```html
<script>
  window.__RUM__ = {
    tenant: "your-tenant-id",   // required for stats grouping
    endpoint: "/rum/v1/collect", // optional; default is same origin
    sample: 1                    // optional; 0..1 sample rate (default 1.0)
  };
</script>
<script src="https://your-host/rum.min.js" async></script>
```

That's it. The beacon attaches `pagehide` and `visibilitychange` listeners
and ships a single batched POST when the page goes away. There is no other
network traffic, no service worker, no background polling.

---

## Captured metrics

| Metric | Source | Notes |
| --- | --- | --- |
| **LCP** | `largest-contentful-paint` PerformanceObserver | Latest entry wins. |
| **CLS** | `layout-shift` PerformanceObserver | Sums shifts without recent input. |
| **INP** | `event` PerformanceObserver | Worst (max) interaction duration. |
| **FCP** | `paint` PerformanceObserver | First contentful paint. |
| **TTFB** | navigation timing | `responseStart - requestStart`. |

We also attach the **route**, **viewport**, **deviceMemory** (coarse), and
**connection.effectiveType** for every batch. No IPs, no user-agents, no
identifiers, no cookies.

---

## Privacy posture

- **No cookies. No localStorage. No fingerprinting.**
- **Anonymous batches.** The only identifier in the payload is the *tenant
  id*, which is your customer-facing slug — it is per-customer, not per-user.
- **Sample rate is configurable** (0..1). A page that loads with `sample: 0`
  ships nothing.
- **Ingest endpoint is open-CORS** by design (random customer origins call
  it). Stats endpoints are locked to a configurable allow-list.
- **Bring-your-own retention.** The default in-memory store is a per-tenant
  ring buffer (100 K samples). Production uses Turso v2 (BLK-027 phase 2).

---

## Stats endpoints

Bearer-style: stats and timeseries endpoints are tenant-scoped. The default
resolver reads `x-tenant-id` and falls back to a subdomain.

### `GET /rum/v1/stats?route=&metric=&since=`

Returns the P50/P75/P95/P99 quartet for every metric (or the filtered one).

```json
{
  "tenant": "acme",
  "stats": {
    "LCP": { "p50": 1500, "p75": 1900, "p95": 2400, "p99": 2800, "count": 1280 },
    "CLS": { "p50": 0.04, "p75": 0.06, "p95": 0.12, "p99": 0.21, "count": 1280 },
    "INP":  { "p50": 80, "p75": 110, "p95": 200, "p99": 320, "count": 1280 },
    "FCP":  { "p50": 700, "p75": 900, "p95": 1300, "p99": 1700, "count": 1280 },
    "TTFB": { "p50": 200, "p75": 280, "p95": 500, "p99": 720, "count": 1280 }
  }
}
```

### `GET /rum/v1/timeseries?metric=LCP&bucket=1m|5m|1h&route=&since=`

Returns bucketed percentile points for charting.

```json
{
  "tenant": "acme",
  "metric": "LCP",
  "bucket": "1m",
  "points": [
    { "bucketStart": 1730000000000, "p50": 1500, "p75": 1900, "p95": 2400, "p99": 2800, "count": 42 }
  ]
}
```

### `POST /rum/v1/collect`

Beacon target. Accepts `application/json`, including `Content-Encoding: gzip`.
Per-IP rate limited (default 600 req/min, burst 60). Schema-validated.
Payloads over 64 KB rejected; gzipped payloads decompressed up to 1 MiB.

---

## Build & test

```bash
bun install
bun run build:beacon   # writes dist/beacon/{rum.min.js,rum.min.js.gz} and asserts <= 2 KB gz
bun test               # 33 tests, 5 files
bunx tsc --noEmit
bunx biome check .
```

### Current footprint

| Artifact | Size |
| --- | --- |
| `dist/beacon/rum.min.js`     | **1647 bytes** (minified) |
| `dist/beacon/rum.min.js.gz`  | **847 bytes** (gzipped, level 9) |
| Budget                       | 2048 bytes gzipped (CI fails over) |

---

## Status

- ✅ BLK-027 v1: in-memory store, Hono collector, beacon + budget gate.
- 🟡 BLK-027 v2 (next): Turso-backed persistence, per-route dashboards in
  `apps/web`, alerting on regressions detected via Sentinel.

If we're missing a metric a competitor has — open an issue and Sentinel will
have it tracked by Monday.
