import * as syncProtocol from "y-protocols/sync";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { CronixDocument } from "./document";
import { AwarenessManager } from "./awareness";
import type { UserAwareness } from "./awareness";
import { MessageType } from "./utils";

// ── Types ───────────────────────────────────────────────────────

export type CollabConnectionStatus = "disconnected" | "connecting" | "connected";

export interface CollabProviderOptions {
  /** WebSocket URL to connect to (e.g., ws://localhost:3001/api/collab/ws) */
  url: string;
  /** Room identifier for this collaboration session */
  roomId: string;
  /** The CronixDocument to sync */
  document: CronixDocument;
  /** The AwarenessManager for presence/cursor state */
  awareness: AwarenessManager;
  /** Initial reconnect delay in ms (default: 1000) */
  reconnectDelay?: number;
  /** Maximum reconnect delay in ms (default: 30000) */
  maxReconnectDelay?: number;
  /** Whether to connect immediately on construction (default: false) */
  autoConnect?: boolean;
}

// ── CollabProvider ──────────────────────────────────────────────

/**
 * WebSocket provider that syncs a CronixDocument and AwarenessManager
 * with the server using the Yjs binary sync protocol.
 *
 * Handles:
 * - Initial sync (state vector exchange + diff)
 * - Incremental updates (streamed as they happen)
 * - Awareness (cursor positions, selections, user info)
 * - Auto-reconnect with exponential backoff
 * - Room-based multiplexing
 */
export class CollabProvider {
  readonly document: CronixDocument;
  readonly awareness: AwarenessManager;
  readonly roomId: string;

  private url: string;
  private ws: WebSocket | null = null;
  private status: CollabConnectionStatus = "disconnected";
  private statusListeners: Set<(status: CollabConnectionStatus) => void> = new Set();

  private reconnectDelay: number;
  private maxReconnectDelay: number;
  private currentReconnectDelay: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private synced = false;

  private updateHandler: (update: Uint8Array, origin: unknown) => void;
  private awarenessChangeHandler: () => void;
  private destroyed = false;

  constructor(options: CollabProviderOptions) {
    this.url = options.url;
    this.roomId = options.roomId;
    this.document = options.document;
    this.awareness = options.awareness;
    this.reconnectDelay = options.reconnectDelay ?? 1000;
    this.maxReconnectDelay = options.maxReconnectDelay ?? 30000;
    this.currentReconnectDelay = this.reconnectDelay;

    // Listen to local document updates and forward to server
    this.updateHandler = (update: Uint8Array, origin: unknown): void => {
      if (origin === this) return; // Ignore updates we applied from the server
      this.sendUpdate(update);
    };
    this.document.ydoc.on("update", this.updateHandler);

    // Listen to local awareness changes and forward to server
    this.awarenessChangeHandler = (): void => {
      this.sendAwarenessState();
    };
    this.awareness.onAwarenessChange(this.awarenessChangeHandler);

    if (options.autoConnect) {
      this.connect();
    }
  }

  // ── Connection Management ───────────────────────────────────

  /**
   * Connects to the collaboration WebSocket endpoint.
   * Appends the roomId as a query parameter.
   */
  connect(): void {
    if (this.destroyed) return;
    if (this.ws !== null) return;

    this.intentionalClose = false;
    this.setStatus("connecting");

    const separator = this.url.includes("?") ? "&" : "?";
    const wsUrl = `${this.url}${separator}room=${encodeURIComponent(this.roomId)}`;

    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.binaryType = "arraybuffer";

      this.ws.onopen = (): void => {
        this.setStatus("connected");
        this.currentReconnectDelay = this.reconnectDelay;
        this.synced = false;

        // Initiate Yjs sync: send sync step 1 (our state vector)
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MessageType.SYNC_STEP_1);
        syncProtocol.writeSyncStep1(encoder, this.document.ydoc);
        this.sendBinary(encoding.toUint8Array(encoder));

        // Send current awareness state
        this.sendAwarenessState();
      };

      this.ws.onmessage = (event: MessageEvent): void => {
        this.handleMessage(event.data as ArrayBuffer);
      };

