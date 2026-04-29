import { Hono } from "hono";
import { cors } from "hono/cors";
import { batchSchema, funnelRequestSchema, statsQuerySchema } from "./schema";
import { AnalyticsStore, RateLimiter } from "./store";
import { DailySaltStore, deriveSessionId } from "./session";

export interface AppDeps {
  store: AnalyticsStore;
  limiter: RateLimiter;
  salts: DailySaltStore;
  /**
   * Resolve the tenant id from the request — header, subdomain, or body
   * fallback. The body's `tenant` is treated as a hint only.
   */
  resolveTenant: (req: Request, fallback: string) => string;
  /** Optional bearer-token verifier — given a tenant + bearer, returns ok? */
  verifyBearer?: (tenant: string, bearer: string | null) => boolean;
  /** Authoritative clock — overridable for tests. */
  now: () => number;
}

export interface AppOptions {
  /** Allowed origins for stats reads. Collect endpoint is open. */
  statsOrigins?: string[];
  /** Per-IP request budget on the collect endpoint. */
  collectPerMinute?: number;
}

const defaultResolveTenant = (req: Request, fallback: string): string => {
  const auth = req.headers.get("x-tenant-id");
  if (auth && /^[a-zA-Z0-9_-]{1,128}$/.test(auth)) return auth;
  try {
    const host = new URL(req.url).host;
    const sub = host.split(":")[0]?.split(".")[0];
    if (sub && /^[a-zA-Z0-9_-]{1,128}$/.test(sub) && sub !== "localhost" && sub !== "analytics") return sub;
  } catch {
    /* fall through */
  }
  return fallback;
};

const ipFromHeaders = (req: Request): string => {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0];
    if (first) return first.trim();
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
};

const decompressIfNeeded = async (req: Request): Promise<string> => {
  const enc = req.headers.get("content-encoding")?.toLowerCase();
  if (enc === "gzip") {
    const ds = new DecompressionStream("gzip");
    if (!req.body) return "";
    const stream = req.body.pipeThrough(ds);
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    const MAX = 1024 * 1024; // 1 MiB safety cap
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX) throw new Error("payload too large");
        chunks.push(value);
      }
    }
    const merged = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      merged.set(c, off);
      off += c.byteLength;
    }
    return new TextDecoder().decode(merged);
  }
  return req.text();
};

export function createApp(deps: AppDeps, opts: AppOptions = {}): Hono {
  const app = new Hono();
  const statsOrigins = opts.statsOrigins ?? [];

  // Wide CORS for collect — beacons come from arbitrary origins.
  app.use("/a/v1/collect", cors({ origin: "*", allowMethods: ["POST", "OPTIONS"], maxAge: 86_400 }));
  // Tight CORS for the read endpoints.
  app.use("/a/v1/stats", cors({ origin: statsOrigins, allowMethods: ["GET"], credentials: true }));
  app.use("/a/v1/funnel", cors({ origin: statsOrigins, allowMethods: ["POST", "OPTIONS"], credentials: true }));

  app.post("/a/v1/collect", async (c) => {
    const ip = ipFromHeaders(c.req.raw);
    const ua = c.req.header("user-agent") ?? "unknown";
    const now = deps.now();
    if (!deps.limiter.consume(ip, now)) {
      return c.json({ error: "rate_limited" }, 429);
    }
    let raw: string;
    try {
      raw = await decompressIfNeeded(c.req.raw);
    } catch {
      return c.json({ error: "bad_gzip" }, 400);
    }
    if (raw.length > 64 * 1024) {
      return c.json({ error: "payload_too_large" }, 413);
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return c.json({ error: "bad_json" }, 400);
    }
    const parsed = batchSchema.safeParse(json);
    if (!parsed.success) {
      return c.json({ error: "validation_failed", issues: parsed.error.issues.slice(0, 5) }, 400);
    }
    const tenant = deps.resolveTenant(c.req.raw, parsed.data.tenant);

    if (deps.verifyBearer) {
      const ok = deps.verifyBearer(tenant, parsed.data.bearer ?? null);
      if (!ok) return c.json({ error: "unauthorised" }, 401);
    }

    // Server-side session id derivation. The client may send any sessionId;
    // we replace it with our own daily-salted hash so the client can never
    // forge cross-session linkage and we never persist raw IPs.
    const salt = deps.salts.currentSalt(now);
    const serverSid = deriveSessionId(salt, ip, ua);
    const events = parsed.data.events.map((e) => ({ ...e, sessionId: serverSid }));

    deps.store.ingest(tenant, events, now);
    return c.json({ ok: true, accepted: events.length });
  });

  app.get("/a/v1/stats", (c) => {
    const tenant = deps.resolveTenant(c.req.raw, "default");
    if (deps.verifyBearer) {
      const auth = c.req.header("authorization") ?? "";
      const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : null;
      if (!deps.verifyBearer(tenant, bearer)) return c.json({ error: "unauthorised" }, 401);
    }
    const parsed = statsQuerySchema.safeParse({
      route: c.req.query("route"),
      event: c.req.query("event"),
      since: c.req.query("since"),
      topN: c.req.query("topN"),
    });
    if (!parsed.success) {
      return c.json({ error: "validation_failed", issues: parsed.error.issues.slice(0, 5) }, 400);
    }
    const filter: { route?: string; event?: string; since?: number } = {};
    if (parsed.data.route !== undefined) filter.route = parsed.data.route;
    if (parsed.data.event !== undefined) filter.event = parsed.data.event;
    if (parsed.data.since !== undefined) filter.since = parsed.data.since;
    return c.json({ tenant, stats: deps.store.stats(tenant, filter, parsed.data.topN ?? 10) });
  });

  app.post("/a/v1/funnel", async (c) => {
    const tenant = deps.resolveTenant(c.req.raw, "default");
    if (deps.verifyBearer) {
      const auth = c.req.header("authorization") ?? "";
      const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : null;
      if (!deps.verifyBearer(tenant, bearer)) return c.json({ error: "unauthorised" }, 401);
    }
    let json: unknown;
    try {
      json = await c.req.json();
    } catch {
      return c.json({ error: "bad_json" }, 400);
    }
    const parsed = funnelRequestSchema.safeParse(json);
    if (!parsed.success) {
      return c.json({ error: "validation_failed", issues: parsed.error.issues.slice(0, 5) }, 400);
    }
    const opts: { since?: number; windowMs?: number } = {};
    if (parsed.data.since !== undefined) opts.since = parsed.data.since;
    if (parsed.data.windowMs !== undefined) opts.windowMs = parsed.data.windowMs;
    return c.json({ tenant, funnel: deps.store.funnel(tenant, parsed.data.steps, opts) });
  });

  app.get("/healthz", (c) => c.json({ ok: true, samples: deps.store.size(), day: deps.salts.day() }));

  return app;
}

export const buildDefaultApp = (opts: AppOptions = {}): { app: Hono; deps: AppDeps } => {
  const store = new AnalyticsStore();
  const limiter = new RateLimiter({ perMinute: opts.collectPerMinute ?? 600, burst: 60 });
  const salts = new DailySaltStore();
  const deps: AppDeps = {
    store,
    limiter,
    salts,
    resolveTenant: defaultResolveTenant,
    now: () => Date.now(),
  };
  return { app: createApp(deps, opts), deps };
};
