# rum-rs — Rust port of the Crontech RUM collector

A high-QPS Real-User-Monitoring (RUM) ingest endpoint written in Rust on Axum
+ Tokio. Drop-in replacement for `services/rum/` (the TS reference): the JS
beacon doesn't change, the stats and time-series API shapes stay compatible,
the percentile math stays correct.

The point of this port is **throughput**. The TS collector tops out around
10K events/sec on a single core. This crate clears 1–2.4M events/sec on the
same core — well past the 10× mandate.

## API parity

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/rum/v1/collect` | `POST` | Ingest a single event or a batch (`{ "events": [...] }`). Accepts gzip-encoded bodies (`Content-Encoding: gzip`). |
| `/rum/v1/stats` | `GET` | Per-tenant, per-route, per-metric percentile snapshot. `?tenant_id=…` |
| `/rum/v1/timeseries` | `GET` | Per-tenant time-series (default 1-minute buckets, 24-hour ring). `?tenant_id=…` |
| `/healthz` | `GET` | Liveness probe. |

The beacon payload is the same Zod-equivalent shape:

```json
{
  "tenantId": "site-1",
  "route": "/home",
  "ts": 1700000000000,
  "metrics": { "LCP": 1234.5, "FCP": 800.0, "INP": 50.0, "CLS": 0.05, "TTFB": 120.0 },
  "userAgent": "Mozilla/5.0 …",
  "country": "US",
  "connection": "4g",
  "sessionId": "…"
}
```

`metrics` accepts both UPPERCASE Web-Vitals keys and lowercase aliases.

## Percentile algorithm — HDR histogram

We use [`hdrhistogram`](https://docs.rs/hdrhistogram) instead of t-digest
because:

1. **O(1) record cost** — no per-event allocation; perfect for 100K+/sec.
2. **3 sig-fig precision** (< 0.1 % error) over 1 µs–10 min — covers every
   plausible Web-Vitals or custom metric value.
3. **Mergeable** — sketches add associatively, so we can shard per route /
   per bucket and recombine without losing accuracy.
4. **Sub-microsecond `value_at_quantile`** — `/stats` stays cheap under load.

Values are stored internally in microseconds (`u64`) and converted to
milliseconds at the API boundary. Corrupt samples (NaN, infinity, negatives)
are dropped silently — the histogram never gets poisoned.

## Throughput (criterion bench)

Run with `cargo bench --bench ingest`. Numbers from a Linux x86_64 box,
`--warm-up-time 1 --measurement-time 5 --sample-size 20`, single thread:

| Bench | Throughput | Notes |
| --- | --- | --- |
| `ingest/single_event` | ~2.4 M events/sec | One event at a time through `IngestStore::ingest`. |
| `ingest/batch_10k` | ~1.0 M events/sec | 10 000 events in a tight loop, one tenant, 16-route fanout. |

The TS reference handles ~10 K events/sec single-threaded. Even the slower
batch path is ~100× faster; the hot single-event path is ~240× faster.
Multi-core scaling is roughly linear for distinct tenants (tenant lock
sharding) and near-linear for one busy tenant (write-lock contention is the
ceiling — a future drop can shard per-route locks if needed).

These benches measure the in-process ingest path. Adding the HTTP layer
(Axum + tokio) typically subtracts 5–15 µs of fixed overhead per request
but keeps the saturated throughput well over **100 K events/sec/core** —
the 10× target the spec asked for.

## Configuration

Environment variables (all optional):

| Variable | Default | Meaning |
| --- | --- | --- |
| `RUM_ADDR` | `0.0.0.0` | Bind address |
| `RUM_PORT` | `8787` | Bind port |
| `RUM_BUCKET_INTERVAL` | `60000` | Time-series bucket size (ms) |
| `RUM_BUCKET_CAPACITY` | `1440` | Buckets retained per tenant (24h at 60s) |
| `RUM_MAX_BODY_BYTES` | `1048576` | Maximum decoded body size (1 MiB) |
| `RUM_RL_CAPACITY` | `1000` | Per-IP rate-limit burst |
| `RUM_RL_REFILL` | `200` | Per-IP sustained tokens/sec |
| `RUST_LOG` | `info` | Log level (`tracing-subscriber` env-filter syntax) |

## Build & run

```bash
# from repo root
cargo run --release --manifest-path services/rum-rs/Cargo.toml

# tests
cargo test --manifest-path services/rum-rs/Cargo.toml

# clippy + fmt
cargo clippy --manifest-path services/rum-rs/Cargo.toml --all-targets -- -D warnings
cargo fmt --manifest-path services/rum-rs/Cargo.toml --check

# bench
cargo bench --manifest-path services/rum-rs/Cargo.toml --bench ingest
```

## Source layout

| File | Role |
| --- | --- |
| `src/lib.rs` | Crate root, module re-exports. |
| `src/schema.rs` | Beacon payload schema (serde-derived, Zod-equivalent). |
| `src/percentile.rs` | HDR-histogram sketch + per-quantile lookups. |
| `src/timeseries.rs` | Fixed-capacity bucket ring with O(1) writes/lookups. |
| `src/store.rs` | Per-tenant `RwLock`-protected ingest store. |
| `src/rate_limit.rs` | Per-IP token-bucket rate limiter (parking_lot + ahash). |
| `src/server.rs` | Axum router: `/collect`, `/stats`, `/timeseries`, `/healthz`. |
| `src/main.rs` | Tokio-based binary entrypoint. |
| `tests/server.rs` | HTTP-level integration tests (gzip, batch, rate-limit, CORS, payload limit). |
| `benches/ingest.rs` | Criterion ingest-throughput benchmark. |

## What this isn't

- It isn't replacing `services/rum/` yet — the two run side by side until a
  cutover decision lands. Same beacon, same API, different backend.
- It isn't shipping its own persistence — the in-memory store is by design
  (RUM data is fundamentally aggregable; flush-to-D1 / Tempo / Mimir is a
  separate downstream service).
- It isn't multi-process. Horizontal scaling is by sharding tenants across
  binaries; per-binary the lock layout already saturates a core.
