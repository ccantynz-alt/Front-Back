// ── Reverse-tunnel: origin daemon ────────────────────────────────────
//
// Runs on the origin host (Vultr / Hetzner). Opens a persistent
// outbound WebSocket to the configured edge endpoint. When the edge
// pushes a framed HTTP request, we forward it to the matching local
// service on `127.0.0.1:<port>`, capture the response, frame it, send
// it back. On disconnect we reconnect with exponential backoff so a
// flapping edge never DoSes itself.
//
// The origin host's public IP never accepts inbound traffic — the
// only thing it does outbound is open this tunnel. That is the entire
// point of BLK-019: remove the direct DDoS surface.
// ─────────────────────────────────────────────────────────────────────

import {
  type RequestFrame,
  type ResponseFrame,
  bodyFromBase64,
  bodyToBase64,
  decodeRequest,
  encodeResponse,
} from "./frame";

// ── Pure helpers (exported for tests) ───────────────────────────────

export const INITIAL_BACKOFF_MS = 1_000;
export const MAX_BACKOFF_MS = 60_000;

/**
 * Compute the next reconnection delay given the current attempt count
 * (0-indexed: attempt 0 = first reconnect after initial drop).
 *
 * Doubles each attempt, capped at MAX_BACKOFF_MS. No jitter in v0 —
 * the only origin per host means thundering-herd is not a concern.
 */
export function computeBackoffMs(attempt: number): number {
  if (attempt < 0 || !Number.isInteger(attempt)) {
    return INITIAL_BACKOFF_MS;
  }
  const doubled = INITIAL_BACKOFF_MS * 2 ** attempt;
  return Math.min(doubled, MAX_BACKOFF_MS);
}

/**
 * Resolve which local origin port should receive a tunnelled request.
 *
 * v0 routing logic: the edge always forwards a request whose Host
 * header matches one of the registered hostnames. The origin checks
 * whether the path is the API surface (anything starting with `/api`,
 * `/trpc`, `/healthz`) and routes to `API_PORT`, otherwise to
 * `WEB_PORT`. This mirrors the way `infra/bare-metal/Caddyfile.template`
 * splits traffic on the production host today.
 */
export interface OriginPortRouting {
  readonly webPort: number;
  readonly apiPort: number;
}

export function resolveLocalPort(url: string, routing: OriginPortRouting): number {
  const path = extractPath(url);
  if (
    path.startsWith("/api/") ||
    path === "/api" ||
    path.startsWith("/trpc/") ||
    path === "/trpc" ||
    path.startsWith("/healthz") ||
    path.startsWith("/auth/")
  ) {
    return routing.apiPort;
  }
  return routing.webPort;
}

function extractPath(url: string): string {
  // The frame URL is the request-line target. It may be either a full
  // URL (scheme://host/path) or a path-only string. We only need the
  // path component.
  if (url.startsWith("/")) {
    return url;
  }
  try {
    const parsed = new URL(url);
    return parsed.pathname || "/";
  } catch {
    return "/";
  }
}

/**
 * Build the local fetch URL the origin daemon should hit, given the
 * incoming framed request and the resolved port.
 */
export function buildLocalUrl(req: RequestFrame, port: number): string {
  const path = extractPath(req.url);
  return `http://127.0.0.1:${port}${path}`;
}

/**
 * Forward a tunnelled request to a local service via `fetch`, then
 * frame the response back. The `fetcher` is injected so tests can
 * mock it without binding sockets.
 */
export async function forwardRequest(
  req: RequestFrame,
  routing: OriginPortRouting,
  fetcher: (url: string, init: RequestInit) => Promise<Response>,
): Promise<ResponseFrame> {
  const port = resolveLocalPort(req.url, routing);
  const localUrl = buildLocalUrl(req, port);
  const init: RequestInit = {
    method: req.method,
    headers: req.headers,
  };
  if (req.body.length > 0 && !isBodylessMethod(req.method)) {
    init.body = bodyFromBase64(req.body);
  }
  const res = await fetcher(localUrl, init);
  const buf = new Uint8Array(await res.arrayBuffer());
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return {
    type: "response",
    id: req.id,
    status: res.status,
    headers,
    body: bodyToBase64(buf),
  };
}

function isBodylessMethod(method: string): boolean {
  const upper = method.toUpperCase();
  return upper === "GET" || upper === "HEAD";
}

// ── Daemon (runtime entrypoint) ─────────────────────────────────────

interface OriginConfig {
  readonly edgeUrl: string;
  readonly sharedSecret: string;
  readonly hostname: string;
  readonly routing: OriginPortRouting;
}

