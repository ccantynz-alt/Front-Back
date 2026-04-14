import {
  type Accessor,
  type JSX,
  createComponent,
  createContext,
  createSignal,
  onCleanup,
  useContext,
} from "solid-js";

// ── Real-Time Types (matching server protocol) ───────────────────────

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface RoomUser {
  userId: string;
  metadata?: {
    displayName?: string | undefined;
    color?: string | undefined;
  } | undefined;
  presence?: {
    status: "active" | "idle" | "away";
    data?: Record<string, unknown> | undefined;
  } | undefined;
}

interface CursorPosition {
  userId: string;
  x: number;
  y: number;
  target?: string | undefined;
  timestamp: number;
}

// Server → Client message types
interface ServerMessage {
  type: string;
  roomId?: string;
  userId?: string;
  users?: RoomUser[];
  metadata?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  x?: number;
  y?: number;
  target?: string;
  status?: string;
  data?: Record<string, unknown>;
  code?: string;
  message?: string;
  timestamp?: string;
}

interface RealtimeState {
  connectionStatus: Accessor<ConnectionStatus>;
  roomUsers: Accessor<RoomUser[]>;
  cursors: Accessor<CursorPosition[]>;
  currentRoom: Accessor<string | null>;
  connect: (url: string) => void;
  disconnect: () => void;
  joinRoom: (roomId: string, userId: string, metadata?: { displayName?: string; color?: string }) => void;
  leaveRoom: (userId: string) => void;
  sendCursorMove: (roomId: string, userId: string, x: number, y: number, target?: string) => void;
  updatePresence: (roomId: string, userId: string, status: "active" | "idle" | "away") => void;
  onMessage: (handler: (message: ServerMessage) => void) => () => void;
}

// ── Constants ─────────────────────────────────────────────────────────

const RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;
const CURSOR_STALE_MS = 5000;
const PING_INTERVAL_MS = 15000;

// ── Realtime Context ──────────────────────────────────────────────────

const RealtimeContext = createContext<RealtimeState>();

