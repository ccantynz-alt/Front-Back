import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import type { ServerWebSocket } from "bun";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

// ── Message Types ───────────────────────────────────────────────

const MSG_SYNC_STEP_1 = 0;
const MSG_SYNC_STEP_2 = 1;
const MSG_SYNC_UPDATE = 2;
const MSG_AWARENESS = 3;

// ── Room Document State ─────────────────────────────────────────

interface RoomState {
  /** The authoritative Y.Doc for this room */
  doc: Y.Doc;
  /** All connected WebSockets for this room */
  connections: Set<WebSocket>;
  /** Awareness states keyed by clientId -> JSON string */
  awarenessStates: Map<number, string>;
  /** Timer for periodic persistence */
  persistTimer: ReturnType<typeof setInterval> | null;
  /** Pending updates since last persist */
  pendingUpdates: Uint8Array[];
  /** Whether the doc has been modified since last save */
  dirty: boolean;
}

/** In-memory room storage. roomId -> RoomState */
const rooms: Map<string, RoomState> = new Map();

/** Track which room each WebSocket belongs to */
const wsRoomMap: WeakMap<WebSocket, string> = new WeakMap();

/** Track which clientId each WebSocket belongs to (for awareness cleanup) */
const wsClientIdMap: WeakMap<WebSocket, number> = new WeakMap();

/** Persistence interval in milliseconds */
const PERSIST_INTERVAL_MS = 30_000;

// ── Persistence Callbacks ───────────────────────────────────────

/**
 * Persistence callback type. Set this to save/load document state to a database.
 *
 * Default: no-op (in-memory only). Wire up to Turso/Drizzle in production.
 */
type PersistenceCallbacks = {
  loadState: (roomId: string) => Promise<Uint8Array | null>;
  saveState: (roomId: string, state: Uint8Array) => Promise<void>;
};

let persistence: PersistenceCallbacks = {
  loadState: async (_roomId: string): Promise<null> => null,
  saveState: async (_roomId: string, _state: Uint8Array): Promise<void> => {},
};

/**
 * Sets the persistence callbacks for loading/saving Y.Doc state.
 * Call this during server initialization to wire up database persistence.
 */
function setPersistence(callbacks: PersistenceCallbacks): void {
  persistence = callbacks;
}

// ── Room Management ─────────────────────────────────────────────

async function getOrCreateRoom(roomId: string): Promise<RoomState> {
  let room = rooms.get(roomId);
  if (room) return room;

  const doc = new Y.Doc();

  // Load persisted state if available
  const savedState = await persistence.loadState(roomId);
  if (savedState) {
    Y.applyUpdate(doc, savedState);
  }

  // Listen for updates to track dirty state
  doc.on("update", (update: Uint8Array): void => {
    const currentRoom = rooms.get(roomId);
    if (currentRoom) {
      currentRoom.pendingUpdates.push(update);
      currentRoom.dirty = true;
    }
  });

  room = {
    doc,
    connections: new Set(),
    awarenessStates: new Map(),
    persistTimer: null,
    pendingUpdates: [],
    dirty: false,
  };

  // Start periodic persistence
  room.persistTimer = setInterval((): void => {
    void persistRoom(roomId);
  }, PERSIST_INTERVAL_MS);

  rooms.set(roomId, room);
  return room;
}

async function persistRoom(roomId: string): Promise<void> {
  const room = rooms.get(roomId);
  if (!room || !room.dirty) return;

  try {
    const state = Y.encodeStateAsUpdate(room.doc);
    await persistence.saveState(roomId, state);
    room.dirty = false;
    room.pendingUpdates = [];
  } catch (err) {
    console.error(`[collab] Failed to persist room ${roomId}:`, err);
  }
}

