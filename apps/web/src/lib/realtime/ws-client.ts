// ── WebSocket Client with Auto-Reconnect ────────────────────────────
// SolidJS-native WebSocket client that provides:
// - Typed message sending/receiving matching the server protocol
// - Exponential backoff reconnection with jitter
// - Offline message queue that drains on reconnect
// - Reactive signals for connection status, room state, and cursors
// - Heartbeat ping to keep the connection alive

import { createSignal, onCleanup, type Accessor } from "solid-js";

// ── Client -> Server Message Types ──────────────────────────────────

interface JoinRoomMsg {
  type: "join_room";
  roomId: string;
  userId: string;
  metadata?: { displayName?: string | undefined; color?: string | undefined };
}

interface LeaveRoomMsg {
  type: "leave_room";
  roomId: string;
  userId: string;
}

interface BroadcastMsg {
  type: "broadcast";
  roomId: string;
  userId: string;
  payload: Record<string, unknown>;
}

interface CursorMoveMsg {
  type: "cursor_move";
  roomId: string;
  userId: string;
  x: number;
  y: number;
  target?: string | undefined;
}

interface PresenceUpdateMsg {
  type: "presence_update";
  roomId: string;
  userId: string;
  status: "active" | "idle" | "away";
  data?: Record<string, unknown> | undefined;
}

interface PingMsg {
  type: "ping";
}

type ClientMessage =
  | JoinRoomMsg
  | LeaveRoomMsg
  | BroadcastMsg
  | CursorMoveMsg
  | PresenceUpdateMsg
  | PingMsg;

// ── Server -> Client Message Types ──────────────────────────────────

interface RoomJoinedMsg {
  type: "room_joined";
  roomId: string;
  users: Array<{
    userId: string;
    metadata?: { displayName?: string | undefined; color?: string | undefined } | undefined;
    presence?: { status: "active" | "idle" | "away"; data?: Record<string, unknown> | undefined } | undefined;
  }>;
}

interface RoomLeftMsg {
  type: "room_left";
  roomId: string;
}

interface ServerBroadcastMsg {
  type: "broadcast";
  roomId: string;
  userId: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

interface UserJoinedMsg {
  type: "user_joined";
  roomId: string;
  userId: string;
  metadata?: { displayName?: string | undefined; color?: string | undefined } | undefined;
}

interface UserLeftMsg {
  type: "user_left";
  roomId: string;
  userId: string;
}

interface CursorUpdateMsg {
  type: "cursor_update";
  roomId: string;
  userId: string;
  x: number;
  y: number;
  target?: string | undefined;
}

interface PresenceSyncMsg {
  type: "presence_sync";
  roomId: string;
  userId: string;
  status: "active" | "idle" | "away";
  data?: Record<string, unknown> | undefined;
}

interface ServerErrorMsg {
  type: "error";
  code: string;
  message: string;
}

interface PongMsg {
  type: "pong";
  timestamp?: number | undefined;
}

type ServerMessage =
  | RoomJoinedMsg
  | RoomLeftMsg
  | ServerBroadcastMsg
  | UserJoinedMsg
  | UserLeftMsg
  | CursorUpdateMsg
  | PresenceSyncMsg
  | ServerErrorMsg
  | PongMsg;

// ── Exported Types ──────────────────────────────────────────────────

export type { ClientMessage, ServerMessage };

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

export interface WSClientOptions {
  /** WebSocket URL (e.g. "ws://localhost:3001/api/ws"). */
  url: string;

  /** Initial reconnect delay in ms (default: 1000). */
  reconnectDelay?: number | undefined;

  /** Maximum reconnect delay in ms (default: 30000). */
  maxReconnectDelay?: number | undefined;

  /** Maximum reconnect attempts before giving up. 0 = unlimited (default: 0). */
  maxReconnectAttempts?: number | undefined;

  /** Heartbeat ping interval in ms (default: 15000). */
  pingInterval?: number | undefined;

  /** Maximum messages to queue while disconnected (default: 100). */
  maxQueueSize?: number | undefined;
}

export interface RoomUserInfo {
  userId: string;
  metadata?:
    | { displayName?: string | undefined; color?: string | undefined }
    | undefined;
  presence?:
    | {
        status: "active" | "idle" | "away";
        data?: Record<string, unknown> | undefined;
      }
    | undefined;
}

export interface CursorPosition {
  userId: string;
  x: number;
  y: number;
  target?: string | undefined;
  timestamp: number;
}

type MessageHandler = (message: ServerMessage) => void;
type ErrorHandler = (code: string, message: string) => void;

export interface WSClient {
  /** Reactive connection status signal. */
  status: Accessor<ConnectionStatus>;

