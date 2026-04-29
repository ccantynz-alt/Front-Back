// ── BuildRequested transport ────────────────────────────────────────────
//
// The webhook receiver is intentionally agnostic about how
// BuildRequested messages reach the build-runner. v1 ships two
// transports:
//
//   InProcessTransport – a simple in-memory channel used by tests and by
//                        single-process deploys where the build-runner is
//                        embedded.
//
//   HttpFanoutTransport – POSTs the JSON-serialised BuildRequested to a
//                         set of subscriber URLs. Concurrent fan-out, with
//                         per-target timeout and best-effort retry. Any
//                         subscriber failure is reported back so the
//                         caller can decide whether to NACK the webhook.
//
// Agent 3 (deploy-orchestrator) consumes BuildRequested through ONE of
// these transports — either by registering an InProcess listener if it
// runs in-process, or by exposing an HTTP endpoint we POST to.

import type { BuildRequested } from "./schemas";

export interface BuildRequestTransport {
  publish(event: BuildRequested): Promise<TransportResult>;
}

export interface TransportResult {
  ok: boolean;
  delivered: number;
  failures: TransportFailure[];
}

export interface TransportFailure {
  target: string;
  reason: string;
}

// ── In-process channel ─────────────────────────────────────────────────

export type InProcessListener = (event: BuildRequested) => void | Promise<void>;

export class InProcessTransport implements BuildRequestTransport {
  private readonly listeners: Set<InProcessListener> = new Set();

  subscribe(listener: InProcessListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async publish(event: BuildRequested): Promise<TransportResult> {
    const failures: TransportFailure[] = [];
    let delivered = 0;
    for (const listener of this.listeners) {
      try {
        await listener(event);
        delivered++;
      } catch (err) {
        failures.push({
          target: "inproc",
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { ok: failures.length === 0, delivered, failures };
  }
}

// ── HTTP fan-out ───────────────────────────────────────────────────────

export interface HttpFanoutOptions {
  // Subscriber URLs receive POST requests with a JSON body matching
  // BuildRequestedSchema and a `Content-Type: application/json` header.
  subscribers: readonly string[];
  // Per-request timeout in ms. Default 5_000.
  timeoutMs?: number;
  // Optional shared secret used to sign outbound POSTs as
  // `X-Crontech-Signature: sha256=<hex>`. Downstream consumers should
  // verify this the same way GitHub signatures are verified upstream.
  outboundSecret?: string;
  // Override for testing.
  fetchImpl?: typeof fetch;
}

export class HttpFanoutTransport implements BuildRequestTransport {
  private readonly subscribers: readonly string[];
  private readonly timeoutMs: number;
  private readonly outboundSecret: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: HttpFanoutOptions) {
    this.subscribers = opts.subscribers;
    this.timeoutMs = opts.timeoutMs ?? 5_000;
    this.outboundSecret = opts.outboundSecret;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async publish(event: BuildRequested): Promise<TransportResult> {
    const body = JSON.stringify(event);
    const results = await Promise.all(
      this.subscribers.map((target) => this.deliver(target, body)),
    );
    const failures = results.filter(
      (r): r is TransportFailure => r !== null,
    );
    return {
      ok: failures.length === 0,
      delivered: results.length - failures.length,
      failures,
    };
  }

  private async deliver(
    target: string,
    body: string,
  ): Promise<TransportFailure | null> {
    const ac = new AbortController();
    const timer = setTimeout(() => {
      ac.abort();
    }, this.timeoutMs);
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (this.outboundSecret !== undefined) {
        const { computeSignature } = await import("./hmac");
        headers["x-crontech-signature"] = computeSignature(
          this.outboundSecret,
          body,
        );
      }
      const res = await this.fetchImpl(target, {
        method: "POST",
        headers,
        body,
        signal: ac.signal,
      });
      if (!res.ok) {
        return { target, reason: `HTTP ${res.status}` };
      }
      return null;
    } catch (err) {
      return {
        target,
        reason: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
