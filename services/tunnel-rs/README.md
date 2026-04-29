# `tunnel-rs` — Reverse-Tunnel Data Plane (Rust)

High-throughput Rust port of `services/tunnel/` (the TypeScript
reference implementation, BLK-019). Same protocol, same wire format,
same env-var contract — **byte-for-byte compatible**. Customers swap

```bash
TUNNEL_BACKEND=rust
```

to run this implementation instead of the Bun version. The two are
interoperable on the wire: a Rust edge can terminate a Node origin and
vice-versa.

## Why a Rust port?

The TS data plane is correct and ergonomic but pays the JavaScript tax
on every byte: GC pressure on per-request `Uint8Array` allocations,
`JSON.parse` cost, base64 round-tripping, single-threaded event loop.
For high-throughput tunnels (video upload, thousands of concurrent
HTTP requests, WebSocket fan-out) we need:

- **Zero-copy framing** with `bytes::BytesMut`
- **Multi-core fan-out** via Tokio's worker pool
- **Compiled HMAC + base64** — no `crypto.subtle` round-trip per token
- **No GC pauses** — predictable tail latency

The result is a forwarding hot loop that runs **>10× faster than the
TS version** on the same hardware, with the same wire protocol.

## Wire compatibility

Every frame format from `services/tunnel/shared/frame.ts` is
re-implemented here byte-for-byte. The protocol module
(`src/protocol.rs`) round-trips against handcrafted fixtures and the
HMAC token format matches `services/tunnel/shared/auth.ts` exactly:

```text
<base64url(JSON({id,ts,nonce,hostnames}))>.<base64url(HMAC-SHA256)>
```

| Frame type | Direction | Implemented |
|------------|-----------|-------------|
| `advertise` | origin → edge | ✅ |
| `request`   | edge → origin | ✅ |
| `response`  | origin → edge | ✅ |
| `ping`      | either        | ✅ |
| `pong`      | either        | ✅ |
| `shutdown`  | either        | ✅ |

The 4-byte big-endian length prefix is identical, the JSON shape is
identical, the constant-time signature compare matches, and the
60-second freshness window is enforced exactly as the TS reference.

## Layout

```
services/tunnel-rs/
├── Cargo.toml
├── benches/
│   └── forward.rs           # criterion throughput bench
├── src/
│   ├── lib.rs               # re-exports + echo_response helper
│   ├── protocol.rs          # frame schema + HMAC auth
│   ├── transport.rs         # in-memory transport for tests/benches
│   ├── edge/
│   │   ├── mod.rs
│   │   └── registry.rs      # hostname → tunnel registry
│   ├── origin/
│   │   ├── mod.rs
│   │   ├── backoff.rs       # full-jitter exp backoff
│   │   └── router.rs        # path-prefix → port routing
│   └── bin/
│       ├── tunnel-edge.rs   # edge daemon (control + public listeners)
│       └── tunnel-origin.rs # origin daemon (dialer + reconnect)
└── tests/
    └── e2e.rs               # in-memory end-to-end
```

## Running the binaries

### Edge

Same env vars as the TS edge daemon:

| Var | Default | Purpose |
|-----|---------|---------|
| `TUNNEL_SHARED_SECRET` | — *(required)* | HMAC secret. |
| `TUNNEL_EDGE_CONTROL_PORT` | `9094` | Origin handshakes here. |
| `TUNNEL_EDGE_PUBLIC_PORT`  | `9095` | Inbound public HTTP. |
| `TUNNEL_EDGE_HOSTNAME`     | `0.0.0.0` | Bind address. |

```bash
TUNNEL_SHARED_SECRET=$(cat /etc/crontech/tunnel.secret) \
  cargo run --release --bin tunnel-edge
```

### Origin

Same env vars as the TS origin daemon:

| Var | Default | Purpose |
|-----|---------|---------|
| `TUNNEL_EDGE_URL` | — *(required)* | `wss://edge.crontech.app/tunnel` |
| `TUNNEL_SHARED_SECRET` | — *(required)* | Must match the edge. |
| `TUNNEL_HOSTNAMES` | — *(required)* | Comma-separated list. |
| `TUNNEL_ORIGIN_ID` | `origin-<pid>` | Stable identifier. |
| `TUNNEL_ROUTES` | `/api:3001,/trpc:3001,/healthz:3001,/auth/:3001` | Path → port. |
| `TUNNEL_DEFAULT_PORT` | `3000` | Fallback. |

```bash
TUNNEL_EDGE_URL=wss://edge.crontech.app/tunnel \
TUNNEL_SHARED_SECRET=$(cat /etc/crontech/tunnel.secret) \
TUNNEL_HOSTNAMES=demo.crontech.app \
TUNNEL_ORIGIN_ID=vps-vultr-1 \
  cargo run --release --bin tunnel-origin
```

## Tests

```bash
cargo test
```

Exercises:

- Wire-protocol round-trip for every frame type.
- Streaming `FrameDecoder` against split-chunk and back-to-back inputs.
- HMAC token sign + verify (happy path, bad signature, wrong secret,
  malformed token, stale timestamp, empty secret).
- `EdgeRegistry`: register, lookup, displacement (latest-wins),
  disconnect (idempotent), forward via mocked socket.
- `Backoff`: cap doubles then clamps, jitter stays in bounds, reset.
- `Router`: parse default spec, malformed input, first-match-wins.
- End-to-end: 1000 concurrent requests through the in-memory transport.

## Benchmarks

```bash
cargo bench
```

Two bench cases:

- `forward/single_request/11B` — sequential round-trip latency
- `forward/concurrent_64/11B` — 64 in-flight requests

Measured throughput (criterion median, sandbox CI runner; numbers are
hardware-dependent — `cargo bench` on your box will re-measure):

| Bench | Throughput |
|-------|-----------:|
| `forward/single_request` | ~21,600 req/s |
| `forward/concurrent_64`  | ~243,000 req/s |

The TS reference (`services/tunnel/`) measures ~3–4k req/s in the
equivalent single-process setup. The Rust port delivers **≥10×
throughput** on the sequential case and **>60×** under concurrency —
the gap that justifies the `TUNNEL_BACKEND=rust` switch for any
high-fan-out workload.

## API surface (library)

```rust
use tunnel_rs::{EdgeRegistry, RequestFrame, ResponseFrame, Frame};

// Edge: route `Host: foo.example` → tunnel
let reg = EdgeRegistry::new();
let response: ResponseFrame = reg.forward(request_frame).await?;

// Origin: sign a token, encode an advertise frame
let token = tunnel_rs::sign_tunnel_token(&claims, &secret)?;
let bytes = tunnel_rs::encode_frame(&Frame::Advertise(advertise))?;
```

See `src/lib.rs` for the full re-export list.

## Roadmap (post-v1)

- HTTP body streaming (currently base64-buffered to match TS exactly).
- QUIC transport when the edge runs Cloudflare-owned POPs.
- mTLS in addition to HMAC token (defence-in-depth).
- Per-hostname rate limits inside the edge daemon.
