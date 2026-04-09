import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import * as Y from "yjs";

const { upgradeWebSocket, websocket: yjsWebsocket } = createBunWebSocket();

// Room -> Y.Doc store
const docs = new Map<string, Y.Doc>();

function getOrCreateDoc(roomId: string): Y.Doc {
  let doc = docs.get(roomId);
  if (!doc) {
    doc = new Y.Doc();
    docs.set(roomId, doc);
  }
  return doc;
}

// Room -> connected websockets
const roomConnections = new Map<string, Set<WebSocket>>();

const yjsWsApp = new Hono();

yjsWsApp.get(
  "/api/yjs/:roomId",
  upgradeWebSocket((c) => {
    const roomId = c.req.param("roomId") ?? "default";
    const doc = getOrCreateDoc(roomId);

    return {
      onOpen(_evt, ws) {
        const raw = ws.raw as unknown as WebSocket;
        if (!roomConnections.has(roomId)) {
          roomConnections.set(roomId, new Set());
        }
        roomConnections.get(roomId)!.add(raw);

        // Send initial state
        const state = Y.encodeStateAsUpdate(doc);
        ws.send(new Uint8Array(state.buffer, state.byteOffset, state.byteLength) as Uint8Array<ArrayBuffer>);
      },

      onMessage(evt, ws) {
        try {
          const data = evt.data;
          if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
            const update = data instanceof Uint8Array
              ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) as Uint8Array<ArrayBuffer>
              : new Uint8Array(data);
            Y.applyUpdate(doc, update);

            // Broadcast to other connections in the room
            const connections = roomConnections.get(roomId);
            if (connections) {
              const raw = ws.raw as unknown as WebSocket;
              for (const conn of connections) {
                if (conn !== raw && conn.readyState === WebSocket.OPEN) {
                  conn.send(update);
                }
              }
            }
          }
        } catch (err) {
          console.error(`[yjs] Error processing message for room ${roomId}:`, err);
        }
      },

      onClose(_evt, ws) {
        const raw = ws.raw as unknown as WebSocket;
        const connections = roomConnections.get(roomId);
        if (connections) {
          connections.delete(raw);
          if (connections.size === 0) {
            roomConnections.delete(roomId);
            // Keep doc alive for reconnections
          }
        }
      },
    };
  }),
);

// Room management helper
const yjsRoomManager = {
  getRooms(): string[] {
    return [...docs.keys()];
  },
  getConnectionCount(roomId: string): number {
    return roomConnections.get(roomId)?.size ?? 0;
  },
};

export { yjsWsApp, yjsWebsocket, yjsRoomManager };
