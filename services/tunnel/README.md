# `@back-to-the-future/tunnel` — Reverse Tunnel Daemon (BLK-019, v1)

A Cloudflare-Tunnel-class reverse proxy purpose-built for Crontech. The
origin daemon dials the Crontech edge **outbound only**, so customer
origin servers never need a public IP, never accept inbound traffic,
and never appear on any DNS record an attacker can scan.

This package retires the SSH-via-DNS hostname problem documented in
the parent `HANDOFF.md` §3: traffic to `*.crontech.app` reaches the
origin via the tunnel, never via a public origin IP.

## Architecture

```
┌──────────────────────┐                  ┌──────────────────────┐
│  Customer origin     │   outbound WSS   │  Crontech edge       │
│  (no inbound ports)  │ ───────────────▶ │  (control + public)  │
│                      │                  │                      │
│  origin/  daemon     │ ◀─── frames ──── │  edge/    daemon     │
│  ↓ forwards to       │                  │  ↑ public HTTP in    │
│  127.0.0.1:3000      │                  │  ↑ from CF / Caddy   │
│  127.0.0.1:3001      │                  │                      │
└──────────────────────┘                  └──────────────────────┘
```

| Layer | Lives in |
|-------|----------|
| Wire protocol (length-prefixed JSON frames, v1 control frames) | `shared/frame.ts` |
| HMAC-SHA256 mutual auth (signed token) | `shared/auth.ts` |
| Origin daemon (outbound, mux, ping/pong, reconnect, drain-on-stop) | `origin/src/` |
| Edge daemon (accept, registry, public HTTP listener, mux) | `edge/src/` |

### Wire protocol (v1)

Every message on the WebSocket is a 4-byte big-endian length prefix
followed by a UTF-8 JSON payload. Six frame types:

| Type | Direction | Purpose |
|------|-----------|---------|
| `advertise` | origin → edge | First frame on every connection. Carries the signed token in `id`. |
| `request`   | edge → origin | Edge has inbound HTTP, asks origin to serve. |
| `response`  | origin → edge | Origin's HTTP reply, correlated by `id`. |
| `ping`      | either        | Heartbeat. |
| `pong`      | either        | Heartbeat ack, echoes ping `id`. |
| `shutdown`  | either        | Graceful-shutdown notice. |

### Mutual auth

The shared HMAC secret never crosses the wire. The origin signs
`{ id, ts, nonce, hostnames }` with HMAC-SHA256 and presents the token
as the `id` of the first `advertise` frame. The edge re-computes the
HMAC and compares constant-time, then enforces a 60-second freshness
window.

### Multiplexing

A single tunnel WebSocket carries arbitrarily many concurrent HTTP
requests, correlated by request `id`. The origin's `maxInFlight`
ceiling produces a 503 when exceeded (sane backpressure rather than
queue-bloat on a slow upstream).

### Reconnect

Exponential backoff with full jitter (AWS pattern), 1s → 60s ceiling.
Jitter prevents thundering-herd reconnects when the edge has a brief
hiccup. See `origin/src/backoff.ts`.

### Graceful shutdown

`SIGTERM`/`SIGINT` triggers `OriginDaemon.stop()`:

1. Send a `shutdown` frame.
2. Drain in-flight requests for `drainMs` (default 10s).
3. Close the socket cleanly with code `1000`.
4. Exit 0.

## Running the origin daemon

The origin daemon is what runs **on the customer machine**. It needs
zero inbound connectivity — only outbound HTTPS/WSS to the edge.

### Required env vars

| Var | Purpose |
|-----|---------|
| `TUNNEL_EDGE_URL` | `wss://edge.crontech.app/tunnel` (or your edge endpoint). |
| `TUNNEL_SHARED_SECRET` | 32+ byte secret. Provisioned out-of-band. |
| `TUNNEL_HOSTNAMES` | Comma-separated list of hostnames this origin serves. |

### Optional env vars

| Var | Default | Purpose |
|-----|---------|---------|
| `TUNNEL_ORIGIN_ID` | `origin-<pid>` | Stable origin identifier for logs. |
| `TUNNEL_HOSTNAME` | — | Legacy single-hostname (v0 compat). |
| `TUNNEL_ROUTES` | `/api:3001,/trpc:3001,/healthz:3001,/auth/:3001` | Path-prefix → port routing. |
| `TUNNEL_DEFAULT_PORT` | `3000` | Fallback when no rule matches. |
| `TUNNEL_PING_INTERVAL_MS` | `15000` | Heartbeat cadence. |
| `TUNNEL_PING_TIMEOUT_MS` | `30000` | Pong deadline before tearing the link. |
| `TUNNEL_MAX_INFLIGHT` | `256` | Concurrent in-flight ceiling. |
| `TUNNEL_DRAIN_MS` | `10000` | Drain window on graceful shutdown. |