export function RealtimeProvider(props: { children: JSX.Element }): JSX.Element {
  const [connectionStatus, setConnectionStatus] = createSignal<ConnectionStatus>("disconnected");
  const [roomUsers, setRoomUsers] = createSignal<RoomUser[]>([]);
  const [cursors, setCursors] = createSignal<CursorPosition[]>([]);
  const [currentRoom, setCurrentRoom] = createSignal<string | null>(null);

  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = RECONNECT_DELAY_MS;
  let wsUrl: string | null = null;
  let cursorCleanupInterval: ReturnType<typeof setInterval> | null = null;
  let pingInterval: ReturnType<typeof setInterval> | null = null;
  let lastJoinParams: {
    roomId: string;
    userId: string;
    metadata?: { displayName?: string | undefined; color?: string | undefined } | undefined;
  } | null = null;
  const messageHandlers = new Set<(message: ServerMessage) => void>();

  function startCursorCleanup(): void {
    if (cursorCleanupInterval) return;
    cursorCleanupInterval = setInterval((): void => {
      const now = Date.now();
      setCursors((prev) => prev.filter((c) => now - c.timestamp < CURSOR_STALE_MS));
    }, CURSOR_STALE_MS);
  }

  function stopCursorCleanup(): void {
    if (cursorCleanupInterval) {
      clearInterval(cursorCleanupInterval);
      cursorCleanupInterval = null;
    }
  }

  function startPing(): void {
    if (pingInterval) return;
    pingInterval = setInterval(() => {
      sendRaw({ type: "ping" });
    }, PING_INTERVAL_MS);
  }

  function stopPing(): void {
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
  }

  function sendRaw(message: Record<string, unknown>): void {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  function handleMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data as string) as ServerMessage;

      // Handle server → client message types (matching server protocol)
      switch (message.type) {
        case "room_joined": {
          setRoomUsers(message.users ?? []);
          break;
        }
        case "user_joined": {
          const newUser: RoomUser = {
            userId: message.userId ?? "",
            metadata: message.metadata as RoomUser["metadata"],
          };
          setRoomUsers((prev) => [...prev.filter((u) => u.userId !== newUser.userId), newUser]);
          break;
        }
        case "user_left": {
          const leftUserId = message.userId ?? "";
          setRoomUsers((prev) => prev.filter((u) => u.userId !== leftUserId));
          setCursors((prev) => prev.filter((c) => c.userId !== leftUserId));
          break;
        }
        case "cursor_update": {
          const cursor: CursorPosition = {
            userId: message.userId ?? "",
            x: message.x ?? 0,
            y: message.y ?? 0,
            target: message.target,
            timestamp: Date.now(),
          };
          setCursors((prev) => [
            ...prev.filter((c) => c.userId !== cursor.userId),
            cursor,
          ]);
          break;
        }
        case "presence_sync": {
          const userId = message.userId ?? "";
          setRoomUsers((prev) =>
            prev.map((u) =>
              u.userId === userId
                ? { ...u, presence: { status: message.status as "active" | "idle" | "away", data: message.data } }
                : u,
            ),
          );
          break;
        }
        case "error": {
          console.warn(`[Realtime] Server error: ${message.code} - ${message.message}`);
          break;
        }
        case "pong": {
          // Heartbeat acknowledged
          break;
        }
      }

      // Forward to registered handlers
      for (const handler of messageHandlers) {
        handler(message);
      }
    } catch {
      // Malformed message -- skip
    }
  }

  function scheduleReconnect(): void {
    if (!wsUrl) return;
    reconnectTimer = setTimeout((): void => {
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
      connect(wsUrl!);
    }, reconnectDelay);
  }

  function connect(url: string): void {
    if (typeof window === "undefined") return;

    wsUrl = url;
    disconnect();

    setConnectionStatus("connecting");

    try {
      ws = new WebSocket(url);

      ws.onopen = (): void => {
        setConnectionStatus("connected");
        reconnectDelay = RECONNECT_DELAY_MS;
        startCursorCleanup();
        startPing();

        // Rejoin room if we were in one
        if (lastJoinParams) {
          sendRaw({
            type: "join_room",
            roomId: lastJoinParams.roomId,
            userId: lastJoinParams.userId,
            metadata: lastJoinParams.metadata,
          });
        }
      };

      ws.onmessage = handleMessage;

      ws.onclose = (): void => {
        setConnectionStatus("disconnected");
        ws = null;
        stopPing();
        scheduleReconnect();
      };

      ws.onerror = (): void => {
        setConnectionStatus("error");
      };
    } catch {
      setConnectionStatus("error");
      scheduleReconnect();
    }
  }

  function disconnect(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    wsUrl = null;

    if (ws) {
      ws.onclose = null;
      ws.close();
      ws = null;
    }

    setConnectionStatus("disconnected");
    setRoomUsers([]);
    setCursors([]);
    setCurrentRoom(null);
    stopCursorCleanup();
    stopPing();
  }

  function joinRoom(
    roomId: string,
    userId: string,
    metadata?: { displayName?: string; color?: string },
  ): void {
    const prevRoom = currentRoom();
    if (prevRoom && lastJoinParams) {
      sendRaw({
        type: "leave_room",
        roomId: prevRoom,
        userId: lastJoinParams.userId,
      });
    }

    lastJoinParams = { roomId, userId, metadata };
    setCurrentRoom(roomId);
    setRoomUsers([]);
    setCursors([]);

    sendRaw({
      type: "join_room",
      roomId,
      userId,
      metadata,
    });
  }

  function leaveRoom(userId: string): void {
    const room = currentRoom();
    if (room) {
      sendRaw({
        type: "leave_room",
        roomId: room,
        userId,
      });
    }
    lastJoinParams = null;
    setCurrentRoom(null);
    setRoomUsers([]);
    setCursors([]);
  }

  function sendCursorMove(
    roomId: string,
    userId: string,
    x: number,
    y: number,
    target?: string,
  ): void {
    sendRaw({
      type: "cursor_move",
      roomId,
      userId,
      x,
      y,
      ...(target ? { target } : {}),
    });
  }

  function updatePresence(
    roomId: string,
    userId: string,
    status: "active" | "idle" | "away",
  ): void {
    sendRaw({
      type: "presence_update",
      roomId,
      userId,
      status,
    });
  }

  function onMessage(handler: (message: ServerMessage) => void): () => void {
    messageHandlers.add(handler);
    return (): void => {
      messageHandlers.delete(handler);
    };
  }

  onCleanup((): void => {
    disconnect();
    messageHandlers.clear();
  });

  const state: RealtimeState = {
    connectionStatus,
    roomUsers,
    cursors,
    currentRoom,
    connect,
    disconnect,
    joinRoom,
    leaveRoom,
    sendCursorMove,
    updatePresence,
    onMessage,
  };

  return createComponent(RealtimeContext.Provider, {
    value: state,
    get children() {
      return props.children;
    },
  });
}

export function useRealtime(): RealtimeState {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error("useRealtime must be used within a RealtimeProvider");
  }
  return context;
}