  /** Reactive list of users in the current room. */
  roomUsers: Accessor<RoomUserInfo[]>;

  /** Reactive list of remote cursor positions. */
  cursors: Accessor<CursorPosition[]>;

  /** The room ID the client is currently joined to (null if none). */
  currentRoom: Accessor<string | null>;

  /** Number of reconnect attempts made since last successful connection. */
  reconnectAttempts: Accessor<number>;

  /** Round-trip latency of the last ping/pong in ms (null if not yet measured). */
  latency: Accessor<number | null>;

  /** Open the WebSocket connection. */
  connect: () => void;

  /** Gracefully close the connection. Will not auto-reconnect. */
  disconnect: () => void;

  /** Join a room. Leaves the current room first if already in one. */
  joinRoom: (roomId: string, userId: string, metadata?: RoomUserInfo["metadata"]) => void;

  /** Leave the current room. */
  leaveRoom: (userId: string) => void;

  /** Send a typed broadcast to the current room. */
  broadcast: (userId: string, payload: Record<string, unknown>) => void;

  /** Send a cursor position update. */
  sendCursor: (userId: string, x: number, y: number, target?: string) => void;

  /** Send a presence update. */
  sendPresence: (
    userId: string,
    presenceStatus: "active" | "idle" | "away",
    data?: Record<string, unknown>,
  ) => void;

  /** Register a handler for all incoming server messages. Returns unsubscribe. */
  onMessage: (handler: MessageHandler) => () => void;

