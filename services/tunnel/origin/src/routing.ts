// ── Origin-side local-port routing ─────────────────────────────────
//
// When an inbound request frame arrives over the tunnel, the origin
// daemon decides which local service to forward it to. This is the
// only piece of "business logic" the daemon contains and it must stay
// trivially auditable.
//
// Routing is configured by the operator at boot time as an ordered
// list of rules. The first rule whose `pathPrefix` matches the
// request's path wins. If nothing matches, traffic falls through to
// the configured default port.
// ─────────────────────────────────────────────────────────────────────

import type { RequestFrame } from "../../shared/frame";

export interface RouteRule {
  /** Path prefix to match (e.g. "/api/", "/trpc/"). Case-sensitive. */
  readonly pathPrefix: string;
  /** Local TCP port to forward to. */
  readonly port: number;
}

export interface RoutingConfig {
  readonly rules: readonly RouteRule[];
  readonly defaultPort: number;
}

/** Default v1 routing — mirrors `infra/bare-metal/Caddyfile.template`. */
export const DEFAULT_ROUTING: RoutingConfig = {
  rules: [
    { pathPrefix: "/api", port: 3001 },
    { pathPrefix: "/trpc", port: 3001 },
    { pathPrefix: "/healthz", port: 3001 },
    { pathPrefix: "/auth/", port: 3001 },
  ],
  defaultPort: 3000,
};

/** Pull the path component out of either a path-only string or full URL. */
export function extractPath(url: string): string {
  if (url.startsWith("/")) {
    return url;
  }
  try {
    const parsed = new URL(url);
    return `${parsed.pathname || "/"}${parsed.search}`;
  } catch {
    return "/";
  }
}

export function resolveLocalPort(url: string, routing: RoutingConfig): number {
  const path = extractPath(url);
  for (const rule of routing.rules) {
    if (matchesPrefix(path, rule.pathPrefix)) {
      return rule.port;
    }
  }
  return routing.defaultPort;
}

function matchesPrefix(path: string, prefix: string): boolean {
  if (path.startsWith(prefix)) {
    return true;
  }
  // "/api" should match "/api" exactly, even without trailing slash.
  if (prefix.endsWith("/") && path === prefix.slice(0, -1)) {
    return true;
  }
  return false;
}

/** Construct the loopback URL the origin daemon should hit. */
export function buildLocalUrl(req: RequestFrame, port: number): string {
  return `http://127.0.0.1:${port}${extractPath(req.url)}`;
}
