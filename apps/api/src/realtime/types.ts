import { z } from "zod";

// ── Client -> Server Messages ─────────────────────────────────────

export const JoinRoomMessage = z.object({
  type: z.literal("join_room"),
  roomId: z.string().min(1).max(255),
  userId: z.string().uuid(),
  metadata: z
    .object({
      displayName: z.string().max(100).optional(),
      color: z.string().max(20).optional(),
    })
    .optional(),
});

export const LeaveRoomMessage = z.object({
  type: z.literal("leave_room"),
  roomId: z.string().min(1).max(255),
  userId: z.string().uuid(),
});

export const BroadcastMessage = z.object({
  type: z.literal("broadcast"),
  roomId: z.string().min(1).max(255),
  userId: z.string().uuid(),
  payload: z.record(z.unknown()),
});

export const CursorMoveMessage = z.object({
  type: z.literal("cursor_move"),
  roomId: z.string().min(1).max(255),
  userId: z.string().uuid(),
  x: z.number(),
  y: z.number(),
  /** Optional element or viewport identifier the cursor is over */
  target: z.string().max(255).optional(),
});

export const PresenceUpdateMessage = z.object({
  type: z.literal("presence_update"),
  roomId: z.string().min(1).max(255),
  userId: z.string().uuid(),
  status: z.enum(["active", "idle", "away"]),
  data: z.record(z.unknown()).optional(),
});

export const PingMessage = z.object({
  type: z.literal("ping"),
});

export const ClientMessage = z.discriminatedUnion("type", [
  JoinRoomMessage,
  LeaveRoomMessage,
  BroadcastMessage,
  CursorMoveMessage,
  PresenceUpdateMessage,
  PingMessage,
]);

export type ClientMessage = z.infer<typeof ClientMessage>;

// ── Server -> Client Messages ─────────────────────────────────────

export const RoomJoinedMessage = z.object({
  type: z.literal("room_joined"),
  roomId: z.string(),
  users: z.array(
    z.object({
      userId: z.string().uuid(),
      metadata: z
        .object({
          displayName: z.string().optional(),
          color: z.string().optional(),
        })
        .optional(),
      presence: z
        .object({
          status: z.enum(["active", "idle", "away"]),
          data: z.record(z.unknown()).optional(),
        })
        .optional(),
    }),
  ),
});

export const RoomLeftMessage = z.object({
  type: z.literal("room_left"),
  roomId: z.string(),
});

export const ServerBroadcastMessage = z.object({
  type: z.literal("broadcast"),
  roomId: z.string(),
  userId: z.string().uuid(),
  payload: z.record(z.unknown()),
  timestamp: z.string().datetime(),
});

export const UserJoinedMessage = z.object({
  type: z.literal("user_joined"),
  roomId: z.string(),
  userId: z.string().uuid(),
  metadata: z
    .object({
      displayName: z.string().optional(),
      color: z.string().optional(),
    })
    .optional(),
});

export const UserLeftMessage = z.object({
  type: z.literal("user_left"),
  roomId: z.string(),
  userId: z.string().uuid(),
});

export const CursorUpdateMessage = z.object({
  type: z.literal("cursor_update"),
  roomId: z.string(),
  userId: z.string().uuid(),
  x: z.number(),
  y: z.number(),
  target: z.string().optional(),
});

export const PresenceSyncMessage = z.object({
  type: z.literal("presence_sync"),
  roomId: z.string(),
  userId: z.string().uuid(),
  status: z.enum(["active", "idle", "away"]),
  data: z.record(z.unknown()).optional(),
});

export const ServerErrorMessage = z.object({
  type: z.literal("error"),
  code: z.enum([
    "invalid_message",
    "room_not_found",
    "unauthorized",
    "rate_limited",
    "internal_error",
  ]),
  message: z.string(),
});

export const PongMessage = z.object({
  type: z.literal("pong"),
});

export const ServerMessage = z.discriminatedUnion("type", [
  RoomJoinedMessage,
  RoomLeftMessage,
  ServerBroadcastMessage,
  UserJoinedMessage,
  UserLeftMessage,
  CursorUpdateMessage,
  PresenceSyncMessage,
  ServerErrorMessage,
  PongMessage,
]);

export type ServerMessage = z.infer<typeof ServerMessage>;

// ── SSE Event Types ───────────────────────────────────────────────

export const SSEEventType = z.enum([
  "update",
  "notification",
  "ai_response",
  "presence",
  "cursor",
]);

export type SSEEventType = z.infer<typeof SSEEventType>;

export const SSEEvent = z.object({
  event: SSEEventType,
  data: z.record(z.unknown()),
  id: z.string().optional(),
});

export type SSEEvent = z.infer<typeof SSEEvent>;

// ── Shared Types ──────────────────────────────────────────────────

export interface RoomUser {
  userId: string;
  ws: WebSocket;
  metadata: {
    displayName?: string | undefined;
    color?: string | undefined;
  } | undefined;
  presence: {
    status: "active" | "idle" | "away";
    data?: Record<string, unknown> | undefined;
  } | undefined;
  cursor: {
    x: number;
    y: number;
    target?: string | undefined;
  } | undefined;
  lastPing: number;
}
