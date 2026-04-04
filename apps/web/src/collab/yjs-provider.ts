// ── Yjs CRDT Collaboration Provider ──────────────────────────────────
// Real-time, multi-user, multi-agent, conflict-free collaboration.
// Uses Yjs CRDTs for automatic conflict resolution.

import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

// ── Types ────────────────────────────────────────────────────────────

export interface CollabUser {
  id: string;
  name: string;
  color: string;
  isAI?: boolean;
}

export interface CursorPosition {
  userId: string;
  x: number;
  y: number;
  selection?: { anchor: number; head: number };
}

export interface CollabRoom {
  doc: Y.Doc;
  provider: WebsocketProvider;
  awareness: WebsocketProvider["awareness"];
  destroy(): void;
}

export interface CollabConfig {
  /** WebSocket server URL */
  serverUrl?: string;
  /** Room/document identifier */
  roomId: string;
  /** Current user info */
  user: CollabUser;
}

// ── Color Palette for Collaboration Cursors ──────────────────────────

const CURSOR_COLORS = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4",
  "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F",
  "#BB8FCE", "#85C1E9", "#F0B27A", "#82E0AA",
];

export function getRandomColor(): string {
  return CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)]!;
}

// ── Room Factory ─────────────────────────────────────────────────────

/**
 * Creates a collaborative room connected via WebSocket.
 * The Yjs document syncs automatically with all connected peers.
 */
export function createCollabRoom(config: CollabConfig): CollabRoom {
  const serverUrl =
    config.serverUrl ??
    (typeof window !== "undefined"
      ? `ws://${window.location.hostname}:3001/api/ws`
      : "ws://localhost:3001/api/ws");

  const doc = new Y.Doc();

  const provider = new WebsocketProvider(serverUrl, config.roomId, doc, {
    connect: true,
  });

  // Set user awareness (cursor, name, color)
  const awareness = provider.awareness;
  awareness.setLocalStateField("user", {
    id: config.user.id,
    name: config.user.name,
    color: config.user.color || getRandomColor(),
    isAI: config.user.isAI ?? false,
  });

  return {
    doc,
    provider,
    awareness,
    destroy() {
      awareness.destroy();
      provider.destroy();
      doc.destroy();
    },
  };
}

// ── Shared Data Types ────────────────────────────────────────────────

/**
 * Gets or creates a shared text type for collaborative text editing.
 */
export function getSharedText(doc: Y.Doc, name: string = "content"): Y.Text {
  return doc.getText(name);
}

/**
 * Gets or creates a shared map for collaborative key-value state.
 */
export function getSharedMap(doc: Y.Doc, name: string = "state"): Y.Map<unknown> {
  return doc.getMap(name);
}

/**
 * Gets or creates a shared array for collaborative lists.
 */
export function getSharedArray(doc: Y.Doc, name: string = "items"): Y.Array<unknown> {
  return doc.getArray(name);
}

/**
 * Gets or creates a shared XML fragment for component tree collaboration.
 * Used by the collaborative website builder.
 */
export function getSharedXML(doc: Y.Doc, name: string = "components"): Y.XmlFragment {
  return doc.getXmlFragment(name);
}

// ── Awareness Helpers ────────────────────────────────────────────────

/**
 * Returns all currently connected users from the awareness protocol.
 */
export function getConnectedUsers(awareness: WebsocketProvider["awareness"]): CollabUser[] {
  const users: CollabUser[] = [];
  for (const [, state] of awareness.getStates()) {
    if (state["user"]) {
      users.push(state["user"] as CollabUser);
    }
  }
  return users;
}

/**
 * Updates the local user's cursor position in the awareness protocol.
 */
export function updateCursorPosition(
  awareness: WebsocketProvider["awareness"],
  position: Omit<CursorPosition, "userId">,
): void {
  awareness.setLocalStateField("cursor", position);
}

/**
 * Returns all active cursor positions from connected users.
 */
export function getCursorPositions(
  awareness: WebsocketProvider["awareness"],
): CursorPosition[] {
  const cursors: CursorPosition[] = [];
  for (const [clientId, state] of awareness.getStates()) {
    if (state["cursor"] && state["user"]) {
      cursors.push({
        ...(state["cursor"] as Omit<CursorPosition, "userId">),
        userId: (state["user"] as CollabUser).id,
      });
    }
  }
  return cursors;
}

// ── Undo Manager ─────────────────────────────────────────────────────

/**
 * Creates an undo manager for collaborative editing.
 * Tracks changes and allows undo/redo per user.
 */
export function createUndoManager(
  scope: Y.Text | Y.Array<unknown> | Y.Map<unknown> | Y.XmlFragment,
): Y.UndoManager {
  return new Y.UndoManager(scope, {
    captureTimeout: 500,
  });
}
