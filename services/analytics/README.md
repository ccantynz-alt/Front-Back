# `@back-to-the-future/analytics`

> First-party, privacy-first product analytics for Crontech.
> Plausible-class drop-in. Per-route P50/P95-ready sub-1ms aggregation.
> 832-byte (gzipped) beacon. No cookies. No localStorage. GDPR-immune by design.

This service is the **product analytics layer** for Crontech: pageviews,
events, sessions, funnels, bounces, UTMs, top-N rankings.

It is *not* the same thing as `services/rum/` — that's the
performance-metrics service (Web Vitals: LCP/CLS/INP/FCP/TTFB). Both
services are first-party, both ship a beacon, both are tenant-scoped.
They serve different audiences:

| Concern                      | `services/rum/`                  | `services/analytics/`              |
| ---------------------------- | -------------------------------- | ---------------------------------- |
| Captures                     | Web Vitals + nav timing          | Pageviews, custom events, UTMs     |
| Aggregations                 | Percentiles, time-series         | Top-N, bounce, funnels             |
| Audience                     | Engineering / SRE                | Product / growth / marketing       |
| Beacon endpoint              | `POST /rum/v1/collect`           | `POST /a/v1/collect`               |
| Beacon budget                | 2 KB gzipped                     | **1.5 KB gzipped** (currently 832 bytes) |

## Privacy posture

This is the binding contract — every line of this service must respect it.

1. **No cookies. No localStorage. No fingerprinting.** The browser never
   stores a session id. Period.
2. **Raw IP addresses are never persisted.** They land in memory just
   long enough to compute a salted hash, and are never written to disk
   or shipped to a third party.
3. **Session correlation is via a daily-rotating server-side salt.**
   The session id is derived as
   `sha256(salt_for_day(now) || ip || user_agent)[:16]`. The salt
   rotates every UTC day. After rotation, yesterday's session ids
   become uncorrelatable with today's — i.e. an IP address can never be
   linked across days, by design. This matches Plausible's posture.
4. **The salt itself is held in memory only.** A process restart mints
   a fresh salt, breaking in-flight session correlation — this is the
   conservative choice.
5. **No personal data is collected from the client.** The beacon emits
   `{ route, event, props, ts, referrer, utm }`. UTM values come from
   the page URL, never from the device. `props` are application-defined
   and the application owner is responsible for not stuffing PII in
   them — the schema caps each value at 2 KB but does not inspect
   contents.
6. **The beacon never executes third-party code.** All it imports is
   `URLSearchParams` and the standard browser timing APIs.

This means GDPR cookie banners are not required for this analytics
data, and the same applies to ePrivacy / PECR and the California
"sale of personal data" definition under CCPA/CPRA. Consult your
counsel for your specific deployment, but the posture has been
designed to land cleanly inside all three regimes.

## Beacon API

Tag your page like this:

```html
<script>
  window.__ANALYTICS__ = {
    endpoint: "/a/v1/collect",
    tenant: "your-tenant",
    bearer: "optional-public-key",
  };
</script>
<script type="module" src="/dist/beacon/analytics.min.js"></script>
```

The beacon:

- Auto-tracks pageviews on initial load and on every SPA route change
  (`pushState` / `replaceState` / `popstate`).
- Parses UTM parameters out of `location.search` and attaches them to
  the first event of the session.
- Captures `document.referrer` on the first event of the session.
- Batches events in memory and flushes them on `pagehide` /
  `visibilitychange` via `navigator.sendBeacon` (with a `keepalive`
  fetch fallback).
- Exposes `globalThis.__crontechTrack(event, props)` so applications
  can fire custom events from anywhere in the page lifecycle.

```ts
globalThis.__crontechTrack?.("signup", { plan: "pro", source: "cta" });
```

Bundle size is enforced at build time:

```
[analytics] beacon minified: 1473 bytes
[analytics] beacon gzipped : 832 bytes (budget 1536)
```

`bun run build:beacon` fails the build if the gzipped size exceeds the
1.5 KB budget.

## Collector API

The collector is a Hono app that runs anywhere Hono runs (Bun, Node,
Cloudflare Workers).

### `POST /a/v1/collect`

