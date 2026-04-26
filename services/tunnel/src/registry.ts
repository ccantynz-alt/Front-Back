// ── Origin connection registry + sub-protocol auth ───────────────────
//
// Pure data structures used by the edge daemon. Tracks live origin
// WebSocket connections by hostname and outstanding pending requests
// by correlation id. Exported separately from `edge.ts` so the edge
// listener stays under the per-file complexity ceiling.
// ─────────────────────────────────────────────────────────────────────

import { type ResponseFrame } from "./frame";
import { timingSafeEqual } from "./auth";

const PROTOCOL_PREFIX = "crontech-tunnel.v1.";

export interface ProtocolClaims {
  readonly secret: string;
  readonly hostname: string;
}

/**
 * Parse the `Sec-WebSocket-Protocol` value an origin presents at
 * upgrade. Returns the claimed shared secret and hostname, or null
 * if the format is wrong. Always pure — no I/O.
 */
export function parseProtocol(value: string | null | undefined): ProtocolClaims | null {
  if (!value) {
    return null;
  }
  if (!value.startsWith(PROTOCOL_PREFIX)) {
    return null;
  }
  const rest = value.slice(PROTOCOL_PREFIX.length);
  const dotIdx = rest.indexOf(".");
  if (dotIdx <= 0 || dotIdx === rest.length - 1) {
    return null;
  }
  const secret = rest.slice(0, dotIdx);
  const hostname = rest.slice(dotIdx + 1);
  if (secret.length === 0 || hostname.length === 0) {
    return null;
  }
  return { secret, hostname };
}

/**
 * Authenticate a parsed protocol claim. Constant-time comparison.
 */
export function authenticateProtocol(
  claims: ProtocolClaims | null,
  expectedSecret: string,
): boolean {
  if (!claims) {
    return false;
  }
  if (expectedSecret.length === 0) {
    return false;
  }
  return timingSafeEqual(claims.secret, expectedSecret);
}

// ── Connection registry ─────────────────────────────────────────────

export interface OriginConnection {
  /** Send a binary frame to this origin. */
  send(buf: Uint8Array<ArrayBuffer>): void;
  /** Mark the connection as closed. Used by the registry on drop. */
  close(): void;
  /** Stable identifier for diagnostics. */
  readonly id: string;
}

export interface PendingRequest {
  resolve(res: ResponseFrame): void;
  reject(err: Error): void;
}

export class OriginRegistry {
  private readonly connections = new Map<string, OriginConnection>();
  private readonly pending = new Map<string, PendingRequest>();

  register(hostname: string, conn: OriginConnection): void {
    const previous = this.connections.get(hostname);
    if (previous && previous.id !== conn.id) {
      previous.close();
    }
    this.connections.set(hostname, conn);
  }

  unregister(hostname: string, conn: OriginConnection): void {
    const current = this.connections.get(hostname);
    if (current && current.id === conn.id) {
      this.connections.delete(hostname);
    }
  }

  get(hostname: string): OriginConnection | undefined {
    return this.connections.get(hostname);
  }

  size(): number {
    return this.connections.size;
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
