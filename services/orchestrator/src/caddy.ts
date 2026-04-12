// ── Caddy Admin API Client ────────────────────────────────────────────
// Talks to Caddy's admin API at http://localhost:2019 for dynamic
// route management without restarts.

import type { CaddyRoute, CaddyConfig } from "./types";

const CADDY_ADMIN = process.env["CADDY_ADMIN_URL"] ?? "http://localhost:2019";
const ROUTES_PATH = "/config/apps/http/servers/srv0/routes";

/** Add a reverse-proxy route: domain -> upstream (e.g. localhost:3001). */
export async function addRoute(
  domain: string,
  upstream: string,
): Promise<void> {
  const routeId = `crontech-${domain.replace(/\./g, "-")}`;

  const route: CaddyRoute = {
    "@id": routeId,
    match: [{ host: [domain] }],
    handle: [
      {
        handler: "reverse_proxy",
        upstreams: [{ dial: upstream }],
      },
    ],
  };

  const res = await fetch(`${CADDY_ADMIN}${ROUTES_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(route),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`addRoute failed (${res.status}): ${body}`);
  }
}

/** Remove a route by domain. */
export async function removeRoute(domain: string): Promise<void> {
  const routeId = `crontech-${domain.replace(/\./g, "-")}`;

  const res = await fetch(`${CADDY_ADMIN}/id/${routeId}`, {
    method: "DELETE",
  });

  // 200 = deleted, 404 = already gone — both are acceptable.
  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`removeRoute failed (${res.status}): ${body}`);
  }
}

/** List all currently configured routes. */
export async function listRoutes(): Promise<CaddyRoute[]> {
  const res = await fetch(`${CADDY_ADMIN}${ROUTES_PATH}`);

  if (!res.ok) {
    // If no routes configured yet, Caddy may return 404 — return empty.
    if (res.status === 404) return [];
    const body = await res.text();
    throw new Error(`listRoutes failed (${res.status}): ${body}`);
  }

  const data: unknown = await res.json();
  return (Array.isArray(data) ? data : []) as CaddyRoute[];
}

/** Get the full Caddy config. */
export async function getConfig(): Promise<CaddyConfig> {
  const res = await fetch(`${CADDY_ADMIN}/config/`);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`getConfig failed (${res.status}): ${body}`);
  }

  return (await res.json()) as CaddyConfig;
}
