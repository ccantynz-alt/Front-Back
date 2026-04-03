// ── SolidJS Collaboration Hook ───────────────────────────────────────
// Wraps yjs-provider in reactive SolidJS signals so components can
// consume collaboration state declaratively.

import { type Accessor, createSignal, onCleanup, onMount } from "solid-js";
import type * as Y from "yjs";
import {
  type CollabSession,
  createCollabSession,
  destroyCollabSession,
} from "./yjs-provider";

/** Awareness state for a single connected user / agent. */
export interface AwarenessUser {
  clientId: number;
  [key: string]: unknown;
}

interface UseCollabReturn {
  /** Whether the WebSocket is currently connected. */
  connected: Accessor<boolean>;
  /** Array of awareness states for all participants in the room. */
  users: Accessor<AwarenessUser[]>;
  /** The underlying Yjs document (stable reference). */
  doc: Accessor<Y.Doc | null>;
}

/**
 * Reactive hook for joining a Yjs collaboration room.
 *
 * Connects on mount, exposes reactive connection state and awareness
 * users, and tears everything down when the owning component unmounts.
 *
 * @param roomId - Unique identifier for the collaborative room.
 * @param wsUrl  - Optional WebSocket URL override.  Defaults to
 *                 `ws://localhost:1234` for local development.
 */
export function useCollab(
  roomId: string,
  wsUrl = "ws://localhost:1234",
): UseCollabReturn {
  const [connected, setConnected] = createSignal(false);
  const [users, setUsers] = createSignal<AwarenessUser[]>([]);
  const [doc, setDoc] = createSignal<Y.Doc | null>(null);

  let session: CollabSession | null = null;

  onMount(() => {
    session = createCollabSession(roomId, wsUrl);
    setDoc(session.doc);

    // Track connection status via the provider's status events.
    const onStatus = ({ status }: { status: string }): void => {
      setConnected(status === "connected");
    };
    session.provider.on("status", onStatus);

    // Sync awareness state into a reactive signal.
    const syncAwareness = (): void => {
      if (!session) return;
      const states = session.awareness.getStates();
      const result: AwarenessUser[] = [];
      states.forEach((state: Record<string, unknown>, clientId: number) => {
        result.push({ clientId, ...state });
      });
      setUsers(result);
    };

    session.awareness.on("change", syncAwareness);

    // Initial sync
    syncAwareness();
  });

  onCleanup(() => {
    if (session) {
      destroyCollabSession(session);
      session = null;
    }
  });

  return { connected, users, doc };
}
