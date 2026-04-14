/**
 * Subdomain routing middleware for multi-tenant Hono app.
 *
 * Extracts the subdomain from the Host header (e.g. "zoobicon.crontech.ai"
 * → "zoobicon"), looks up the corresponding tenant, and sets `tenantSlug`
 * and `tenantId` on the Hono context for downstream handlers.
 *
 * Also supports custom domains: if the Host does not match a known base
 * domain pattern, the middleware checks the `customDomain` column.
 *
 * Tenant lookups are cached in-memory with a 5-minute TTL to avoid a DB
 * query per request.
 */

import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import { db } from "@back-to-the-future/db";
import { tenants } from "@back-to-the-future/db/schema";

// ── Hono env type for tenant context ─────────────────────────────────

export interface TenantEnv {
  Variables: {
    tenantSlug: string | null;
    tenantId: string | null;
  };
}

// ── Types ────────────────────────────────────────────────────────────

interface CachedTenant {
  id: string;
  slug: string;
  expiresAt: number;
}

// ── In-memory cache ──────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** slug → CachedTenant */
const slugCache = new Map<string, CachedTenant>();

/** customDomain → CachedTenant */
const domainCache = new Map<string, CachedTenant>();

/** Special sentinel for "looked up but not found" to avoid repeated DB misses. */
const NOT_FOUND_SENTINEL: CachedTenant = { id: "", slug: "", expiresAt: 0 };

function getCachedBySlug(slug: string): CachedTenant | undefined {
  const entry = slugCache.get(slug);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    slugCache.delete(slug);
    return undefined;
  }
  return entry;
}

function getCachedByDomain(domain: string): CachedTenant | undefined {
  const entry = domainCache.get(domain);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    domainCache.delete(domain);
    return undefined;
  }
  return entry;
}

function cacheSlug(slug: string, id: string): void {
  slugCache.set(slug, { id, slug, expiresAt: Date.now() + CACHE_TTL_MS });
}

function cacheDomain(domain: string, id: string, slug: string): void {
  domainCache.set(domain, { id, slug, expiresAt: Date.now() + CACHE_TTL_MS });
}

function cacheSlugNotFound(slug: string): void {
  slugCache.set(slug, { ...NOT_FOUND_SENTINEL, expiresAt: Date.now() + CACHE_TTL_MS });
}

function cacheDomainNotFound(domain: string): void {
  domainCache.set(domain, { ...NOT_FOUND_SENTINEL, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Invalidate all cached entries for a given tenant slug. */
export function invalidateTenantCache(slug: string): void {
  slugCache.delete(slug);
  // Also remove any domain cache entries that reference this slug
  for (const [domain, entry] of domainCache.entries()) {
    if (entry.slug === slug) {
      domainCache.delete(domain);
    }
  }
}

// ── Base domains (bare domains that are NOT subdomains) ──────────────

const BASE_DOMAINS = ["crontech.ai", "crontech.dev", "localhost"];

// ── Middleware ────────────────────────────────────────────────────────

export const subdomainRouter = createMiddleware<TenantEnv>(
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: multi-tenant routing requires branching
  async (c, next): Promise<Response | void> => {
    const host = (c.req.header("host") ?? "").replace(/:\d+$/, ""); // strip port

    // Skip IP addresses (v4 simple check)
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      await next();
      return;
    }

    // Try to extract subdomain from known base domains
    let subdomain: string | null = null;

    for (const base of BASE_DOMAINS) {
      if (host === base) {
        // Bare domain — no subdomain
        await next();
        return;
      }
      if (host.endsWith(`.${base}`)) {
        subdomain = host.replace(`.${base}`, "");
        break;
      }
    }

    if (subdomain) {
      // Look up tenant by slug
      const cached = getCachedBySlug(subdomain);
      if (cached) {
        if (cached.id === "") {
          return c.json({ error: "TENANT_NOT_FOUND" }, 404);
        }
        c.set("tenantSlug", cached.slug);
        c.set("tenantId", cached.id);
        await next();
        return;
      }

      // DB lookup
      const rows = await db
        .select({ id: tenants.id, slug: tenants.slug })
        .from(tenants)
        .where(eq(tenants.slug, subdomain))
        .limit(1);

      const tenant = rows[0];
      if (!tenant) {
        cacheSlugNotFound(subdomain);
        return c.json({ error: "TENANT_NOT_FOUND" }, 404);
      }

      cacheSlug(tenant.slug, tenant.id);
      c.set("tenantSlug", tenant.slug);
      c.set("tenantId", tenant.id);
      await next();
      return;
    }

    // No subdomain matched — check custom domain
    const cachedDomain = getCachedByDomain(host);
    if (cachedDomain) {
      if (cachedDomain.id === "") {
        // Not a known custom domain — pass through (main app)
        await next();
        return;
      }
      c.set("tenantSlug", cachedDomain.slug);
      c.set("tenantId", cachedDomain.id);
      await next();
      return;
    }

    // DB lookup by custom domain
    const domainRows = await db
      .select({ id: tenants.id, slug: tenants.slug })
      .from(tenants)
      .where(eq(tenants.customDomain, host))
      .limit(1);

    const domainTenant = domainRows[0];
    if (domainTenant) {
      cacheDomain(host, domainTenant.id, domainTenant.slug);
      c.set("tenantSlug", domainTenant.slug);
      c.set("tenantId", domainTenant.id);
      await next();
      return;
    }

    // Unknown host — not a custom domain, just pass through (main app)
    cacheDomainNotFound(host);
    await next();
  },
);
