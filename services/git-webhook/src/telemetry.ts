// ── Lightweight tracing shim ────────────────────────────────────────────
//
// The webhook handler needs to emit OpenTelemetry spans per the
// architecture rules in CLAUDE.md §6.4. We do not import the full
// `@opentelemetry/api` package here because this service is intended to
// run in stand-alone mode at the edge where the global tracer may not be
// installed; the shim degrades cleanly to a no-op while keeping the call
// sites identical to a real OTel API.
//
// When the platform-wide tracer is wired, swap `defaultTracer` for the
// real `trace.getTracer("crontech.git-webhook")` and the call sites
// continue to work.

export interface Span {
  setAttribute(key: string, value: string | number | boolean): void;
  recordError(err: unknown): void;
  end(): void;
}

export interface Tracer {
  startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span;
}

class NoopSpan implements Span {
  setAttribute(): void {
    /* no-op */
  }
  recordError(): void {
    /* no-op */
  }
  end(): void {
    /* no-op */
  }
}

class ConsoleSpan implements Span {
  private readonly attrs: Record<string, string | number | boolean> = {};
  private readonly start: number;
  constructor(
    private readonly name: string,
    initial: Record<string, string | number | boolean> = {},
  ) {
    this.attrs = { ...initial };
    this.start = Date.now();
  }
  setAttribute(key: string, value: string | number | boolean): void {
    this.attrs[key] = value;
  }
  recordError(err: unknown): void {
    this.attrs["error"] = err instanceof Error ? err.message : String(err);
  }
  end(): void {
    const duration = Date.now() - this.start;
    // One JSON line per span so log shippers can pick this up directly.
    // Loki + Grafana fan-out turns this into a real trace once the OTel
    // exporter is wired.
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        span: this.name,
        durationMs: duration,
        ...this.attrs,
      }),
    );
  }
}

export const noopTracer: Tracer = {
  startSpan(): Span {
    return new NoopSpan();
  },
};

export const consoleTracer: Tracer = {
  startSpan(name, attributes) {
    return new ConsoleSpan(name, attributes);
  },
};

let activeTracer: Tracer = process.env["NODE_ENV"] === "test" ? noopTracer : consoleTracer;

export function setTracer(tracer: Tracer): void {
  activeTracer = tracer;
}

export function getTracer(): Tracer {
  return activeTracer;
}
