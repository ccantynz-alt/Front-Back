// ── Caddy Admin API Client + File Config Manager ──────────────────────
// Talks to Caddy's admin API at http://localhost:2019 for dynamic
// route management without restarts. Also supports file-based config
// management: append a site block to the Caddyfile on successful deploy
// and trigger a reload.

import * as fs from "node:fs";
import * as path from "node:path";
import type { CaddyRoute, CaddyConfig } from "./types";

const CADDY_ADMIN = process.env["CADDY_ADMIN_URL"] ?? "http://localhost:2019";
const ROUTES_PATH = "/config/apps/http/servers/srv0/routes";

/** Default Caddyfile path — override via CADDYFILE_PATH env. */
export const CADDYFILE_PATH =
  process.env["CADDYFILE_PATH"] ?? "/etc/caddy/Caddyfile";

/** Marker lines used to locate managed blocks in the Caddyfile. */
const BLOCK_START = "# >>> crontech-managed:";
const BLOCK_END = "# <<< crontech-managed:";

// ── Validation ────────────────────────────────────────────────────────

/**
 * Strict validation for a hostname that will be written into a Caddyfile.
 * Rejects anything that could break config parsing or inject directives.
 *
 * Accept: subdomain labels `[a-z0-9](-?[a-z0-9])*` separated by dots,
 * total length ≤ 253.
 */
export function isValidHost(host: string): boolean {
  if (typeof host !== "string") return false;
  if (host.length === 0 || host.length > 253) return false;
  if (host.startsWith(".") || host.endsWith(".")) return false;
  const labels = host.split(".");
  for (const label of labels) {
    if (label.length === 0 || label.length > 63) return false;
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(label)) return false;
  }
  return true;
}

/**
 * Strict validation for upstream dial strings: `host:port` where port is
 * 1-65535 and host is an IP literal or simple hostname.
 */
export function isValidUpstream(upstream: string): boolean {
  if (typeof upstream !== "string") return false;
  const match = upstream.match(/^([a-zA-Z0-9.-]+):(\d{1,5})$/);
  if (!match) return false;
  const port = Number(match[2]);
  return port >= 1 && port <= 65535;
}

// ── Caddyfile Block Builder ───────────────────────────────────────────

/**
 * Generate the managed Caddyfile block for a single site.
 * Exported for unit-testing — pure function, no side effects.
 */
export function buildCaddyfileBlock(
  slug: string,
  upstream: string,
  rootDomain = "crontech.ai",
): string {
  const host = `${slug}.${rootDomain}`;
  if (!isValidHost(host)) {
    throw new Error(`Invalid host "${host}" derived from slug "${slug}".`);
  }
  if (!isValidUpstream(upstream)) {
    throw new Error(`Invalid upstream "${upstream}".`);
  }
  return [
    `${BLOCK_START} ${slug}`,
    `${host} {`,
    `\treverse_proxy ${upstream}`,
    `\tencode zstd gzip`,
    `}`,
    `${BLOCK_END} ${slug}`,
    "",
  ].join("\n");
}

/**
 * Remove any existing managed block with the same slug, then append a new
 * block. Writes atomically via a temp file + rename so a crash mid-write
 * cannot corrupt the Caddyfile.
 *
 * Returns true if the file was modified.
 */
export function appendSiteBlock(
  caddyfilePath: string,
  slug: string,
  upstream: string,
  rootDomain = "crontech.ai",
): boolean {
  const block = buildCaddyfileBlock(slug, upstream, rootDomain);

  let existing = "";
  if (fs.existsSync(caddyfilePath)) {
    existing = fs.readFileSync(caddyfilePath, "utf-8");
  } else {
    const dir = path.dirname(caddyfilePath);
    fs.mkdirSync(dir, { recursive: true });
  }

  const cleaned = removeManagedBlock(existing, slug);
  const nextContents =
    cleaned.length > 0 && !cleaned.endsWith("\n")
      ? `${cleaned}\n${block}`
      : `${cleaned}${block}`;

  // Refuse to write if the result is obviously invalid Caddyfile structure.
  // Very light check: balanced `{}` count.
  if (!hasBalancedBraces(nextContents)) {
    throw new Error(
      `Caddyfile write aborted: unbalanced braces in rendered output for slug "${slug}".`,
    );
  }

  // Atomic write: tmp file → rename.
  const tmpPath = `${caddyfilePath}.crontech-tmp`;
  fs.writeFileSync(tmpPath, nextContents, { encoding: "utf-8", mode: 0o644 });
  fs.renameSync(tmpPath, caddyfilePath);

  return nextContents !== existing;
}

/**
 * Remove a managed block by slug from the given Caddyfile contents.
 * Exported for testing. Returns the cleaned contents.
 */
export function removeManagedBlock(contents: string, slug: string): string {
  const startMarker = `${BLOCK_START} ${slug}`;
  const endMarker = `${BLOCK_END} ${slug}`;
  const startIdx = contents.indexOf(startMarker);
  if (startIdx === -1) return contents;
  const endIdx = contents.indexOf(endMarker, startIdx);
  if (endIdx === -1) return contents;
  const afterEnd = contents.indexOf("\n", endIdx);
  const cutTo = afterEnd === -1 ? contents.length : afterEnd + 1;
  return contents.slice(0, startIdx) + contents.slice(cutTo);
}

function hasBalancedBraces(s: string): boolean {
  let depth = 0;
  for (const ch of s) {
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

// ── Caddy Reload ──────────────────────────────────────────────────────

/**
 * Trigger a Caddyfile reload via the admin API. Falls back to POSTing the
 * parsed config. If the reload fails, we throw — the caller should revert
 * the Caddyfile.
 */
export async function reloadCaddy(): Promise<void> {
  const res = await fetch(`${CADDY_ADMIN}/load`, {
    method: "POST",
    headers: { "Content-Type": "text/caddyfile" },
    body: fs.existsSync(CADDYFILE_PATH)
      ? fs.readFileSync(CADDYFILE_PATH, "utf-8")
      : "",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Caddy reload failed (${res.status}): ${body}`);
  }
}

/**
 * Append a site block for `${slug}.${rootDomain}` → upstream, reload Caddy.
 * If reload fails, restore the previous Caddyfile to keep the running
 * config valid. Returns true if the Caddyfile was modified.
 */
export async function appendSiteAndReload(
  slug: string,
  upstream: string,
  rootDomain = "crontech.ai",
  caddyfilePath: string = CADDYFILE_PATH,
): Promise<boolean> {
  const previous = fs.existsSync(caddyfilePath)
    ? fs.readFileSync(caddyfilePath, "utf-8")
    : null;
  const modified = appendSiteBlock(caddyfilePath, slug, upstream, rootDomain);
  try {
    await reloadCaddy();
    return modified;
  } catch (err) {
    // Roll back Caddyfile on reload failure.
    if (previous !== null) {
      fs.writeFileSync(caddyfilePath, previous, "utf-8");
    } else if (fs.existsSync(caddyfilePath)) {
      fs.rmSync(caddyfilePath, { force: true });
    }
    throw err;
  }
}

// ── Admin API (dynamic route injection, kept for runtime updates) ─────

/** Add a reverse-proxy route: domain -> upstream (e.g. localhost:3001). */
export async function addRoute(
  domain: string,
  upstream: string,
): Promise<void> {
  if (!isValidHost(domain)) {
    throw new Error(`addRoute: invalid domain "${domain}".`);
  }
  if (!isValidUpstream(upstream)) {
    throw new Error(`addRoute: invalid upstream "${upstream}".`);
  }

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
