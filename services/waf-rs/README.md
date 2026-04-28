# waf-rs — Rust WAF for Crontech

API-compatible Rust port of `services/waf` (the TypeScript WAF). Same wire
contract, same admin routes, same rule schema. Drop-in replacement for hosts
that flip `WAF_BACKEND=rust`.

The hot path (per-request rule evaluation, OWASP default pack, scanner-UA scan,
rate-limit lookup) is rebuilt on top of [`aho-corasick`][ac] for SIMD-accelerated
multi-pattern matching, plus pre-compiled [`regex::RegexSet`][rs] for the
residual structural patterns. Together they pull per-request throughput up by
roughly 16-80× versus the JS pipeline.

[ac]: https://crates.io/crates/aho-corasick
[rs]: https://docs.rs/regex/latest/regex/struct.RegexSet.html

## Features

- Identical evaluation order to the TypeScript reference (see `src/rules.rs`
  doc comment for the byte-for-byte pipeline).
- Aho-Corasick automatons for SQLi/XSS/traversal/scanner-UA/bot-UA matching —
  one DFA pass over the haystack instead of N regex applications.
- Pre-compiled per-rule regexes cached on the registry; the hot path never
  re-compiles a pattern.
- Token-bucket + sliding-window rate limiters with deterministic clock injection.
- Axum 0.7 admin server matching the TS Hono routes byte-for-byte.

## API surface (parity with `services/waf`)

| Method | Path | Body | Behaviour |
|---|---|---|---|
| `GET` | `/healthz` | — | `{ "ok": true, "service": "waf-rs" }` |
| `GET` | `/admin/tenants/:tenantId/rules` | — | `{ "rules": [...] }` |
| `POST` | `/admin/tenants/:tenantId/rules` | `NewRule` JSON | `{ "rule": {...} }` 201, validation 400 |
| `DELETE` | `/admin/tenants/:tenantId/rules/:ruleId` | — | `{ "deleted": true }` 200 / 404 |
| `GET` | `/admin/tenants/:tenantId/events?since=<ms>&limit=<n>` | — | `{ "events": [...] }` |

All admin routes require `Authorization: Bearer $WAF_ADMIN_TOKEN`.

## Environment variables

| Var | Required | Default | Purpose |
|---|---|---|---|
| `WAF_ADMIN_TOKEN` | yes | — | Bearer token for the admin API. |
| `PORT` | no | `8788` | TCP listen port. |
| `RUST_LOG` | no | `info` | `tracing-subscriber` filter. |

## Run

```bash
WAF_ADMIN_TOKEN=secret cargo run --release
```

## Test

```bash
cargo test                 # unit + integration suite (28 tests)
cargo clippy --all-targets -- -D warnings
cargo fmt --check
```

## Benchmark

```bash
cargo bench --bench eval
```

Captured on the build machine (rustc 1.94.1, release profile, single core):

| Scenario | Time | Throughput | vs TS baseline (~50K eval/s) |
|---|---|---|---|
| `evaluate_clean_request` | **1.245 µs** | ~**803,000 eval/s** | **~16×** |
| `evaluate_sqli_hit` | **537 ns** | ~**1.86M eval/s** | **~37×** |
| `evaluate_scanner_ua` | **244 ns** | ~**4.1M eval/s** | **~82×** |

The "clean request" path covers the full pipeline: 11 rules, regex path match,
OWASP scan over pathname + query, bot detection, rate-limit token bump. Even on
the worst-case path we stay well above the §6.6 budget for "API response (edge)
< 50ms" — a single eval call takes roughly **1/40,000th** of that budget.

## Roadmap

- v2: persist rules + events to Turso so deploys don't lose state.
- v2: multi-region rule sync via Durable Object fan-out.
- v3: WASM build for in-browser rule preview during admin authoring.
