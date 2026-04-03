import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { Resource } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import {
  type Span,
  SpanStatusCode,
  context,
  trace,
  metrics,
} from "@opentelemetry/api";

let sdk: NodeSDK | undefined;

/**
 * Initialize OpenTelemetry SDK with OTLP exporters.
 *
 * Must be called **before** any other imports so auto-instrumentation
 * can patch modules at load time.
 */
export function initTelemetry(serviceName: string): NodeSDK {
  const endpoint =
    process.env["OTEL_EXPORTER_OTLP_ENDPOINT"] ?? "http://localhost:4318";
  const version = process.env["OTEL_SERVICE_VERSION"] ?? "0.0.1";

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: process.env["OTEL_SERVICE_NAME"] ?? serviceName,
    [ATTR_SERVICE_VERSION]: version,
  });

  const traceExporter = new OTLPTraceExporter({
    url: `${endpoint}/v1/traces`,
  });

  const metricExporter = new OTLPMetricExporter({
    url: `${endpoint}/v1/metrics`,
  });

  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 15_000,
  });

  sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable fs instrumentation to reduce noise
        "@opentelemetry/instrumentation-fs": { enabled: false },
      }),
    ],
  });

  sdk.start();

  // Graceful shutdown
  const shutdown = (): void => {
    sdk
      ?.shutdown()
      .then(() => {
        console.log("OpenTelemetry SDK shut down successfully");
      })
      .catch((err: unknown) => {
        console.error("Error shutting down OpenTelemetry SDK", err);
      })
      .finally(() => {
        process.exit(0);
      });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  console.log(
    `OpenTelemetry initialized for service "${serviceName}" -> ${endpoint}`,
  );

  return sdk;
}

/**
 * Create a traced span around an async function.
 *
 * Usage:
 * ```ts
 * const result = await createSpan("myOperation", async (span) => {
 *   span.setAttribute("key", "value");
 *   return doWork();
 * });
 * ```
 */
export async function createSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer("back-to-the-future");
  return tracer.startActiveSpan(name, async (span: Span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      span.recordException(
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Record a metric value with optional attributes.
 *
 * Creates (or reuses) a histogram instrument under the given name.
 */
const meterCache = new Map<
  string,
  ReturnType<ReturnType<typeof metrics.getMeter>["createHistogram"]>
>();

export function recordMetric(
  name: string,
  value: number,
  attributes?: Record<string, string | number | boolean>,
): void {
  const meter = metrics.getMeter("back-to-the-future");
  let histogram = meterCache.get(name);
  if (!histogram) {
    histogram = meter.createHistogram(name);
    meterCache.set(name, histogram);
  }
  histogram.record(value, attributes);
}

// Re-export commonly used OTel types for convenience
export { type Span, SpanStatusCode, context, trace, metrics };
