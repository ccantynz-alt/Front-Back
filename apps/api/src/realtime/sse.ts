import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { roomManager } from "./rooms";

/**
 * Server-Sent Events route for server-to-client streaming.
 *
 * SSE is used as an alternative to WebSockets for:
 * - AI response streaming
 * - Live update notifications
 * - Presence/cursor updates for read-only observers
 *
 * Clients that only need to receive (not send) should prefer SSE.
 * It works through HTTP/2, proxies, and load balancers without upgrade negotiation.
 */
const sseApp = new Hono();

const RoomIdParam = z.string().min(1).max(255);

sseApp.get("/realtime/events/:roomId", async (c) => {
  const roomIdResult = RoomIdParam.safeParse(c.req.param("roomId"));
  if (!roomIdResult.success) {
    return c.json({ error: "Invalid room ID" }, 400);
  }

  const roomId = roomIdResult.data;

  return streamSSE(
    c,
    async (stream) => {
      // Create a TransformStream to bridge RoomManager push -> SSE stream
      const { readable, writable } = new TransformStream<string, string>();
      const writer = writable.getWriter();
      const controller = new AbortController();

      // Register this SSE connection with the room manager
      roomManager.addSSESubscriber(roomId, writer, controller);

      // Send initial connection event
      await stream.writeSSE({
        event: "update",
        data: JSON.stringify({
          type: "connected",
          roomId,
          users: roomManager.getRoomUsers(roomId),
          timestamp: new Date().toISOString(),
        }),
        id: String(Date.now()),
      });

      // Keep-alive: send a comment every 15 seconds to prevent proxy timeouts
      const keepAliveInterval = setInterval(async () => {
        try {
          await stream.writeSSE({
            event: "update",
            data: JSON.stringify({ type: "keepalive" }),
            id: String(Date.now()),
          });
        } catch {
          clearInterval(keepAliveInterval);
        }
      }, 15_000);

      // Read from the transform stream and forward to SSE
      const reader = readable.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          // The value is already formatted as SSE by RoomManager
          await stream.write(value);
        }
      } catch {
        // Stream closed (client disconnected or abort)
      } finally {
        clearInterval(keepAliveInterval);
        roomManager.removeSSESubscriber(roomId, writer);
        reader.releaseLock();
        try {
          await writer.close();
        } catch {
          // Already closed
        }
      }
    },
    async (_error, stream) => {
      // Error handler: notify client and close gracefully
      await stream.writeSSE({
        event: "notification",
        data: JSON.stringify({
          type: "error",
          code: "internal_error",
          message: "Stream encountered an error",
        }),
        id: String(Date.now()),
      });
    },
  );
});

/**
 * GET /realtime/rooms/:roomId/users
 * Quick REST endpoint to check who is in a room without subscribing.
 */
sseApp.get("/realtime/rooms/:roomId/users", (c) => {
  const roomIdResult = RoomIdParam.safeParse(c.req.param("roomId"));
  if (!roomIdResult.success) {
    return c.json({ error: "Invalid room ID" }, 400);
  }

  const users = roomManager.getRoomUsers(roomIdResult.data);
  return c.json({ roomId: roomIdResult.data, users, count: users.length });
});

/**
 * GET /realtime/stats
 * Server stats: active rooms and connected users.
 */
sseApp.get("/realtime/stats", (c) => {
  return c.json({
    rooms: roomManager.getRoomCount(),
    users: roomManager.getTotalUserCount(),
    timestamp: new Date().toISOString(),
  });
});

export { sseApp };