async function cleanupRoom(roomId: string): Promise<void> {
  const room = rooms.get(roomId);
  if (!room) return;
  if (room.connections.size > 0) return; // Still has connections

  // Persist final state before cleanup
  await persistRoom(roomId);

  // Clear the persistence timer
  if (room.persistTimer) {
    clearInterval(room.persistTimer);
  }

  // Destroy the doc
  room.doc.destroy();
  rooms.delete(roomId);
}

// ── Utility ─────────────────────────────────────────────────────

/** Copies a Uint8Array to a fresh ArrayBuffer (avoids SharedArrayBuffer type issues). */
function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(data.byteLength);
  new Uint8Array(buf).set(data);
  return buf;
}

// ── Message Broadcasting ────────────────────────────────────────

function broadcastToRoom(roomId: string, data: Uint8Array, excludeWs?: WebSocket): void {
  const room = rooms.get(roomId);
  if (!room) return;

  const buf = toArrayBuffer(data);
  for (const conn of room.connections) {
    if (conn === excludeWs) continue;
    try {
      if (conn.readyState === WebSocket.OPEN) {
        conn.send(buf);
      }
    } catch {
      // Connection broken — will be cleaned up on close
    }
  }
}

function broadcastAwareness(
  roomId: string,
  clientId: number,
  stateJSON: string,
  excludeWs?: WebSocket,
): void {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MSG_AWARENESS);
  encoding.writeVarUint(encoder, 1); // count
  encoding.writeVarUint(encoder, clientId);
  encoding.writeVarString(encoder, stateJSON);
  broadcastToRoom(roomId, encoding.toUint8Array(encoder), excludeWs);
}

// ── Message Handling ────────────────────────────────────────────

function handleBinaryMessage(ws: WebSocket, roomId: string, data: Uint8Array): void {
  const room = rooms.get(roomId);
  if (!room) return;

  const decoder = decoding.createDecoder(data);
  const messageType = decoding.readVarUint(decoder);

  switch (messageType) {
    case MSG_SYNC_STEP_1: {
      // Client sent its state vector — reply with sync step 2 (our diff)
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_SYNC_STEP_2);
      syncProtocol.readSyncStep1(decoder, encoder, room.doc);
      sendBinary(ws, encoding.toUint8Array(encoder));

      // Also send sync step 1 back so the client sends us its diff
      const syncEncoder = encoding.createEncoder();
      encoding.writeVarUint(syncEncoder, MSG_SYNC_STEP_1);
      syncProtocol.writeSyncStep1(syncEncoder, room.doc);
      sendBinary(ws, encoding.toUint8Array(syncEncoder));
      break;
    }

    case MSG_SYNC_STEP_2: {
      // Client sent its diff — apply it
      syncProtocol.readSyncStep2(decoder, room.doc, ws);
      break;
    }

    case MSG_SYNC_UPDATE: {
      // Incremental update from client — apply and broadcast
      syncProtocol.readUpdate(decoder, room.doc, ws);

      // Forward the raw binary message to all other clients (most efficient)
      broadcastToRoom(roomId, data, ws);
      break;
    }

    case MSG_AWARENESS: {
      // Awareness update from client
      const count = decoding.readVarUint(decoder);
      for (let i = 0; i < count; i++) {
        const clientId = decoding.readVarUint(decoder);
        const stateJSON = decoding.readVarString(decoder);

        // Store awareness state
        if (stateJSON === "") {
          room.awarenessStates.delete(clientId);
        } else {
          room.awarenessStates.set(clientId, stateJSON);
        }

        // Track clientId for this ws (for cleanup on disconnect)
        wsClientIdMap.set(ws, clientId);

        // Broadcast to all other clients
        broadcastAwareness(roomId, clientId, stateJSON, ws);
      }
      break;
    }
  }
}

function sendBinary(ws: WebSocket, data: Uint8Array): void {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(toArrayBuffer(data));
    }
  } catch {
    // Connection broken
  }
}

/**
 * Sends all current awareness states to a newly connected client.
 */