  /** Register a handler for error messages. Returns unsubscribe. */
  onError: (handler: ErrorHandler) => () => void;
}

// ── Validation ──────────────────────────────────────────────────────

const VALID_SERVER_MSG_TYPES = new Set([
  "room_joined",
  "room_left",
  "broadcast",
  "user_joined",
  "user_left",
  "cursor_update",
  "presence_sync",
  "error",
  "pong",
]);

/**
 * Lightweight runtime check that the parsed JSON has a recognized
 * `type` discriminator. Full Zod validation lives on the server;
 * the client trusts the server but guards against malformed frames.
 */
function isServerMessage(value: unknown): value is ServerMessage {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj["type"] === "string" && VALID_SERVER_MSG_TYPES.has(obj["type"]);
}

// ── Factory ─────────────────────────────────────────────────────────

/**
 * Creates a reactive WebSocket client for real-time communication.
 *
 * Must be called inside a SolidJS reactive scope (component or
 * createRoot) so that `onCleanup` can register the teardown.
 *
 * @example
 * ```ts
 * const ws = createWSClient({ url: "ws://localhost:3001/api/ws" });
 * ws.connect();
 * ws.joinRoom("room-1", userId);
 *
 * createEffect(() => {
 *   console.log("Status:", ws.status());
 *   console.log("Users:", ws.roomUsers());
 * });
 * ```
 */
export function createWSClient(options: WSClientOptions): WSClient {
  const {
    url,
    reconnectDelay: initialDelay = 1_000,
    maxReconnectDelay = 30_000,
    maxReconnectAttempts = 0,
    pingInterval = 15_000,
    maxQueueSize = 100,
  } = options;

  // ── Reactive State ──────────────────────────────────────────────
  const [status, setStatus] = createSignal<ConnectionStatus>("disconnected");
  const [roomUsers, setRoomUsers] = createSignal<RoomUserInfo[]>([]);
  const [cursors, setCursors] = createSignal<CursorPosition[]>([]);
  const [currentRoom, setCurrentRoom] = createSignal<string | null>(null);
  const [reconnectAttemptsSignal, setReconnectAttempts] = createSignal(0);
  const [latency, setLatency] = createSignal<number | null>(null);

  // ── Internal State ──────────────────────────────────────────────
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let cursorCleanupTimer: ReturnType<typeof setInterval> | null = null;
  let currentDelay = initialDelay;
  let intentionalClose = false;
  let lastPingTimestamp: number | null = null;

  /** Messages queued while disconnected; drained on reconnect. */
  const messageQueue: string[] = [];

  const messageHandlers = new Set<MessageHandler>();
  const errorHandlers = new Set<ErrorHandler>();

  /** Cached join params for automatic room rejoin on reconnect. */
  let pendingJoin: {
    roomId: string;
    userId: string;
    metadata?: RoomUserInfo["metadata"];
  } | null = null;

  // ── Cursor Cleanup ──────────────────────────────────────────────

  const CURSOR_STALE_MS = 5_000;

  function startCursorCleanup(): void {
    if (cursorCleanupTimer) return;
    cursorCleanupTimer = setInterval(() => {
      const now = Date.now();
      setCursors((prev) => prev.filter((c) => now - c.timestamp < CURSOR_STALE_MS));
    }, CURSOR_STALE_MS);
  }

  function stopCursorCleanup(): void {
    if (cursorCleanupTimer) {
      clearInterval(cursorCleanupTimer);
      cursorCleanupTimer = null;
    }
  }

  // ── Heartbeat ─────────────────────────────────────────────────────

  function startPing(): void {
    stopPing();
    pingTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        lastPingTimestamp = Date.now();
        rawSend({ type: "ping" });
      }
    }, pingInterval);
  }

  function stopPing(): void {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  }

  // ── Low-Level Send ────────────────────────────────────────────────

  function rawSend(data: ClientMessage): void {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  /**
   * Send a typed client message. If the socket is not open the message
   * is queued (up to `maxQueueSize`).
   */
  function send(message: ClientMessage): void {
    const payload = JSON.stringify(message);

    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(payload);
      return;
    }

    // Queue the message for delivery on reconnect
    if (messageQueue.length < maxQueueSize) {
      messageQueue.push(payload);
    }
  }

  /** Drain the queued messages after reconnection. */
  function drainQueue(): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    while (messageQueue.length > 0) {
      const msg = messageQueue.shift();
      if (msg !== undefined) {
        try {
          ws.send(msg);
        } catch {
          // If send fails, stop draining -- connection may have dropped.
          messageQueue.unshift(msg);
          break;
        }
      }
    }
  }

  // ── Incoming Message Processing ───────────────────────────────────

  function handleRawMessage(event: MessageEvent): void {
    const raw = typeof event.data === "string" ? event.data : "";
    if (raw.length === 0) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return; // Ignore malformed frames
    }

    if (!isServerMessage(parsed)) {
      return; // Ignore unrecognized messages
    }

    const message: ServerMessage = parsed;

    // Dispatch to update reactive state
    switch (message.type) {
      case "room_joined": {
        setCurrentRoom(message.roomId);
        setRoomUsers(
          message.users.map((u: RoomJoinedMsg["users"][number]) => ({
            userId: u.userId,
            metadata: u.metadata,
            presence: u.presence,
          })),
        );
        break;
      }
      case "room_left": {
        if (currentRoom() === message.roomId) {
          setCurrentRoom(null);
          setRoomUsers([]);
          setCursors([]);
        }
        break;
      }
      case "user_joined": {
        const info: RoomUserInfo = {
          userId: message.userId,
          metadata: message.metadata,
        };
        setRoomUsers((prev) => [
          ...prev.filter((u) => u.userId !== message.userId),
          info,
        ]);
        break;
      }
      case "user_left": {
        setRoomUsers((prev) => prev.filter((u) => u.userId !== message.userId));
        setCursors((prev) => prev.filter((c) => c.userId !== message.userId));
        break;
      }
      case "cursor_update": {
        const cursor: CursorPosition = {
          userId: message.userId,
          x: message.x,
          y: message.y,
          target: message.target,
          timestamp: Date.now(),
        };
        setCursors((prev) => [
          ...prev.filter((c) => c.userId !== message.userId),
          cursor,
        ]);
        break;
      }
      case "presence_sync": {
        setRoomUsers((prev) =>
          prev.map((u) =>
            u.userId === message.userId
              ? {
                  ...u,
                  presence: {
                    status: message.status,
                    ...(message.data !== undefined ? { data: message.data } : {}),
                  },
                }
              : u,
          ),
        );
        break;
      }
      case "pong": {
        if (lastPingTimestamp !== null) {
          setLatency(Date.now() - lastPingTimestamp);
          lastPingTimestamp = null;
        }
        break;
      }
      case "error": {
        for (const handler of errorHandlers) {
          handler(message.code, message.message);
        }
        break;
      }
      case "broadcast": {
        // No internal state update -- forwarded to message handlers below.
        break;
      }
    }

    // Forward to all registered message handlers
    for (const handler of messageHandlers) {
      handler(message);
    }
  }

  // ── Reconnection ──────────────────────────────────────────────────

  function scheduleReconnect(): void {
    if (intentionalClose) return;

    const attempts = reconnectAttemptsSignal();
    if (maxReconnectAttempts > 0 && attempts >= maxReconnectAttempts) {
      setStatus("error");
      return;
    }

    setStatus("reconnecting");

    // Exponential backoff with jitter
    const jitter = Math.random() * 0.3 * currentDelay;
    const delay = Math.min(currentDelay + jitter, maxReconnectDelay);

    reconnectTimer = setTimeout(() => {
      setReconnectAttempts((prev) => prev + 1);
      currentDelay = Math.min(currentDelay * 2, maxReconnectDelay);
      connectInternal();
    }, delay);
  }

  function cancelReconnect(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  // ── Connection Lifecycle ──────────────────────────────────────────

  function connectInternal(): void {
    if (typeof window === "undefined") return;

    // Tear down any existing connection first
    if (ws) {
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      ws.onopen = null;
      try {
        ws.close();
      } catch {
        // Already closed
      }
      ws = null;
    }

    setStatus("connecting");

    try {
      ws = new WebSocket(url);
    } catch {
      setStatus("error");
      scheduleReconnect();
      return;
    }

    ws.onopen = (): void => {
      setStatus("connected");
      setReconnectAttempts(0);
      currentDelay = initialDelay;

      startPing();
      startCursorCleanup();
      drainQueue();

      // Automatically rejoin room if we were in one before disconnect
      if (pendingJoin) {
        const joinMsg: JoinRoomMsg = {
          type: "join_room",
          roomId: pendingJoin.roomId,
          userId: pendingJoin.userId,
        };
        if (pendingJoin.metadata !== undefined) {
          joinMsg.metadata = pendingJoin.metadata;
        }
        send(joinMsg);
      }
    };

    ws.onmessage = handleRawMessage;

    ws.onclose = (): void => {
      ws = null;
      stopPing();
      setStatus("disconnected");
      scheduleReconnect();
    };

    ws.onerror = (): void => {
      // The close event will fire after this; reconnect is handled there.
    };
  }

  // ── Public API ────────────────────────────────────────────────────

  function connect(): void {
    intentionalClose = false;
    cancelReconnect();
    setReconnectAttempts(0);
    currentDelay = initialDelay;
    connectInternal();
  }

  function disconnect(): void {
    intentionalClose = true;
    cancelReconnect();
    stopPing();
    stopCursorCleanup();
    pendingJoin = null;
    messageQueue.length = 0;

    if (ws) {
      ws.onclose = null; // Prevent reconnect on intentional close
      ws.close(1000, "Client disconnect");
      ws = null;
    }

    setStatus("disconnected");
    setRoomUsers([]);
    setCursors([]);
    setCurrentRoom(null);
    setLatency(null);
    setReconnectAttempts(0);
  }

  function joinRoom(
    roomId: string,
    userId: string,
    metadata?: RoomUserInfo["metadata"],
  ): void {
    // Leave current room first
    const room = currentRoom();
    if (room) {
      send({ type: "leave_room", roomId: room, userId });
    }

    setRoomUsers([]);
    setCursors([]);

    // Cache for reconnect
    pendingJoin =
      metadata !== undefined
        ? { roomId, userId, metadata }
        : { roomId, userId };

    const joinMsg: JoinRoomMsg = { type: "join_room", roomId, userId };
    if (metadata !== undefined) {
      joinMsg.metadata = metadata;
    }
    send(joinMsg);
  }

  function leaveRoom(userId: string): void {
    const room = currentRoom();
    if (room) {
      send({ type: "leave_room", roomId: room, userId });
    }
    pendingJoin = null;
    setCurrentRoom(null);
    setRoomUsers([]);
    setCursors([]);
  }

  function broadcastFn(
    userId: string,
    payload: Record<string, unknown>,
  ): void {
    const room = currentRoom();
    if (!room) return;
    send({ type: "broadcast", roomId: room, userId, payload });
  }

  function sendCursor(
    userId: string,
    x: number,
    y: number,
    target?: string,
  ): void {
    const room = currentRoom();
    if (!room) return;
    send({
      type: "cursor_move",
      roomId: room,
      userId,
      x,
      y,
      ...(target !== undefined ? { target } : {}),
    });
  }

  function sendPresence(
    userId: string,
    presenceStatus: "active" | "idle" | "away",
    data?: Record<string, unknown>,
  ): void {
    const room = currentRoom();
    if (!room) return;
    send({
      type: "presence_update",
      roomId: room,
      userId,
      status: presenceStatus,
      ...(data !== undefined ? { data } : {}),
    });
  }

  function onMessage(handler: MessageHandler): () => void {
    messageHandlers.add(handler);
    return () => {
      messageHandlers.delete(handler);
    };
  }

  function onError(handler: ErrorHandler): () => void {
    errorHandlers.add(handler);
    return () => {
      errorHandlers.delete(handler);
    };
  }

  // ── Cleanup on Unmount ────────────────────────────────────────────
  onCleanup(() => {
    disconnect();
    messageHandlers.clear();
    errorHandlers.clear();
  });

  return {
    status,
    roomUsers,
    cursors,
    currentRoom,
    reconnectAttempts: reconnectAttemptsSignal,
    latency,
    connect,
    disconnect,
    joinRoom,
    leaveRoom,
    broadcast: broadcastFn,
    sendCursor,
    sendPresence,
    onMessage,
    onError,
  };
}