function loadConfig(): OriginConfig {
  const edgeUrl = process.env["TUNNEL_EDGE_URL"];
  const sharedSecret = process.env["TUNNEL_SHARED_SECRET"];
  const hostname = process.env["TUNNEL_HOSTNAME"];
  if (!edgeUrl) {
    throw new Error("TUNNEL_EDGE_URL is required");
  }
  if (!sharedSecret) {
    throw new Error("TUNNEL_SHARED_SECRET is required");
  }
  if (!hostname) {
    throw new Error("TUNNEL_HOSTNAME is required (the public hostname this origin serves)");
  }
  const webPort = Number(process.env["TUNNEL_LOCAL_WEB_PORT"] ?? "3000");
  const apiPort = Number(process.env["TUNNEL_LOCAL_API_PORT"] ?? "3001");
  if (!Number.isInteger(webPort) || webPort <= 0) {
    throw new Error(`TUNNEL_LOCAL_WEB_PORT must be a positive integer, got ${webPort}`);
  }
  if (!Number.isInteger(apiPort) || apiPort <= 0) {
    throw new Error(`TUNNEL_LOCAL_API_PORT must be a positive integer, got ${apiPort}`);
  }
  return {
    edgeUrl,
    sharedSecret,
    hostname,
    routing: { webPort, apiPort },
  };
}

interface ConnectDeps {
  readonly openSocket: (url: string, protocols?: string | string[]) => WebSocket;
  readonly fetcher: (url: string, init: RequestInit) => Promise<Response>;
  readonly schedule: (fn: () => void, ms: number) => void;
  readonly log: (msg: string) => void;
}

export function connectAndServe(config: OriginConfig, deps: ConnectDeps, attempt = 0): void {
  // The shared secret travels in a `Sec-WebSocket-Protocol` style
  // sub-protocol because browsers (and Bun's WebSocket) do not let us
  // set arbitrary headers on the upgrade. We use the documented
  // sub-protocol format `crontech-tunnel.v1.<secret>.<hostname>`.
  const protocol = `crontech-tunnel.v1.${config.sharedSecret}.${config.hostname}`;
  const ws = deps.openSocket(config.edgeUrl, protocol);
  ws.binaryType = "arraybuffer";

  ws.addEventListener("open", () => {
    deps.log(`[tunnel/origin] connected to ${config.edgeUrl} as ${config.hostname}`);
  });

  ws.addEventListener("message", (event) => {
    void handleMessage(event, ws, config, deps);
  });

  const reconnect = (): void => {
    const delay = computeBackoffMs(attempt);
    deps.log(`[tunnel/origin] reconnecting in ${delay}ms (attempt ${attempt + 1})`);
    deps.schedule(() => connectAndServe(config, deps, attempt + 1), delay);
  };

  ws.addEventListener("close", () => {
    deps.log("[tunnel/origin] socket closed");
    reconnect();
  });

  ws.addEventListener("error", () => {
    deps.log("[tunnel/origin] socket error");
    // Most runtimes emit `close` after `error`; do not double-schedule.
  });
}

async function handleMessage(
  event: MessageEvent,
  ws: WebSocket,
  config: OriginConfig,
  deps: ConnectDeps,
): Promise<void> {
  const buf = toUint8Array(event.data);
  if (!buf) {
    deps.log("[tunnel/origin] dropping non-binary message");
    return;
  }
  let req: RequestFrame;
  try {
    req = decodeRequest(buf);
  } catch (err) {
    deps.log(`[tunnel/origin] decode error: ${(err as Error).message}`);
    return;
  }
  try {
    const res = await forwardRequest(req, config.routing, deps.fetcher);
    ws.send(encodeResponse(res));
  } catch (err) {
    const errResponse: ResponseFrame = {
      type: "response",
      id: req.id,
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
      body: bodyToBase64(
        new TextEncoder().encode(`tunnel origin upstream error: ${(err as Error).message}`),
      ),
    };
    ws.send(encodeResponse(errResponse));
  }
}

function toUint8Array(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (data instanceof Uint8Array) {
    return data;
  }
  return null;
}

// ── Entrypoint ──────────────────────────────────────────────────────

if (import.meta.main) {
  const config = loadConfig();
  const deps: ConnectDeps = {
    openSocket: (url, protocols) => new WebSocket(url, protocols),
    fetcher: (url, init) => fetch(url, init),
    schedule: (fn, ms) => {
      setTimeout(fn, ms);
    },
    log: (msg) => {
      console.log(msg);
    },
  };
  connectAndServe(config, deps);
}
