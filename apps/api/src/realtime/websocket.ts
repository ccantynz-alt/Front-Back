import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import type { ServerWebSocket } from "bun";
import { ClientMessage } from "./types";
import { roomManager } from "./rooms";

const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket>();

/**
 * WebSocket route handler for real-time bidirectional communication.
 *
 * Clients connect to /ws and exchange JSON messages validated by Zod schemas.
 * All room management, cursor sharing, and presence updates flow through here.
 */
const wsApp = new Hono();

/** Track which userId owns each WebSocket so we can clean up on close */
const wsUserMap = new WeakMap<WebSocket, string>();

wsApp.get(
  "/ws",
  upgradeWebSocket(() => {
    return {
      onOpen(_event, ws) {
        // Connection opened. User must send join_room to participate.
        // Send a pong immediately to confirm connection is alive.
        const raw = ws.raw as unknown as WebSocket;
        try {
          raw.send(JSON.stringify({ type: "pong" }));
        } catch {
          // Best effort
        }
      },

      onMessage(event, ws) {
        const raw = ws.raw as unknown as WebSocket;
        const data =
          typeof event.data === "string"
            ? event.data
            : new TextDecoder().decode(event.data as ArrayBuffer);

        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch {
          sendError(raw, "invalid_message", "Malformed JSON");
          return;
        }

        const result = ClientMessage.safeParse(parsed);
        if (!result.success) {
          sendError(
            raw,
            "invalid_message",
            `Invalid message: ${result.error.issues.map((i) => i.message).join(", ")}`,
          );
          return;
        }

        handleClientMessage(raw, result.data);
      },

      onClose(_event, ws) {
        const raw = ws.raw as unknown as WebSocket;
        const userId = wsUserMap.get(raw);
        if (userId) {
          roomManager.removeUserFromAllRooms(userId);
          wsUserMap.delete(raw);
        }
      },

      onError(_event, ws) {
        const raw = ws.raw as unknown as WebSocket;
        const userId = wsUserMap.get(raw);
        if (userId) {
          roomManager.removeUserFromAllRooms(userId);
          wsUserMap.delete(raw);
        }
      },
    };
  }),
);

function handleClientMessage(ws: WebSocket, message: ClientMessage): void {
  switch (message.type) {
    case "join_room": {
      // Track this WS -> userId mapping
      wsUserMap.set(ws, message.userId);

      const result = roomManager.joinRoom(
        message.roomId,
        message.userId,
        ws,
        message.metadata,
      );

      if (!result.success) {
        sendError(ws, "room_not_found", result.error ?? "Failed to join room");
      }
      break;
    }

    case "leave_room": {
      roomManager.leaveRoom(message.roomId, message.userId);
      ws.send(
        JSON.stringify({
          type: "room_left",
          roomId: message.roomId,
        }),
      );
      break;
    }

    case "broadcast": {
      roomManager.broadcast(
        message.roomId,
        {
          type: "broadcast",
          roomId: message.roomId,
          userId: message.userId,
          payload: message.payload,
          timestamp: new Date().toISOString(),
        },
        message.userId,
      );
      break;
    }

    case "cursor_move": {
      roomManager.updateCursor(
        message.roomId,
        message.userId,
        message.x,
        message.y,
        message.target,
      );
      break;
    }

    case "presence_update": {
      roomManager.updatePresence(
        message.roomId,
        message.userId,
        message.status,
        message.data,
      );
      break;
    }

    case "ping": {
      const userId = wsUserMap.get(ws);
      if (userId) {
        roomManager.recordPing(userId);
      }
      try {
        ws.send(JSON.stringify({ type: "pong" }));
      } catch {
        // Connection already closed
      }
      break;
    }
  }
}

function sendError(
  ws: WebSocket,
  code: "invalid_message" | "room_not_found" | "unauthorized" | "rate_limited" | "internal_error",
  message: string,
): void {
  try {
    ws.send(
      JSON.stringify({
        type: "error",
        code,
        message,
      }),
    );
  } catch {
    // Connection already closed
  }
}

export { wsApp, websocket };