Ingest a batch of events. Wide CORS — beacons can come from anywhere.

Body:

```jsonc
{
  "tenant": "acme",
  "bearer": "optional-public-key",
  "events": [
    {
      "sessionId": "client-pending",  // overwritten server-side
      "route": "/pricing",
      "event": "$pageview",
      "ts": 1714329600000,
      "referrer": "https://google.com",
      "utm": { "source": "twitter", "campaign": "launch" },
      "isEntry": true
    }
  ]
}
```

Notes:

- The client may send any `sessionId`; the server replaces it with the
  daily-salted hash. This means a malicious client cannot forge
  cross-session linkage.
- gzip request bodies are accepted (`Content-Encoding: gzip`), capped
  at 1 MiB decompressed.
- Per-IP rate limited (default 600/min).

### `GET /a/v1/stats`

Tenant-scoped aggregate stats. Tight CORS — only `ANALYTICS_STATS_ORIGINS`.

Query params: `route`, `event`, `since`, `topN` (1-100, default 10).

Returns:

```jsonc
{
  "tenant": "acme",
  "stats": {
    "pageviews": 1234,
    "uniqueSessions": 892,
    "totalEvents": 4321,
    "bounceRate": 0.43,
    "topRoutes":      [{ "route": "/pricing", "count": 412 }, ...],
    "topReferrers":   [{ "referrer": "https://google.com", "count": 188 }, ...],
    "topEvents":      [{ "event": "$pageview", "count": 1234 }, ...],
    "topUtmSources":  [{ "source": "twitter", "count": 92 }, ...],
    "topUtmCampaigns":[{ "campaign": "launch", "count": 60 }, ...]
  }
}
```

### `POST /a/v1/funnel`

Step-by-step conversion through an ordered funnel.

Body:

```jsonc
{
  "steps": ["land", "signup", "purchase"],
  "since": 1714200000000,    // optional
  "windowMs": 1800000        // optional, default 30 min between steps
}
```

Returns:

```jsonc
{
  "tenant": "acme",
  "funnel": {
    "totalSessions": 412,
    "steps": [
      { "step": "land",     "reached": 412, "dropoff": 0,   "conversionFromPrev": 1.0,  "conversionFromStart": 1.0 },
      { "step": "signup",   "reached": 188, "dropoff": 224, "conversionFromPrev": 0.46, "conversionFromStart": 0.46 },
      { "step": "purchase", "reached": 41,  "dropoff": 147, "conversionFromPrev": 0.22, "conversionFromStart": 0.10 }
    ]
  }
}
```

### `GET /healthz`

Liveness — returns `{ ok, samples, day }`.

## Auth

Two modes, both optional:

- **Bearer.** If you wire a `verifyBearer(tenant, bearer)` predicate
  into the deps, the collector and stats endpoints will require it.
  The beacon ships its bearer in the batch body; the stats / funnel
  endpoints require an `Authorization: Bearer …` header.
- **Subdomain.** The default tenant resolver pulls the tenant from the
  request subdomain (`acme.analytics.example.com` → `acme`), or falls
  back to the `X-Tenant-Id` header, or finally to the body's `tenant`.

## Environment variables

| Variable                       | Default                  | Purpose                                          |
| ------------------------------ | ------------------------ | ------------------------------------------------ |
| `PORT`                         | `8788`                   | Server port.                                     |
| `ANALYTICS_STATS_ORIGINS`      | `http://localhost:3000`  | CORS allowlist for stats / funnel endpoints.     |
| `ANALYTICS_COLLECT_PER_MINUTE` | `600`                    | Per-IP token-bucket rate limit on `/a/v1/collect`. |

## Development

```bash
bun install
bun run dev          # Hot-reloading Bun server on :8788
bun run build:beacon # Build + size-check the beacon
bun test             # 36 tests, runs in ~130 ms
bun run check        # tsc --noEmit
```

## Storage

The default store is a tenant-scoped in-memory ring buffer (200K events
per tenant). Aggregations run as a single pass over the ring — sub-1ms
even at full capacity. The `StoredEvent` shape mirrors the Turso v2
schema row-for-row, so the swap-in to durable storage is mechanical.