      this.ws.onclose = (): void => {
        this.ws = null;
        this.synced = false;
        this.setStatus("disconnected");

        if (!this.intentionalClose && !this.destroyed) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (): void => {
        // onclose will fire after onerror, so reconnect is handled there
      };
    } catch {
      this.ws = null;
      this.setStatus("disconnected");
      if (!this.destroyed) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Disconnects from the server. Does not auto-reconnect.
   */
  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }

    this.synced = false;
    this.setStatus("disconnected");
  }

  /**
   * Returns the current connection status.
   */
  getStatus(): CollabConnectionStatus {
    return this.status;
  }

  /**
   * Returns whether the initial sync has completed.
   */
  isSynced(): boolean {
    return this.synced;
  }

  /**
   * Registers a callback for connection status changes.
   * Returns an unsubscribe function.
   */
  onStatusChange(callback: (status: CollabConnectionStatus) => void): () => void {
    this.statusListeners.add(callback);
    return (): void => {
      this.statusListeners.delete(callback);
    };
  }

  /**
   * Destroys the provider, closing the connection and cleaning up all listeners.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.disconnect();
    this.document.ydoc.off("update", this.updateHandler);
    this.statusListeners.clear();
  }

  // ── Message Handling ────────────────────────────────────────

  private handleMessage(data: ArrayBuffer): void {
    const decoder = decoding.createDecoder(new Uint8Array(data));
    const messageType = decoding.readVarUint(decoder) as MessageType;

    switch (messageType) {
      case MessageType.SYNC_STEP_1: {
        // Server sent its state vector — reply with sync step 2 (our diff)
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MessageType.SYNC_STEP_2);
        syncProtocol.readSyncStep1(decoder, encoder, this.document.ydoc);
        this.sendBinary(encoding.toUint8Array(encoder));
        break;
      }

      case MessageType.SYNC_STEP_2: {
        // Server sent its diff — apply it
        syncProtocol.readSyncStep2(decoder, this.document.ydoc, this);
        if (!this.synced) {
          this.synced = true;
        }
        break;
      }

      case MessageType.SYNC_UPDATE: {
        // Incremental update from another peer
        syncProtocol.readUpdate(decoder, this.document.ydoc, this);
        break;
      }

      case MessageType.AWARENESS: {
        // Awareness update from server
        this.handleAwarenessMessage(decoder);
        break;
      }
    }
  }

  private handleAwarenessMessage(decoder: decoding.Decoder): void {
    // Read the awareness update payload
    const length = decoding.readVarUint(decoder);
    for (let i = 0; i < length; i++) {
      const clientId = decoding.readVarUint(decoder);
      const stateJSON = decoding.readVarString(decoder);

      if (clientId === this.awareness.getLocalClientId()) continue; // Skip our own

      if (stateJSON === "") {
        // Client disconnected
        this.awareness.removeState(clientId);
      } else {
        try {
          const state = JSON.parse(stateJSON) as UserAwareness;
          this.awareness.setRemoteState(clientId, state);
        } catch {
          // Malformed awareness state — skip
        }
      }
    }
  }

  // ── Sending ─────────────────────────────────────────────────

  private sendBinary(data: Uint8Array): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Create a new ArrayBuffer copy to satisfy strict WebSocket.send() types
      const buf = new ArrayBuffer(data.byteLength);
      new Uint8Array(buf).set(data);
      this.ws.send(buf);
    }
  }

  private sendUpdate(update: Uint8Array): void {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MessageType.SYNC_UPDATE);
    encoding.writeVarUint8Array(encoder, update);
    this.sendBinary(encoding.toUint8Array(encoder));
  }

  private sendAwarenessState(): void {
    const localState = this.awareness.getLocalState();
    if (!localState) return;

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MessageType.AWARENESS);
    // Encode: count=1, clientId, JSON state
    encoding.writeVarUint(encoder, 1);
    encoding.writeVarUint(encoder, this.awareness.getLocalClientId());
    encoding.writeVarString(encoder, JSON.stringify(localState));
    this.sendBinary(encoding.toUint8Array(encoder));
  }

  // ── Reconnect ───────────────────────────────────────────────

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout((): void => {
      this.currentReconnectDelay = Math.min(
        this.currentReconnectDelay * 2,
        this.maxReconnectDelay,
      );
      this.connect();
    }, this.currentReconnectDelay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ── Status ──────────────────────────────────────────────────

  private setStatus(status: CollabConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }
}
