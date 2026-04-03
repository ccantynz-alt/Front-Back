// ── Yjs Collaboration Session ────────────────────────────────────────
// Creates a Yjs Doc + WebSocket provider for CRDT-based real-time
// collaboration.  Handles reconnection internally via y-websocket.

import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
// Awareness type is re-exported by WebsocketProvider; use inline
// interface to avoid needing @types/y-protocols.
interface Awareness {
  getStates(): Map<number, Record<string, unknown>>;
  on(event: string, callback: (...args: unknown[]) => void): void;
  off(event: string, callback: (...args: unknown[]) => void): void;
}

export interface CollabSession {
  doc: Y.Doc;
  provider: WebsocketProvider;
  awareness: Awareness;
}

/**
 * Create a new Yjs collaboration session connected to the given room.
 *
 * @param roomId - Unique identifier for the collaborative document / room.
 * @param wsUrl  - WebSocket server URL (e.g. "wss://api.example.com").
 * @returns A CollabSession containing the doc, provider, and awareness.
 */
export function createCollabSession(
  roomId: string,
  wsUrl: string,
): CollabSession {
  const doc = new Y.Doc();

  // y-websocket handles reconnection automatically with exponential
  // back-off by default.  The provider also manages awareness.
  const provider = new WebsocketProvider(wsUrl, roomId, doc, {
    connect: true,
    // Allow the provider to manage its own reconnect logic.
    // maxBackoffTime defaults to 2500ms in y-websocket.
  });

  const awareness = provider.awareness;

  return { doc, provider, awareness };
}

/**
 * Cleanly tear down a collaboration session, disconnecting the WebSocket
 * and destroying the Yjs document to free memory.
 */
export function destroyCollabSession(session: CollabSession): void {
  session.provider.disconnect();
  session.provider.destroy();
  session.doc.destroy();
}
