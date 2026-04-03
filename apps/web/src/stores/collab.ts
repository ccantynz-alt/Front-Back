import { createSignal, onCleanup, type Accessor } from "solid-js";
import {
  CronixDocument,
  AwarenessManager,
  CollabProvider,
  type UserAwareness,
  type CollabConnectionStatus,
} from "@cronix/collab";

// ── Types ───────────────────────────────────────────────────────

interface CollabStore {
  /** The CronixDocument (Yjs wrapper) for this session */
  document: CronixDocument;
  /** The AwarenessManager for presence/cursor state */
  awareness: AwarenessManager;
  /** Reactive signal: current connection status */
  connected: Accessor<boolean>;
  /** Reactive signal: current connection status string */
  connectionStatus: Accessor<CollabConnectionStatus>;
  /** Reactive signal: all connected peers (including AI agents) */
  peers: Accessor<UserAwareness[]>;
  /** Reactive signal: the local user's awareness state */
  localUser: Accessor<UserAwareness | undefined>;
  /** Connect to a collaboration room */
  connect: (roomId: string) => void;
  /** Disconnect from the current room */
  disconnect: () => void;
  /** Set the local user's identity */
  setUser: (user: Omit<UserAwareness, "color"> & { color?: string }) => void;
  /** Update the local cursor position */
  setCursor: (x: number, y: number, target?: string) => void;
  /** Update the local text selection */
  setSelection: (anchor: number, head: number, target?: string) => void;
  /** Destroy everything — call on unmount */
  destroy: () => void;
}

// ── Factory ─────────────────────────────────────────────────────

/**
 * Creates a reactive collaboration store for SolidJS.
 *
 * Usage:
 * ```tsx
 * const collab = createCollabStore("ws://localhost:3001/api/collab");
 * collab.setUser({ userId: "user-1", displayName: "Alice", isAI: false });
 * collab.connect("room-123");
 *
 * // In JSX:
 * <Show when={collab.connected()}>
 *   <For each={collab.peers()}>
 *     {(peer) => <span style={{ color: peer.color }}>{peer.displayName}</span>}
 *   </For>
 * </Show>
 * ```
 *
 * @param wsBaseUrl - Base WebSocket URL for the collab endpoint (e.g., ws://localhost:3001/api/collab)
 */
export function createCollabStore(wsBaseUrl: string): CollabStore {
  // Core Yjs instances
  const document = new CronixDocument();
  const awareness = new AwarenessManager(document.clientId);

  // Reactive signals
  const [connected, setConnected] = createSignal(false);
  const [connectionStatus, setConnectionStatus] = createSignal<CollabConnectionStatus>("disconnected");
  const [peers, setPeers] = createSignal<UserAwareness[]>([]);
  const [localUser, setLocalUser] = createSignal<UserAwareness | undefined>(undefined);

  let provider: CollabProvider | null = null;
  let awarenessUnsub: (() => void) | null = null;

  // Keep peers signal in sync with awareness changes
  awarenessUnsub = awareness.onAwarenessChange((states): void => {
    const peerList: UserAwareness[] = [];
    for (const [_clientId, state] of states) {
      peerList.push(state);
    }
    setPeers(peerList);

    // Update local user signal
    const local = awareness.getLocalState();
    setLocalUser(local);
  });

  function connect(roomId: string): void {
    // Disconnect existing provider if any
    if (provider) {
      provider.destroy();
    }

    const wsUrl = `${wsBaseUrl}/ws`;

    provider = new CollabProvider({
      url: wsUrl,
      roomId,
      document,
      awareness,
    });

    provider.onStatusChange((status): void => {
      setConnectionStatus(status);
      setConnected(status === "connected");
    });

    provider.connect();
  }

  function disconnect(): void {
    if (provider) {
      provider.disconnect();
      provider = null;
    }
    setConnected(false);
    setConnectionStatus("disconnected");
  }

  function setUser(user: Omit<UserAwareness, "color"> & { color?: string }): void {
    awareness.setLocalState(user);
    setLocalUser(awareness.getLocalState());
  }

  function setCursor(x: number, y: number, target?: string): void {
    awareness.updateLocalField("cursor", { x, y, target });
  }

  function setSelection(anchor: number, head: number, target?: string): void {
    awareness.updateLocalField("selection", { anchor, head, target });
  }

  function destroy(): void {
    disconnect();
    if (awarenessUnsub) {
      awarenessUnsub();
      awarenessUnsub = null;
    }
    awareness.destroy();
    document.destroy();
  }

  // Auto-cleanup when the SolidJS owner is disposed
  onCleanup(destroy);

  return {
    document,
    awareness,
    connected,
    connectionStatus,
    peers,
    localUser,
    connect,
    disconnect,
    setUser,
    setCursor,
    setSelection,
    destroy,
  };
}
