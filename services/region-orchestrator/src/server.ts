import { decideScaling } from "./decision";
import { EmaSeasonalPredictor, type TrafficPredictor } from "./predictor";
import { RegionRegistry } from "./registry";
import { type ScalingDecision, SubmitStateBodySchema } from "./schemas";
import { ServiceStore } from "./store";

export interface RegionOrchestratorConfig {
  /** Shared-secret bearer token required for admin (region CRUD) endpoints. */
  adminToken: string;
  /** Override clock for tests. */
  now?: () => number;
  /** Override predictor for tests. */
  predictor?: TrafficPredictor;
}

const JSON_HEADERS = { "content-type": "application/json" } as const;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function errorBody(error: unknown): { error: string } {
  if (error instanceof Error) return { error: error.message };
  return { error: "unknown error" };
}

/**
 * Build a fetch-style HTTP handler for the region orchestrator. Returned
 * function is suitable for `Bun.serve({ fetch })`, Cloudflare Workers, or any
 * runtime that speaks the WHATWG Fetch API.
 */
export function createServer(config: RegionOrchestratorConfig): {
  fetch: (req: Request) => Promise<Response>;
  registry: RegionRegistry;
  store: ServiceStore;
} {
  const registry = new RegionRegistry();
  const store = new ServiceStore();
  const now = config.now ?? Date.now;
  const predictor = config.predictor ?? new EmaSeasonalPredictor();

  const requireAdmin = (req: Request): Response | undefined => {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${config.adminToken}`) {
      return json(401, { error: "unauthorised" });
    }
    return undefined;
  };

  const decideFor = (serviceId: string): ScalingDecision | undefined => {
    const entry = store.get(serviceId);
    if (!entry) return undefined;
    const decision = decideScaling({
      serviceId,
      now: now(),
      regions: registry.list(),
      states: entry.states,
      recentTraffic: entry.recentTraffic,
      latencyBudgetMs: entry.latencyBudgetMs,
      costBudgetUsdPerHour: entry.costBudgetUsdPerHour,
      targetQpsPerInstance: entry.targetQpsPerInstance,
      predictor,
    });
    store.recordDecision(serviceId, decision);
    return decision;
  };

  const fetch = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const { pathname } = url;
    const method = req.method.toUpperCase();

    try {
      // ---- Admin: regions ----
      if (pathname === "/regions") {
        if (method === "GET") {
          return json(200, { regions: registry.list() });
        }
        if (method === "POST") {
          const guard = requireAdmin(req);
          if (guard) return guard;
          const body = await req.json();
          const region = registry.upsert(body);
          return json(201, { region });
        }
      }

      const regionMatch = pathname.match(/^\/regions\/([^/]+)$/u);
      if (regionMatch && method === "DELETE") {
        const guard = requireAdmin(req);
        if (guard) return guard;
        const id = regionMatch[1];
        if (!id) return json(400, { error: "missing region id" });
        const ok = registry.delete(id);
        return ok ? json(204, {}) : json(404, { error: "not found" });
      }

      // ---- Service routes ----
      const stateMatch = pathname.match(/^\/services\/([^/]+)\/state$/u);
      if (stateMatch && method === "POST") {
        const id = stateMatch[1];
        if (!id) return json(400, { error: "missing service id" });
        const body = SubmitStateBodySchema.parse(await req.json());
        store.put(id, body);
        return json(200, { accepted: true });
      }

      const decisionMatch = pathname.match(/^\/services\/([^/]+)\/decision$/u);
      if (decisionMatch && method === "GET") {
        const id = decisionMatch[1];
        if (!id) return json(400, { error: "missing service id" });
        const decision = decideFor(id);
        if (!decision) return json(404, { error: "service not found" });
        return json(200, decision);
      }

      const predMatch = pathname.match(/^\/services\/([^/]+)\/predictions$/u);
      if (predMatch && method === "GET") {
        const id = predMatch[1];
        if (!id) return json(400, { error: "missing service id" });
        const entry = store.get(id);
        if (!entry) return json(404, { error: "service not found" });
        const series = predictor.predictNextHour(id, entry.recentTraffic, now());
        return json(200, series);
      }

      return json(404, { error: "not found" });
    } catch (err) {
      return json(400, errorBody(err));
    }
  };

  return { fetch, registry, store };
}