function sendExistingAwareness(ws: WebSocket, room: RoomState): void {
  if (room.awarenessStates.size === 0) return;

  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MSG_AWARENESS);
  encoding.writeVarUint(encoder, room.awarenessStates.size);

  for (const [clientId, stateJSON] of room.awarenessStates) {
    encoding.writeVarUint(encoder, clientId);
    encoding.writeVarString(encoder, stateJSON);
  }

  sendBinary(ws, encoding.toUint8Array(encoder));
}

// ── Hono WebSocket App ──────────────────────────────────────────

const { upgradeWebSocket, websocket: collabWebsocket } = createBunWebSocket<ServerWebSocket>();

const collabWsApp = new Hono();

collabWsApp.get(
  "/ws",
  upgradeWebSocket((c) => {
    const roomId = c.req.query("room");

    return {
      onOpen(_event, ws): void {
        if (!roomId) {
          try {
            (ws.raw as unknown as WebSocket).close(4000, "Missing room parameter");
          } catch {
            // Best effort
          }
          return;
        }

        const raw = ws.raw as unknown as WebSocket;
        wsRoomMap.set(raw, roomId);

        void getOrCreateRoom(roomId).then((room): void => {
          room.connections.add(raw);

          // Send existing awareness states to the new client
          sendExistingAwareness(raw, room);
        });
      },

      onMessage(event, ws): void {
        const raw = ws.raw as unknown as WebSocket;
        const connRoomId = wsRoomMap.get(raw);
        if (!connRoomId) return;

        let binaryData: Uint8Array;
        if (event.data instanceof ArrayBuffer) {
          binaryData = new Uint8Array(event.data);
        } else if (typeof event.data === "string") {
          // Text messages are not expected for binary Yjs protocol — ignore
          return;
        } else {
          // SharedArrayBuffer or other buffer-like — copy into a standard ArrayBuffer
          const raw_data = event.data as unknown as ArrayBuffer;
          binaryData = new Uint8Array(raw_data);
        }

        handleBinaryMessage(raw, connRoomId, binaryData);
      },

      onClose(_event, ws): void {
        const raw = ws.raw as unknown as WebSocket;
        const connRoomId = wsRoomMap.get(raw);
        if (!connRoomId) return;

        const room = rooms.get(connRoomId);
        if (room) {
          room.connections.delete(raw);

          // Clean up awareness for this client
          const clientId = wsClientIdMap.get(raw);
          if (clientId !== undefined) {
            room.awarenessStates.delete(clientId);
            // Notify remaining clients that this peer disconnected
            broadcastAwareness(connRoomId, clientId, "");
          }

          // If room is now empty, schedule cleanup
          if (room.connections.size === 0) {
            void cleanupRoom(connRoomId);
          }
        }

        wsRoomMap.delete(raw);
        wsClientIdMap.delete(raw);
      },

      onError(_event, ws): void {
        const raw = ws.raw as unknown as WebSocket;
        const connRoomId = wsRoomMap.get(raw);
        if (!connRoomId) return;

        const room = rooms.get(connRoomId);
        if (room) {
          room.connections.delete(raw);

          const clientId = wsClientIdMap.get(raw);
          if (clientId !== undefined) {
            room.awarenessStates.delete(clientId);
            broadcastAwareness(connRoomId, clientId, "");
          }

          if (room.connections.size === 0) {
            void cleanupRoom(connRoomId);
          }
        }

        wsRoomMap.delete(raw);
        wsClientIdMap.delete(raw);
      },
    };
  }),
);

// ── Stats / Debug Endpoint ──────────────────────────────────────

collabWsApp.get("/rooms", (c) => {
  const roomStats = Array.from(rooms.entries()).map(([roomId, room]) => ({
    roomId,
    connections: room.connections.size,
    awarenessCount: room.awarenessStates.size,
    dirty: room.dirty,
  }));

  return c.json({
    totalRooms: rooms.size,
    rooms: roomStats,
  });
});

export { collabWsApp, collabWebsocket, setPersistence };
