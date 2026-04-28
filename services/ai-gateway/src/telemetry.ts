// ── OpenTelemetry Span Emission ───────────────────────────────────────
// We don't pin a heavyweight OTel SDK in the gateway — the platform
// already runs its OTel collector at the edge worker layer (CLAUDE.md
// §3 Observability). The gateway emits structured span records to a
// pluggable sink; in production the sink forwards to the collector,
// in tests it pushes to an array we can assert against.

import type { ProviderName } from "./types";

export interface GatewaySpan {
  /** Logical operation name (e.g. "ai-gateway.chat.completions"). */
  name: string;
  /** Wall-clock start time, milliseconds since epoch. */
  startMs: number;
  /** Wall-clock duration, milliseconds. */
  durationMs: number;
  /** "ok" | "error" — mirrored from the HTTP status the gateway returns. */
  status: "ok" | "error";
  attributes: {
    customerId?: string;
    keyMode?: "byok" | "managed";
    provider?: ProviderName;
    model?: string;
    cacheHit?: "exact" | "semantic" | "miss";
    fallbackUsed?: boolean;
    fallbackProvider?: ProviderName;
    promptTokens?: number;
    completionTokens?: number;
    httpStatus?: number;
    streaming?: boolean;
    error?: string;
  };
}

export interface SpanSink {
  emit(span: GatewaySpan): void;
}

/** No-op sink. Used when no backend is configured. */
export class NoopSpanSink implements SpanSink {
  emit(_span: GatewaySpan): void {
    // intentionally empty
  }
}

/** Test sink that retains every span in memory for assertions. */
export class InMemorySpanSink implements SpanSink {
  readonly spans: GatewaySpan[] = [];
  emit(span: GatewaySpan): void {
    this.spans.push(span);
  }
  reset(): void {
    this.spans.length = 0;
  }
}

export const defaultSpanSink: SpanSink = new NoopSpanSink();

export function nowMs(): number {
  return Date.now();
}
