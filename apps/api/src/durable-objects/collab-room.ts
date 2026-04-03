/**
 * CollabRoom Durable Object — stateful WebSocket handler for real-time
 * collaboration using the Yjs CRDT protocol.
 *
 * Each room is a single Durable Object instance. Cloudflare guarantees
 * single-threaded execution per instance, so no locks are needed.
 *
 * Protocol: Binary Yjs sync + awareness messages over WebSocket.
 */

import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

// ── Message Types ───────────────────────────────────────────────

const MSG_SYNC_STEP_1 = 0;
const MSG_SYNC_STEP_2 = 1;
const MSG_SYNC_UPDATE = 2;
const MSG_AWARENESS = 3;

// ── Durable Object ─────────────────────────────────────────────

export class CollabRoom implements DurableObject {
  private readonly state: DurableObjectState;
  private readonly doc: Y.Doc;
  private readonly connections: Map<WebSocket, { clientId?: number }>;
  private readonly awarenessStates: Map<number, string>;
  private initialized: boolean;

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state;
    this.doc = new Y.Doc();
    this.connections = new Map();
    this.awarenessStates = new Map();
    this.initialized = false;
  }

  /**
   * Load persisted Y.Doc state from Durable Object storage.
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const stored = await this.state.storage.get<ArrayBuffer>("yjs-state");
    if (stored) {
      Y.applyUpdate(this.doc, new Uint8Array(stored));
    }
  }

  /**
   * Persist the full Y.Doc state to Durable Object storage.
   */
  private async persist(): Promise<void> {
    const update = Y.encodeStateAsUpdate(this.doc);
    await this.state.storage.put("yjs-state", update.buffer);
  }

  /**
   * HTTP fetch handler. Accepts WebSocket upgrade requests.
   */
  async fetch(request: Request): Promise<Response> {
    await this.initialize();

    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          connections: this.connections.size,
          awareness: this.awarenessStates.size,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // WebSocket upgrade
    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    this.handleSession(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  /**
   * Handle a single WebSocket session (connect, message, close).
   */
  private handleSession(ws: WebSocket): void {
    ws.accept();
    this.connections.set(ws, {});

    // Send sync step 1 to the new client (our state vector)
    const syncEncoder = encoding.createEncoder();
    encoding.writeVarUint(syncEncoder, MSG_SYNC_STEP_1);
    syncProtocol.writeSyncStep1(syncEncoder, this.doc);
    ws.send(this.toArrayBuffer(encoding.toUint8Array(syncEncoder)));

    // Send existing awareness states
    this.sendExistingAwareness(ws);

    ws.addEventListener("message", (event: MessageEvent) => {
      if (event.data instanceof ArrayBuffer) {
        this.handleBinaryMessage(ws, new Uint8Array(event.data));
      }
    });

    ws.addEventListener("close", () => {
      this.handleDisconnect(ws);
    });

    ws.addEventListener("error", () => {
      this.handleDisconnect(ws);
    });
  }

  /**
   * Process a binary Yjs protocol message.
   */
  private handleBinaryMessage(ws: WebSocket, data: Uint8Array): void {
    const decoder = decoding.createDecoder(data);
    const messageType = decoding.readVarUint(decoder);

    switch (messageType) {
      case MSG_SYNC_STEP_1: {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MSG_SYNC_STEP_2);
        syncProtocol.readSyncStep1(decoder, encoder, this.doc);
        this.sendBinary(ws, encoding.toUint8Array(encoder));
        break;
      }

      case MSG_SYNC_STEP_2: {
        syncProtocol.readSyncStep2(decoder, this.doc, ws);
        break;
      }

      case MSG_SYNC_UPDATE: {
        syncProtocol.readUpdate(decoder, this.doc, ws);
        this.broadcast(data, ws);
        void this.persist();
        break;
      }

      case MSG_AWARENESS: {
        const count = decoding.readVarUint(decoder);
        for (let i = 0; i < count; i++) {
          const clientId = decoding.readVarUint(decoder);
          const stateJSON = decoding.readVarString(decoder);

          if (stateJSON === "") {
            this.awarenessStates.delete(clientId);
          } else {
            this.awarenessStates.set(clientId, stateJSON);
          }

          const meta = this.connections.get(ws);
          if (meta) meta.clientId = clientId;
        }
        this.broadcast(data, ws);
        break;
      }
    }
  }

  /**
   * Clean up when a WebSocket disconnects.
   */
  private handleDisconnect(ws: WebSocket): void {
    const meta = this.connections.get(ws);
    this.connections.delete(ws);

    if (meta?.clientId !== undefined) {
      this.awarenessStates.delete(meta.clientId);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_AWARENESS);
      encoding.writeVarUint(encoder, 1);
      encoding.writeVarUint(encoder, meta.clientId);
      encoding.writeVarString(encoder, "");
      this.broadcast(encoding.toUint8Array(encoder));
    }

    if (this.connections.size === 0) {
      void this.persist();
    }
  }

  /**
   * Send all current awareness states to a newly connected client.
   */
  private sendExistingAwareness(ws: WebSocket): void {
    if (this.awarenessStates.size === 0) return;

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_AWARENESS);
    encoding.writeVarUint(encoder, this.awarenessStates.size);

    for (const [clientId, stateJSON] of this.awarenessStates) {
      encoding.writeVarUint(encoder, clientId);
      encoding.writeVarString(encoder, stateJSON);
    }

    this.sendBinary(ws, encoding.toUint8Array(encoder));
  }

  /**
   * Broadcast a binary message to all connections except the sender.
   */
  private broadcast(data: Uint8Array, exclude?: WebSocket): void {
    const buf = this.toArrayBuffer(data);
    for (const [conn] of this.connections) {
      if (conn === exclude) continue;
      try {
        conn.send(buf);
      } catch {
        // Will be cleaned up on close event
      }
    }
  }

  private sendBinary(ws: WebSocket, data: Uint8Array): void {
    try {
      ws.send(this.toArrayBuffer(data));
    } catch {
      // Connection broken
    }
  }

  private toArrayBuffer(data: Uint8Array): ArrayBuffer {
    const buf = new ArrayBuffer(data.byteLength);
    new Uint8Array(buf).set(data);
    return buf;
  }
}
