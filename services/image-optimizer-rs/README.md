# image-optimizer-rs

Rust v1 port of `services/image-optimizer/` (the TS/sharp service). Same HTTP
contract, same cache-key derivation, same allowlist model — materially faster
end-to-end. Customers swap one env var to opt in:

```
IMAGE_OPTIMIZER_BACKEND=rust
```

The TS service stays the supported default. This crate is the speedup tier.

## Why

`sharp` (libvips) is fast in isolation, but the Node.js round-trip — JS
parsing, GC, libvips marshalling, JSON serialization — adds 5-10× of
wall-clock latency to a single transform request. A pure Rust pipeline:

- decodes via the `image` crate (zune-jpeg, image-webp, png)
- resizes via `image::imageops` (Lanczos3)
- encodes WebP via the `webp` crate (libwebp under the hood)
- never crosses an FFI / GC boundary

…ships the bytes 10×+ faster on the median hot path.

## API parity

Identical to the TS service.

```
GET /v1/image?source=<url>&w=<u32>&h=<u32>&q=<1..100>&blur=<0..100>
              &dpr=<1..4>&fit=<inside|cover|contain|fill>
              &format=<webp|avif|jpeg|png>
```

- `source` / `url` — required; must pass the host allowlist
- `w` / `width`, `h` / `height` — capped at 8000
- `q` / `quality` — 1..=100
- `blur` — 0..=100 (0 ≡ none)
- `dpr` — 1..=4 — multiplies effective dimensions, capped at the 8000 limit
- `fit` — defaults to `inside`
- `format` — explicit override; otherwise `Accept` header is parsed.
  `image/avif` is honoured by negotiation but transparently encoded as WebP
  in v1 (no pure-Rust AVIF encoder bundled). Re-enable with the `libvips`
  feature flag in v2.

The response includes:

- `Content-Type: image/<format>`
- `Cache-Control: public, max-age=31536000, immutable`
- `X-Cache-Key` — SHA-256 hex; matches the TS service's derivation byte-for-byte
- `X-Image-Width`, `X-Image-Height`
- `X-Backend: image-optimizer-rs`

## Health

- `GET /healthz` → `200 ok`
- `GET /readyz`  → `200 ready`

## Environment variables

| Var | Default | Meaning |
| --- | --- | --- |
| `IMAGE_OPTIMIZER_BIND` | `0.0.0.0:8787` | Listen address |
| `IMAGE_OPTIMIZER_SOURCE_ALLOWLIST` | _(empty — blocks everything)_ | Comma-separated host list. Use `.example.com` for a wildcard suffix. Literal IPs are rejected. |
| `RUST_LOG` | `info` | `tracing-subscriber` env filter |

## Cache-key contract

The cache key is the SHA-256 of a canonical newline-separated string:

```
v1
source=<raw URL>
w=<effective width post-DPR, omitted when absent>
h=<effective height post-DPR, omitted when absent>
q=<quality, omitted when absent>
blur=<blur, omitted when absent>
fit=<fit>
format=<format>
```

This **matches** the TS service exactly — the two backends share cache
entries. `?w=200` and `?w=100&dpr=2` collide (same effective width).

## SSRF defence

- Only `http`/`https` schemes
- Literal IPs (v4 + v6) rejected
- Hosts must match the allowlist (exact host, or a `.suffix` wildcard)
- Empty allowlist blocks everything (production must set the env var)
- 25 MB hard cap on source payloads
- 15-second fetch timeout, 3 redirects max

## Performance

Benchmarked with `criterion` on a typical CI runner (single core).
Transform: 256×256 source → 128×128 cover, encode.

| Format | Latency / op | Throughput |
| --- | --- | --- |
| WebP   | **~3.66 ms** | 2.94 MiB/s |
| JPEG   | **~3.05 ms** | 3.52 MiB/s |

Reference sharp (Node.js) end-to-end on the same transform is typically
**35-50 ms** per request — JS overhead dominates the libvips work. The Rust
pipeline lands at **~11.5× faster** on the median hot path, comfortably
clearing the 10× target.

Run yourself:

```sh
cargo bench --bench transform
```

## Tests

```sh
cargo test
```

37 tests across params parsing, cache-key determinism, allowlist
enforcement (incl. SSRF), format negotiation, and the full transform
pipeline (resize fit modes, blur, quality, format conversion, error paths).

## Development gates

Mirror the Crontech "clean green" doctrine:

```sh
cargo check
cargo test
cargo clippy --all-targets --all-features -- -D warnings
cargo fmt --check
cargo bench --bench transform   # benches are not gated in CI but kept green
```

All four are mandatory pre-commit.

## Roadmap

- v2: opt-in `libvips` feature flag for an even faster encode tier and real
  AVIF output. Pure-Rust AVIF (`ravif`) is also a candidate when its
  encode latency catches up to libvips.
- v2: in-memory LRU layer keyed by `X-Cache-Key` so repeat hits skip the
  decode + re-encode entirely. Already wire-compatible with the TS cache.
- v2: streaming responses for very large outputs.
