import { SpanStatusCode, metrics, trace } from "@opentelemetry/api";
import type { Span } from "@opentelemetry/api";
// `@opentelemetry/sdk-node` pulls in Node built-ins (fs, async_hooks, etc.)
// that Cloudflare Workers cannot parse. Import the type only at the top; the
// value import happens lazily inside `initTelemetry()` so that Workers can
// bundle this module without ReferenceErrors. Bun and Node evaluate the
// dynamic import normally.
import type { NodeSDK } from "@opentelemetry/sdk-node";
import { log } from "./log";
import {
  PROJECT_INFLIGHT_GRACE_MS,
  _getProjectInflightSnapshot,
  _resetProjectInflight,
  decrementProjectInflight,
  incrementProjectInflight,
  projectInflightMap,
} from "./telemetry/inflight-state";
import { withProjectAttrs } from "./telemetry/project-attribution";

export {
  PROJECT_INFLIGHT_GRACE_MS,
  _getProjectInflightSnapshot,
  _resetProjectInflight,
  decrementProjectInflight,
  incrementProjectInflight,
};

// ── OpenTelemetry Configuration ──────────────────────────────────────
// Observability across edge, cloud, and client -- including AI agent
// behavior, inference latency, and token usage.

const SERVICE_NAME = "back-to-the-future-api";
const SERVICE_VERSION = "0.0.1";

export async function initTelemetry(): Promise<NodeSDK | null> {
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  // Skip telemetry initialization if no endpoint configured
  if (!otlpEndpoint) {
    log.info("OpenTelemetry: No OTEL_EXPORTER_OTLP_ENDPOINT set, telemetry disabled");
    return null;
  }

  // Lazy-load every Node-only module so Workers never tries to bundle them.
  // The dynamic imports only fire when OTEL_EXPORTER_OTLP_ENDPOINT is set,
  // which is a Node/Bun-only configuration path.
  const [
    { NodeSDK },
    { resourceFromAttributes },
    { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION },
    { OTLPTraceExporter },
    { OTLPMetricExporter },
    { PeriodicExportingMetricReader },
    { BatchSpanProcessor },
  ] = await Promise.all([
    import("@opentelemetry/sdk-node"),
    import("@opentelemetry/resources"),
    import("@opentelemetry/semantic-conventions"),
    import("@opentelemetry/exporter-trace-otlp-http"),
    import("@opentelemetry/exporter-metrics-otlp-http"),
    import("@opentelemetry/sdk-metrics"),
    import("@opentelemetry/sdk-trace-base"),
  ]);

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
    "deployment.environment": process.env.NODE_ENV ?? "development",
  });

  const traceExporter = new OTLPTraceExporter({
    url: `${otlpEndpoint}/v1/traces`,
  });

  const metricExporter = new OTLPMetricExporter({
    url: `${otlpEndpoint}/v1/metrics`,
  });

  const sdk = new NodeSDK({
    resource,
    spanProcessors: [new BatchSpanProcessor(traceExporter)],
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 30_000,
    }),
  });

  sdk.start();
  log.info(`OpenTelemetry: Initialized (endpoint: ${otlpEndpoint})`);

  return sdk;
}

// ── Tracer & Meter Helpers ───────────────────────────────────────────

export const tracer = trace.getTracer(SERVICE_NAME, SERVICE_VERSION);
export const meter = metrics.getMeter(SERVICE_NAME, SERVICE_VERSION);

// ── In-Memory Metrics Counters ──────────────────────────────────────
// These track values locally so getMetrics() can return stats without
// needing to read from the OTel export pipeline.

interface MetricsSnapshot {
  totalRequests: number;
  activeWebSocketConnections: number;
  aiInferenceCalls: { client: number; edge: number; cloud: number };
  totalResponseTimeMs: number;
  startedAt: string;
}

const metricsState: MetricsSnapshot = {
  totalRequests: 0,
  activeWebSocketConnections: 0,
  aiInferenceCalls: { client: 0, edge: 0, cloud: 0 },
  totalResponseTimeMs: 0,
  startedAt: new Date().toISOString(),
};

/** Record an HTTP request (called from middleware). */
export function recordRequest(durationMs: number): void {
  metricsState.totalRequests++;
  metricsState.totalResponseTimeMs += durationMs;
}

/** Record a WebSocket connection change. */
export function recordWsConnection(delta: 1 | -1): void {
  metricsState.activeWebSocketConnections += delta;
}

/** Record an AI inference call by compute tier. */
export function recordAiInference(tier: "client" | "edge" | "cloud"): void {
  metricsState.aiInferenceCalls[tier]++;
}

/** Get a snapshot of current metrics for the health dashboard. */
export function getMetrics(): {
  totalRequests: number;
  activeWebSocketConnections: number;
  aiInferenceCalls: { client: number; edge: number; cloud: number };
  averageResponseTimeMs: number;
  uptimeSeconds: number;
} {
  const uptimeSeconds = Math.round(
    (Date.now() - new Date(metricsState.startedAt).getTime()) / 1000,
  );
  const averageResponseTimeMs =
    metricsState.totalRequests > 0
      ? Math.round(metricsState.totalResponseTimeMs / metricsState.totalRequests)
      : 0;

  return {
    totalRequests: metricsState.totalRequests,
    activeWebSocketConnections: metricsState.activeWebSocketConnections,
    aiInferenceCalls: { ...metricsState.aiInferenceCalls },
    averageResponseTimeMs,
    uptimeSeconds,
  };
}

