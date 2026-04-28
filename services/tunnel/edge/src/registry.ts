// ── Origin registry (edge-side) ────────────────────────────────────
//
// Tracks live origin connections by hostname. v1 introduces:
//
//   - Multi-hostname per origin: one origin can advertise N hostnames,
//     all routed to the same WebSocket.
//   - Multi-origin per hostname: future-proofs for redundancy. We
//     currently keep only the most recent connection per hostname
//     (latest wins, previous is closed) but the data model permits
//     storing a set if we add round-robin in v2.
//   - Pending request correlation by `id` with reject-on-disconnect.
// ─────────────────────────────────────────────────────────────────────

import type { ResponseFrame } from "../../shared/frame";

export interface OriginConnection {
  /** Stable id for diagnostics. Random per connect. */
  readonly id: string;
  /** Origin id from the verified token claims. */
  readonly originId: string;
  /** Send a binary frame over the underlying WebSocket. */
  send(buf: Uint8Array<ArrayBuffer>): void;
  /** Close the WebSocket. */
  close(code?: number, reason?: string): void;
  /** Hostnames this connection advertised. */
  readonly hostnames: readonly string[];
}

export interface PendingRequest {
  resolve(res: ResponseFrame): void;
  reject(err: Error): void;
  /** Connection id this pending request was dispatched to. */
  readonly connectionId: string;
}

export class OriginRegistry {
  private readonly byHostname = new Map<string, OriginConnection>();
  private readonly byConnId = new Map<string, OriginConnection>();
  private readonly pending = new Map<string, PendingRequest>();

  register(conn: OriginConnection): void {
    this.byConnId.set(conn.id, conn);
    for (const hostname of conn.hostnames) {
      const previous = this.byHostname.get(hostname);
      if (previous && previous.id !== conn.id) {
        previous.close(4001, `displaced by ${conn.id}`);
      }
      this.byHostname.set(hostname, conn);
    }
  }

  unregister(conn: OriginConnection): void {
    this.byConnId.delete(conn.id);
    for (const hostname of conn.hostnames) {
      const current = this.byHostname.get(hostname);
      if (current && current.id === conn.id) {
        this.byHostname.delete(hostname);
      }
    }
    // Reject any pending requests bound to this connection.
    for (const [id, p] of this.pending) {
      if (p.connectionId === conn.id) {
        this.pending.delete(id);
        p.reject(new Error("origin connection closed"));
      }
    }
  }

  get(hostname: string): OriginConnection | undefined {
    return this.byHostname.get(hostname);
  }

  hostnameCount(): number {
    return this.byHostname.size;
  }

  connectionCount(): number {
    return this.byConnId.size;
  }

  trackPending(id: string, pending: PendingRequest): void {
    this.pending.set(id, pending);
  }

  resolvePending(id: string, res: ResponseFrame): boolean {
    const entry = this.pending.get(id);
    if (!entry) {
      return false;
    }
    this.pending.delete(id);
    entry.resolve(res);
    return true;
  }

  rejectPending(id: string, err: Error): boolean {
    const entry = this.pending.get(id);
    if (!entry) {
      return false;
    }
    this.pending.delete(id);
    entry.reject(err);
    return true;
  }

  pendingCount(): number {
    return this.pending.size;
  }
}
