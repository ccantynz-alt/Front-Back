import type { RoomUser, ServerMessage } from "./types";

/**
 * In-memory room manager for real-time collaboration.
 *
 * This is an in-process implementation suitable for single-server deployments
 * and development. Production deployments will replace this with Cloudflare
 * Durable Objects for globally distributed, persistent room state.
 */
export class RoomManager {
  /** roomId -> Map<userId, RoomUser> */
  private rooms: Map<string, Map<string, RoomUser>> = new Map();

  /** SSE subscribers: roomId -> Set<WritableStreamDefaultWriter> */
  private sseSubscribers: Map<
    string,
    Set<{ writer: WritableStreamDefaultWriter<string>; controller: AbortController }>
  > = new Map();

  /** Maximum users per room */
  private static readonly MAX_USERS_PER_ROOM = 100;

  /** Heartbeat timeout in milliseconds (30 seconds) */
  private static readonly HEARTBEAT_TIMEOUT_MS = 30_000;

  /** Heartbeat check interval */
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startHeartbeatCheck();
  }

  joinRoom(
    roomId: string,
    userId: string,
    ws: WebSocket,
    metadata?: RoomUser["metadata"],
  ): { success: boolean; error?: string } {
    let room = this.rooms.get(roomId);

    if (!room) {
      room = new Map();
      this.rooms.set(roomId, room);
    }

    if (room.size >= RoomManager.MAX_USERS_PER_ROOM) {
      return { success: false, error: "Room is full" };
    }

    // If user already in room with a different WS, close the old one
    const existing = room.get(userId);
    if (existing) {
      try {
        existing.ws.close(1000, "Replaced by new connection");
      } catch {
        // Connection may already be closed
      }
    }

    const user: RoomUser = {
      userId,
      ws,
      metadata,
      presence: { status: "active" },
      cursor: undefined,
      lastPing: Date.now(),
    };

    room.set(userId, user);

    // Notify other users in the room
    this.broadcast(
      roomId,
      {
        type: "user_joined",
        roomId,
        userId,
        metadata,
      },
      userId,
    );

    // Send current room state to the joining user
    const users = Array.from(room.values()).map((u) => ({
      userId: u.userId,
      metadata: u.metadata,
      presence: u.presence,
    }));

    this.sendToUser(roomId, userId, {
      type: "room_joined",
      roomId,
      users,
    });

    return { success: true };
  }

  leaveRoom(roomId: string, userId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.delete(userId);

    // Notify remaining users
    this.broadcast(roomId, {
      type: "user_left",
      roomId,
      userId,
    });

    // Clean up empty rooms
    if (room.size === 0) {
      this.rooms.delete(roomId);
      this.cleanupSSESubscribers(roomId);
    }
  }

  /**
   * Remove a user from ALL rooms they belong to.
   * Called on WebSocket disconnect.
   */
  removeUserFromAllRooms(userId: string): void {
    for (const [roomId, room] of this.rooms) {
      if (room.has(userId)) {
        this.leaveRoom(roomId, userId);
      }
    }
  }

  broadcast(
    roomId: string,
    message: ServerMessage,
    excludeUserId?: string,
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const data = JSON.stringify(message);

    for (const [uid, user] of room) {
      if (uid === excludeUserId) continue;
      try {
        if (user.ws.readyState === WebSocket.OPEN) {
          user.ws.send(data);
        }
      } catch {
        // Connection broken -- will be cleaned up by heartbeat
      }
    }

    // Also push to SSE subscribers
    this.pushToSSESubscribers(roomId, message);
  }

  getRoomUsers(
    roomId: string,
  ): Array<{
    userId: string;
    metadata?: RoomUser["metadata"];
    presence?: RoomUser["presence"];
    cursor?: RoomUser["cursor"];
  }> {
    const room = this.rooms.get(roomId);
    if (!room) return [];

    return Array.from(room.values()).map((u) => ({
      userId: u.userId,
      metadata: u.metadata,
      presence: u.presence,
      cursor: u.cursor,
    }));
  }

  updatePresence(
    roomId: string,
    userId: string,
    status: "active" | "idle" | "away",
    data?: Record<string, unknown>,
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const user = room.get(userId);
    if (!user) return;

    user.presence = data !== undefined ? { status, data } : { status };

    this.broadcast(
      roomId,
      {
        type: "presence_sync",
        roomId,
        userId,
        status,
        ...(data !== undefined ? { data } : {}),
      },
      userId,
    );
  }

  updateCursor(
    roomId: string,
    userId: string,
    x: number,
    y: number,
    target?: string,
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const user = room.get(userId);
    if (!user) return;

    user.cursor = target !== undefined ? { x, y, target } : { x, y };

    this.broadcast(
      roomId,
      {
        type: "cursor_update",
        roomId,
        userId,
        x,
        y,
        ...(target !== undefined ? { target } : {}),
      },
      userId,
    );
  }

  /**
   * Record that we received a ping from a user, keeping them alive.
   */
  recordPing(userId: string): void {
    for (const room of this.rooms.values()) {
      const user = room.get(userId);
      if (user) {
        user.lastPing = Date.now();
      }
    }
  }

  sendToUser(roomId: string, userId: string, message: ServerMessage): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const user = room.get(userId);
    if (!user) return;

    try {
      if (user.ws.readyState === WebSocket.OPEN) {
        user.ws.send(JSON.stringify(message));
      }
    } catch {
      // Connection broken
    }
  }

  // ── SSE Subscriber Management ─────────────────────────────────

  addSSESubscriber(
    roomId: string,
    writer: WritableStreamDefaultWriter<string>,
    controller: AbortController,
  ): void {
    let subscribers = this.sseSubscribers.get(roomId);
    if (!subscribers) {
      subscribers = new Set();
      this.sseSubscribers.set(roomId, subscribers);
    }
    subscribers.add({ writer, controller });
  }

  removeSSESubscriber(
    roomId: string,
    writer: WritableStreamDefaultWriter<string>,
  ): void {
    const subscribers = this.sseSubscribers.get(roomId);
    if (!subscribers) return;

    for (const sub of subscribers) {
      if (sub.writer === writer) {
        subscribers.delete(sub);
        break;
      }
    }

    if (subscribers.size === 0) {
      this.sseSubscribers.delete(roomId);
    }
  }

  private pushToSSESubscribers(roomId: string, message: ServerMessage): void {
    const subscribers = this.sseSubscribers.get(roomId);
    if (!subscribers || subscribers.size === 0) return;

    const eventType = this.serverMessageToSSEEvent(message.type);
    const ssePayload = `event: ${eventType}\ndata: ${JSON.stringify(message)}\nid: ${Date.now()}\n\n`;

    const deadSubscribers: Array<{
      writer: WritableStreamDefaultWriter<string>;
      controller: AbortController;
    }> = [];

    for (const sub of subscribers) {
      try {
        void sub.writer.write(ssePayload);
      } catch {
        deadSubscribers.push(sub);
      }
    }

    for (const dead of deadSubscribers) {
      subscribers.delete(dead);
    }
  }

  private serverMessageToSSEEvent(
    type: ServerMessage["type"],
  ): string {
    switch (type) {
      case "cursor_update":
        return "cursor";
      case "presence_sync":
        return "presence";
      case "broadcast":
      case "user_joined":
      case "user_left":
      case "room_joined":
      case "room_left":
      case "pong":
        return "update";
      case "error":
        return "notification";
      default:
        return "update";
    }
  }

  private cleanupSSESubscribers(roomId: string): void {
    const subscribers = this.sseSubscribers.get(roomId);
    if (!subscribers) return;

    for (const sub of subscribers) {
      try {
        sub.controller.abort();
        void sub.writer.close();
      } catch {
        // Already closed
      }
    }
    this.sseSubscribers.delete(roomId);
  }

  // ── Heartbeat / Dead Connection Cleanup ───────────────────────

  private startHeartbeatCheck(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const deadUsers: Array<{ roomId: string; userId: string }> = [];

      for (const [roomId, room] of this.rooms) {
        for (const [userId, user] of room) {
          const elapsed = now - user.lastPing;
          if (elapsed > RoomManager.HEARTBEAT_TIMEOUT_MS) {
            deadUsers.push({ roomId, userId });
          }
        }
      }

      for (const { roomId, userId } of deadUsers) {
        const room = this.rooms.get(roomId);
        const user = room?.get(userId);
        if (user) {
          try {
            user.ws.close(1001, "Heartbeat timeout");
          } catch {
            // Already closed
          }
        }
        this.leaveRoom(roomId, userId);
      }
    }, 10_000);
  }

  /**
   * Graceful shutdown: close all connections and stop the heartbeat loop.
   */
  destroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    for (const [_roomId, room] of this.rooms) {
      for (const user of room.values()) {
        try {
          user.ws.close(1001, "Server shutting down");
        } catch {
          // Already closed
        }
      }
    }
    this.rooms.clear();

    for (const [roomId] of this.sseSubscribers) {
      this.cleanupSSESubscribers(roomId);
    }
    this.sseSubscribers.clear();
  }

  // ── Stats ─────────────────────────────────────────────────────

  getRoomCount(): number {
    return this.rooms.size;
  }

  getTotalUserCount(): number {
    let count = 0;
    for (const room of this.rooms.values()) {
      count += room.size;
    }
    return count;
  }
}

/** Singleton room manager instance */
export const roomManager = new RoomManager();
