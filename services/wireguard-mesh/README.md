# @back-to-the-future/wireguard-mesh

Crontech's private WireGuard mesh **control plane**. Generates configs,
distributes peer info, tracks node liveness, rotates keys. The data plane is
the kernel/userspace WireGuard daemon — we don't reimplement WireGuard itself.

Cloudflare's Argo is closed. Ours is auditable: every line of crypto and
topology logic is in this directory.

---

## Why

Crontech runs across many regions: edge POPs, GPU workers, orchestrator
nodes. They need a private encrypted fabric with sub-50 ms RTT for control
traffic, no public internet exposure for inter-node RPC, and the ability to
rotate keys without flapping the tunnel.

WireGuard gives us all of that for free. This package is the brain that keeps
it consistent.

---

## Capabilities

- **Node registry** — `{ id, region, publicKey, endpoint, allowedIPs, tunnelIP, role, lastSeenAt }`
- **Key generation** — fresh x25519 keypair on registration; one-time-only return of the private key
- **Config generator** — produces a complete `wg-quick`-format `wg0.conf` for any node, including all peers
- **Key rotation** — `POST /nodes/:id/rotate` mints a new keypair, retains the old public key during the configurable grace window so peers cut over without flap
- **Health pings** — `POST /nodes/:id/heartbeat` updates `lastSeenAt`; nodes silent for `>deadNodeAfterMs` are excluded from peer lists until they recover
- **Topology** — `full-mesh` by default; `hub-spoke` is one switch away when egress costs require it
- **IP allocation** — issues per-node `/32` addresses out of `10.42.0.0/16`, reclaims freed addresses, never collides
- **Bearer auth** — every admin endpoint requires `Authorization: Bearer $WGM_ADMIN_TOKEN`

---

## Crypto choice — Node's built-in `crypto`

We use `crypto.generateKeyPairSync('x25519', ...)` from Node's standard library
(Bun-compatible) rather than pulling in `@noble/curves` or any third-party
implementation.

Reasons:

1. **Stable, audited primitive.** x25519 has been a stable Node API since v12.
2. **Smaller supply chain.** A control plane that mints VPN keys is the worst
   place to add fresh dependencies. Zero new deps here.
3. **WireGuard expects raw 32-byte keys, base64-encoded.** Node returns
   DER-encoded keys; we slice the trailing 32 bytes (the ASN.1 prefix is
   fixed for x25519) and base64-encode them. See `src/keys.ts`.

For deterministic test seeding we also expose `generateKeyPairFromSeed(seed)`
which clamps the seed per RFC 7748 §5 and reconstructs the keypair through a
hand-built PKCS8 envelope. This is **only** used by tests.

---

## Config format

`renderWgConfig({ self, privateKey, peers })` emits standard
[`wg-quick`](https://man7.org/linux/man-pages/man8/wg-quick.8.html) text:

```
[Interface]
# node-id = alpha (region=us-east, role=hub)
PrivateKey = <base64>
Address = 10.42.0.2/32
ListenPort = 51820

[Peer]
# node-id = beta (region=eu-west, role=peer)
PublicKey = <base64>
AllowedIPs = 10.42.0.3/32, 192.168.10.0/24
Endpoint = 5.6.7.8:51820
PersistentKeepalive = 25
```

Peers are sorted by `id` so reissuing the config for an unchanged topology
yields byte-identical output — `wg syncconf` won't flap unnecessarily.

---

## IP allocation

- Pool: configurable CIDR (default `10.42.0.0/16` ≈ 65 533 usable hosts).
- `.0` is the network address, last `.x` is broadcast, `.1` is reserved as the
  implicit gateway. Allocation starts at `.2`.
- Freed addresses go on a FIFO reuse queue and are handed out before fresh
  ones, so the address space stays compact.
- `IpAllocator.reserve(ip)` lets a future durable-storage adapter rehydrate
  state on boot.

---

## Topology

| Mode         | Behavior                                                                 |
|--------------|--------------------------------------------------------------------------|
| `full-mesh`  | Every node peers with every other live node. Lowest latency, more keys.  |
| `hub-spoke`  | Spokes peer only with hubs; hubs peer with everyone. Fewer tunnels, lower egress cost, single-hop transit through hubs. |

Toggled via `WGM_TOPOLOGY` (or `meshOptions.topology`). Spokes vs hubs are
distinguished by `role` on each registered node (`peer | hub | spoke`).

---

## HTTP API

All admin endpoints require `Authorization: Bearer $WGM_ADMIN_TOKEN`.

| Method | Path                       | Purpose                                                |
|--------|----------------------------|--------------------------------------------------------|
| GET    | `/health`                  | Liveness; `{ ok, topology, nodes }`. **No auth.**      |
| GET    | `/nodes`                   | List nodes (no private keys).                          |
| POST   | `/nodes`                   | Register node. **Returns the private key once.**       |
| GET    | `/nodes/:id`               | Fetch one node's metadata.                             |
| DELETE | `/nodes/:id`               | Deregister node and free its tunnel IP.                |
| GET    | `/nodes/:id/config`        | Render `wg-quick` config for the node (text/plain).    |
| POST   | `/nodes/:id/heartbeat`     | `{ at?: number }`; updates `lastSeenAt`.               |
| POST   | `/nodes/:id/rotate`        | Mint new keypair; **returns new private key once.**    |

---

## Environment variables

| Name                 | Default          | Purpose                                                          |
|----------------------|------------------|------------------------------------------------------------------|
| `WGM_ADMIN_TOKEN`    | _required_       | Bearer token for the admin endpoints. No default — startup fails without it. |
| `WGM_PORT`           | `8787`           | TCP port the control-plane HTTP server listens on.               |
| `WGM_TOPOLOGY`       | `full-mesh`      | `full-mesh` or `hub-spoke`.                                      |
| `WGM_CIDR`           | `10.42.0.0/16`   | Tunnel network CIDR. Must have at least 2 usable hosts.          |

---

## Scripts

```bash
bun run --filter @back-to-the-future/wireguard-mesh start    # production
bun run --filter @back-to-the-future/wireguard-mesh dev      # hot reload
bun run --filter @back-to-the-future/wireguard-mesh test     # unit tests
bun run --filter @back-to-the-future/wireguard-mesh check    # tsc --noEmit
bun run --filter @back-to-the-future/wireguard-mesh lint     # biome check
```

---

## Doctrine alignment

- Pure TypeScript, strict mode, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`.
- Hono on Bun — same stack as the rest of the platform.
- Zod at every boundary (`CreateNodeInputSchema`, `HeartbeatInputSchema`).
- Pluggable `Clock` injected for deterministic dead-node tests.
- Zero dependencies beyond Hono + Zod. No crypto libs. No vendor SDKs.

> Cloudflare's mesh is a black box. Ours is 600 lines of TypeScript you can read end-to-end in an afternoon.
