import { NodeSDK } from "@opentelemetry/sdk-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { trace, metrics, SpanStatusCode } from "@opentelemetry/api";
import type { Span } from "@opentelemetry/api";

// ── OpenTelemetry Configuration ──────────────────────────────────────
// Observability across edge, cloud, and client -- including AI agent
// behavior, inference latency, and token usage.

const SERVICE_NAME = "back-to-the-future-api";
const SERVICE_VERSION = "0.0.1";

export function initTelemetry(): NodeSDK | null {
  const otlpEndpoint = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];

  // Skip telemetry initialization if no endpoint configured
  if (!otlpEndpoint) {
    console.log("OpenTelemetry: No OTEL_EXPORTER_OTLP_ENDPOINT set, telemetry disabled");
    return null;
  }

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
    "deployment.environment": process.env["NODE_ENV"] ?? "development",
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
  console.log(`OpenTelemetry: Initialized (endpoint: ${otlpEndpoint})`);

  return sdk;
}

// ── Tracer & Meter Helpers ───────────────────────────────────────────

export const tracer = trace.getTracer(SERVICE_NAME, SERVICE_VERSION);
export const meter = metrics.getMeter(SERVICE_NAME, SERVICE_VERSION);

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
      const { tokens, result } = await fn(span);
      const duration = performance.now() - start;
      aiInferenceLatency.record(duration, { model });
      if (tokens) {
        aiTokensUsed.add(tokens, { model });
        span.setAttribute("ai.tokens", tokens);
      }
      span.setAttribute("ai.latency_ms", Math.round(duration));
      return result;
    },
    { "ai.model": model },
  );
}
