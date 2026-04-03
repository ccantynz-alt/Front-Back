import type { MiddlewareHandler } from "hono";
import { createSpan, recordMetric } from "@back-to-the-future/config/otel";

/**
 * Hono middleware that wraps each request in an OpenTelemetry span
 * and records request duration as a histogram metric.
 */
export const telemetryMiddleware: MiddlewareHandler = async (c, next) => {
  const method = c.req.method;
  const path = c.req.path;
  const start = performance.now();

  await createSpan(`HTTP ${method} ${path}`, async (span) => {
    span.setAttribute("http.method", method);
    span.setAttribute("http.target", path);
    span.setAttribute("http.url", c.req.url);

    const userAgent = c.req.header("user-agent");
    if (userAgent) {
      span.setAttribute("http.user_agent", userAgent);
    }

    await next();

    const status = c.res.status;
    const durationMs = performance.now() - start;

    span.setAttribute("http.status_code", status);
    span.setAttribute("http.response.duration_ms", durationMs);

    recordMetric("http.server.request.duration", durationMs, {
      "http.method": method,
      "http.route": path,
      "http.status_code": status,
    });
  });
};