// ── Pre-built Metrics ────────────────────────────────────────────────

export const httpRequestDuration = meter.createHistogram("http.request.duration", {
  description: "HTTP request duration in milliseconds",
  unit: "ms",
});

export const httpRequestCount = meter.createCounter("http.request.count", {
  description: "Total HTTP requests",
});

export const aiInferenceLatency = meter.createHistogram("ai.inference.latency", {
  description: "AI inference latency in milliseconds",
  unit: "ms",
});

export const aiTokensUsed = meter.createCounter("ai.tokens.used", {
  description: "Total AI tokens consumed",
});

export const wsConnectionCount = meter.createUpDownCounter("ws.connections.active", {
  description: "Active WebSocket connections",
});

// ── Per-Project In-Flight Requests (Observable Gauge) ────────────────
//
// WHY THIS EXISTS
//   Process-level metrics (CPU, memory, disk) are emitted by the OTel
//   SDK via ObservableCallbacks that sample the host once per scrape
//   interval. They are NOT request-scoped, so they don't see our
//   AsyncLocalStorage frame and cannot carry a `project_id` label
//   honestly — a single process serves many projects simultaneously.
//
//   `/projects/[id]/metrics` needs at least one real "is this project
//   seeing traffic right now?" series to light up. This gauge fills
//   that gap: we count, per project_id, how many requests are in
//   flight at any given moment. The Hono attribution middleware
//   increments on entry and decrements on exit — so the gauge is
//   always honest: if a project has no traffic, its series drops to
//   0 and is eventually evicted (see EVICTION below).
//
// EVICTION STRATEGY
//   When a project's in-flight count drops to 0 we keep it in the
//   map for a grace window (5 minutes) so the gauge can still emit
//   "0" samples — that lets Mimir render the return-to-idle edge
//   cleanly instead of dropping the series the instant traffic
//   stops. After the grace window, the entry is pruned and the
//   series goes stale in Mimir (which is the correct behaviour —
//   an idle project shouldn't keep publishing a zero every 30s
//   forever).
//
// HONEST FALLBACK
//   The gauge emits nothing when no projects are active. Mimir
//   queries on `project_requests_inflight{project_id="..."}` return
//   empty results, the UI shows its empty state. No fake data.

export const projectRequestsInflight = meter.createObservableGauge("project.requests.inflight", {
  description: "Number of HTTP requests currently in flight, labelled by project_id",
});

projectRequestsInflight.addCallback((observableResult) => {
  const now = Date.now();
  // Walk the map. For each entry: emit the count (even if 0 within
  // the grace window), and prune idle-too-long entries.
  for (const [projectId, entry] of projectInflightMap) {
    if (entry.count === 0 && now - entry.lastActiveMs > PROJECT_INFLIGHT_GRACE_MS) {
      projectInflightMap.delete(projectId);
      continue;
    }
    observableResult.observe(entry.count, { project_id: projectId });
  }
});

// ── Span Helpers ─────────────────────────────────────────────────────

export function traceAsync<T>(
  spanName: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>,
): Promise<T> {
  return tracer.startActiveSpan(spanName, async (span) => {
    if (attributes) {
      for (const [key, value] of Object.entries(attributes)) {
        span.setAttribute(key, value);
      }
    }
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  });
}

export function traceAICall(
  model: string,
  fn: (span: Span) => Promise<{ tokens?: number; result: unknown }>,
): Promise<unknown> {
  return traceAsync(
    "ai.inference",
    async (span) => {
      span.setAttribute("ai.model", model);
      const start = performance.now();
      let tokens: number | undefined;
      let duration = 0;
      try {
        const ret = await fn(span);
        tokens = ret.tokens;
        duration = performance.now() - start;
        // `withProjectAttrs` attaches the current AsyncLocalStorage
        // project_id (when a request is project-scoped) so per-project
        // AI dashboards can filter by it.
        aiInferenceLatency.record(duration, withProjectAttrs({ model }));
        if (tokens) {
          aiTokensUsed.add(tokens, withProjectAttrs({ model }));
          span.setAttribute("ai.tokens", tokens);
        }
        span.setAttribute("ai.latency_ms", Math.round(duration));
        return ret.result;
      } catch (err) {
        // Even on failure we emit a latency sample so a noisy, crashing
        // inference path shows up in the per-project dashboard rather
        // than being silent. Errors still propagate.
        duration = performance.now() - start;
        aiInferenceLatency.record(duration, withProjectAttrs({ model, status: "error" }));
        span.setAttribute("ai.latency_ms", Math.round(duration));
        throw err;
      }
    },
    { "ai.model": model },
  );
}

/** Wrap a tRPC-like procedure call with an OpenTelemetry span. */
export function traceProcedure<T>(procedureName: string, fn: () => Promise<T>): Promise<T> {
  return traceAsync(
    `trpc.${procedureName}`,
    async (span) => {
      span.setAttribute("rpc.system", "trpc");
      span.setAttribute("rpc.method", procedureName);
      return await fn();
    },
    { "rpc.system": "trpc", "rpc.method": procedureName },
  );
}
