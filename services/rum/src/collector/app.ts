import { Hono } from "hono";
import { cors } from "hono/cors";
import { batchSchema, statsQuerySchema, timeseriesQuerySchema } from "./schema";
import { RateLimiter, RumStore } from "./store";

export interface AppDeps {
  store: RumStore;
  limiter: RateLimiter;
  /** Resolve the tenant id from the request — host, header, or body fallback. */
  resolveTenant: (req: Request, fallback: string) => string;
  /** Authoritative clock — overridable for tests. */
  now: () => number;
}

export interface AppOptions {
  /** Allowed origins for stats/timeseries reads. Collect endpoint is open. */
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
    if (sub && /^[a-zA-Z0-9_-]{1,128}$/.test(sub) && sub !== "localhost" && sub !== "rum") return sub;
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
    // Bun + modern runtimes ship a built-in DecompressionStream.
    const ds = new DecompressionStream("gzip");
    if (!req.body) return "";
    const stream = req.body.pipeThrough(ds);
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    // Cap decompressed payload at 1 MiB to defuse zip-bombs.
    const MAX = 1024 * 1024;
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
  app.use("/rum/v1/collect", cors({ origin: "*", allowMethods: ["POST", "OPTIONS"], maxAge: 86_400 }));

  // Tight CORS for the read endpoints.
  app.use("/rum/v1/stats", cors({ origin: statsOrigins, allowMethods: ["GET"], credentials: true }));
  app.use("/rum/v1/timeseries", cors({ origin: statsOrigins, allowMethods: ["GET"], credentials: true }));

  app.post("/rum/v1/collect", async (c) => {
    const ip = ipFromHeaders(c.req.raw);
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
    // Tenant from body is treated as a *hint*; the resolver has the final say.
    const tenant = deps.resolveTenant(c.req.raw, parsed.data.tenant);
    deps.store.ingest({ ...parsed.data, tenant }, now);
    return c.json({ ok: true, accepted: parsed.data.metrics.length });
  });

  app.get("/rum/v1/stats", (c) => {
    const tenant = deps.resolveTenant(c.req.raw, "default");
    const parsed = statsQuerySchema.safeParse({
      route: c.req.query("route"),
      metric: c.req.query("metric"),
      since: c.req.query("since"),
    });
    if (!parsed.success) {
      return c.json({ error: "validation_failed", issues: parsed.error.issues.slice(0, 5) }, 400);
    }
    const filter: { route?: string; metric?: NonNullable<typeof parsed.data.metric>; since?: number } = {};
    if (parsed.data.route !== undefined) filter.route = parsed.data.route;
    if (parsed.data.metric !== undefined) filter.metric = parsed.data.metric;
    if (parsed.data.since !== undefined) filter.since = parsed.data.since;
    return c.json({ tenant, stats: deps.store.stats(tenant, filter) });
  });

  app.get("/rum/v1/timeseries", (c) => {
    const tenant = deps.resolveTenant(c.req.raw, "default");
    const parsed = timeseriesQuerySchema.safeParse({
      route: c.req.query("route"),
      metric: c.req.query("metric"),
      bucket: c.req.query("bucket"),
      since: c.req.query("since"),
    });
    if (!parsed.success) {
      return c.json({ error: "validation_failed", issues: parsed.error.issues.slice(0, 5) }, 400);
    }
    const filter: { route?: string; since?: number } = {};
    if (parsed.data.route !== undefined) filter.route = parsed.data.route;
    if (parsed.data.since !== undefined) filter.since = parsed.data.since;
    return c.json({
      tenant,
      metric: parsed.data.metric,
      bucket: parsed.data.bucket,
      points: deps.store.timeseries(tenant, parsed.data.metric, parsed.data.bucket, filter),
    });
  });

  app.get("/healthz", (c) => c.json({ ok: true, samples: deps.store.size() }));

  return app;
}

export const buildDefaultApp = (opts: AppOptions = {}): { app: Hono; deps: AppDeps } => {
  const store = new RumStore();
  const limiter = new RateLimiter({ perMinute: opts.collectPerMinute ?? 600, burst: 60 });
  const deps: AppDeps = {
    store,
    limiter,
    resolveTenant: defaultResolveTenant,
    now: () => Date.now(),
  };
  return { app: createApp(deps, opts), deps };
};