### Start it

```bash
TUNNEL_EDGE_URL=wss://edge.crontech.app/tunnel \
TUNNEL_SHARED_SECRET=$(cat /etc/crontech/tunnel.secret) \
TUNNEL_HOSTNAMES=demo.crontech.app,api.demo.crontech.app \
TUNNEL_ORIGIN_ID=vps-vultr-1 \
bun run --filter @back-to-the-future/tunnel start:origin
```

Logs go to stdout; warnings/errors to stderr. Pipe to your logger of
choice. systemd / docker / nomad — all fine; the daemon is a vanilla
long-running process.

## Running the edge daemon

The edge daemon is what Crontech runs **on the edge** to terminate
tunnels and re-expose tunnelled origins to the public internet. The
public listener is typically fronted by Cloudflare (TLS, WAF, DDoS)
or local Caddy.

### Required env vars

| Var | Purpose |
|-----|---------|
| `TUNNEL_SHARED_SECRET` | Must match the origin's secret. |

### Optional env vars

| Var | Default | Purpose |
|-----|---------|---------|
| `TUNNEL_EDGE_CONTROL_PORT` | `9094` | Origin handshakes here. |
| `TUNNEL_EDGE_PUBLIC_PORT`  | `9095` | Inbound public HTTP. |
| `TUNNEL_EDGE_HOSTNAME`     | `0.0.0.0` | Bind address. |

### Start it

```bash
TUNNEL_SHARED_SECRET=$(cat /etc/crontech/tunnel.secret) \
bun run --filter @back-to-the-future/tunnel start:edge
```

## How this fits in the broader Crontech edge architecture

The tunnel is one piece of the edge data plane:

```
  Cloudflare/Caddy (TLS)
        │
        ▼
  [edge daemon :9095]   ← inbound HTTP (this package)
        │
        │   tunnel mux
        ▼
  [origin daemon]       ← runs on customer host
        │
        ▼
  127.0.0.1:3000  (web)
  127.0.0.1:3001  (api)
```

The edge daemon is intentionally narrow — it routes by `Host` header
to the matching tunnel and forwards bytes. WAF, rate-limiting, and
TLS termination live in the layer above (Cloudflare or Caddy). DDoS
mitigation rides on Cloudflare's free tier.

The origin daemon shares the network namespace of `apps/web` and
`apps/api` on the customer box, hitting them via `127.0.0.1`. The
v0 SSH-via-DNS workaround is fully retired by this design.

## Tests

```bash
bun run --filter @back-to-the-future/tunnel test
```

Covers:
- Wire protocol round-trip (every v1 frame type).
- HMAC sign/verify (happy path + every documented failure mode).
- Backoff math (base + jittered).
- Origin routing rules.
- Origin request forwarding (GET, POST, correlation).
- Origin daemon state machine (handshake emits signed advertise; mux fairness; in-flight ceiling; reconnect on drop; graceful stop).
- Edge registry (multi-hostname, displacement, pending rejection on disconnect).
- Edge handshake verification (signature failure → 4401; non-advertise first frame → 4400; hostname-out-of-claims → 403).
- Edge end-to-end: public `Request` → framed → registry → response → public `Response`.

## Production checklist

- [ ] Secret distributed via your secret manager (NOT in-tree, NOT in env files committed to git).
- [ ] `TUNNEL_EDGE_URL` uses `wss://`, not `ws://`.
- [ ] Edge fronted by Cloudflare or another DDoS-scrubbing layer for the public port.
- [ ] systemd unit (or equivalent) restarts the origin daemon on crash.
- [ ] Monitoring on `[tunnel/origin] connected` log lines + the connection
      count exposed by `OriginRegistry.connectionCount()`.

## Roadmap (v2+)

- QUIC transport (when Crontech operates its own POPs).
- Round-robin routing across multiple origins for the same hostname.
- Per-hostname rate limits inside the edge daemon.
- mTLS in addition to HMAC token (defence-in-depth).
- Sub-protocol negotiation for end-to-end h2/h3 instead of base64-encoded bodies.
