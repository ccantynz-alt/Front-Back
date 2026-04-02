import {
  type Accessor,
  type JSX,
  createContext,
  createSignal,
  onCleanup,
  useContext,
} from "solid-js";

// ── Real-Time Types ───────────────────────────────────────────────────

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface RoomUser {
  id: string;
  displayName: string;
  color: string;
}

interface CursorPosition {
  userId: string;
  x: number;
  y: number;
  timestamp: number;
}

interface RealtimeMessage {
  type: string;
  payload: unknown;
  roomId?: string;
  senderId?: string;
}

interface RealtimeState {
  connectionStatus: Accessor<ConnectionStatus>;
  roomUsers: Accessor<RoomUser[]>;
  cursors: Accessor<CursorPosition[]>;
  currentRoom: Accessor<string | null>;
  connect: (url: string) => void;
  disconnect: () => void;
  joinRoom: (roomId: string) => void;
  leaveRoom: () => void;
  sendMessage: (message: RealtimeMessage) => void;
  onMessage: (handler: (message: RealtimeMessage) => void) => () => void;
}

// ── Constants ─────────────────────────────────────────────────────────

const RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;
const CURSOR_STALE_MS = 5000;

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
  const messageHandlers = new Set<(message: RealtimeMessage) => void>();

  // Clean up stale cursors periodically
  let cursorCleanupInterval: ReturnType<typeof setInterval> | null = null;

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

  function handleMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data as string) as RealtimeMessage;

      // Handle built-in message types
      switch (message.type) {
        case "room:users": {
          setRoomUsers(message.payload as RoomUser[]);
          break;
        }
        case "room:user_joined": {
          const user = message.payload as RoomUser;
          setRoomUsers((prev) => [...prev.filter((u) => u.id !== user.id), user]);
          break;
        }
        case "room:user_left": {
          const userId = (message.payload as { id: string }).id;
          setRoomUsers((prev) => prev.filter((u) => u.id !== userId));
          setCursors((prev) => prev.filter((c) => c.userId !== userId));
          break;
        }
        case "cursor:move": {
          const cursor = message.payload as CursorPosition;
          setCursors((prev) => [
            ...prev.filter((c) => c.userId !== cursor.userId),
            { ...cursor, timestamp: Date.now() },
          ]);
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

        // Rejoin room if we were in one
        const room = currentRoom();
        if (room) {
          sendMessage({ type: "room:join", payload: { roomId: room } });
        }
      };

      ws.onmessage = handleMessage;

      ws.onclose = (): void => {
        setConnectionStatus("disconnected");
        ws = null;
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
      ws.onclose = null; // Prevent reconnect on intentional close
      ws.close();
      ws = null;
    }

    setConnectionStatus("disconnected");
    setRoomUsers([]);
    setCursors([]);
    setCurrentRoom(null);
    stopCursorCleanup();
  }

  function joinRoom(roomId: string): void {
    const prevRoom = currentRoom();
    if (prevRoom) {
      sendMessage({ type: "room:leave", payload: { roomId: prevRoom } });
    }
    setCurrentRoom(roomId);
    setRoomUsers([]);
    setCursors([]);
    sendMessage({ type: "room:join", payload: { roomId } });
  }

  function leaveRoom(): void {
    const room = currentRoom();
    if (room) {
      sendMessage({ type: "room:leave", payload: { roomId: room } });
    }
    setCurrentRoom(null);
    setRoomUsers([]);
    setCursors([]);
  }

  function sendMessage(message: RealtimeMessage): void {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  function onMessage(handler: (message: RealtimeMessage) => void): () => void {
    messageHandlers.add(handler);
    return (): void => {
      messageHandlers.delete(handler);
    };
  }

  // Cleanup on unmount
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
    sendMessage,
    onMessage,
  };

  const Provider = RealtimeContext.Provider as (props: {
    value: RealtimeState;
    children: JSX.Element;
  }) => JSX.Element;

  return Provider({ value: state, children: props.children });
}

export function useRealtime(): RealtimeState {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error("useRealtime must be used within a RealtimeProvider");
  }
  return context;
}
