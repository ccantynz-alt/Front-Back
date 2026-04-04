// ── Collaboration Store ──────────────────────────────────────────────
// SolidJS signal-based store for Yjs CRDT collaboration state.

import { createSignal, createContext, useContext, onCleanup } from "solid-js";
import type { ParentComponent } from "solid-js";
import {
  createCollabRoom,
  getConnectedUsers,
  getCursorPositions,
  getSharedText,
  getSharedMap,
  type CollabRoom,
  type CollabUser,
  type CursorPosition,
} from "../collab/yjs-provider";

// ── Store Types ──────────────────────────────────────────────────────

interface CollabState {
  connected: boolean;
  roomId: string | null;
  users: CollabUser[];
  cursors: CursorPosition[];
  room: CollabRoom | null;
}

interface CollabActions {
  joinRoom(roomId: string, user: CollabUser): void;
  leaveRoom(): void;
  getText(field?: string): string;
  setText(field: string, text: string): void;
  getState(key: string): unknown;
  setState(key: string, value: unknown): void;
}

type CollabStore = [CollabState, CollabActions];

// ── Context ──────────────────────────────────────────────────────────

const CollabContext = createContext<CollabStore>();

export function useCollab(): CollabStore {
  const ctx = useContext(CollabContext);
  if (!ctx) {
    throw new Error("useCollab must be used within a CollabProvider");
  }
  return ctx;
}

// ── Provider ─────────────────────────────────────────────────────────

export const CollabProvider: ParentComponent = (props) => {
  const [connected, setConnected] = createSignal(false);
  const [roomId, setRoomId] = createSignal<string | null>(null);
  const [users, setUsers] = createSignal<CollabUser[]>([]);
  const [cursors, setCursors] = createSignal<CursorPosition[]>([]);
  const [room, setRoom] = createSignal<CollabRoom | null>(null);

  let awarenessInterval: ReturnType<typeof setInterval> | null = null;

  function joinRoom(id: string, user: CollabUser) {
    // Clean up existing room
    leaveRoom();

    const newRoom = createCollabRoom({
      roomId: id,
      user,
    });

    newRoom.provider.on("status", (event: { status: string }) => {
      setConnected(event.status === "connected");
    });

    // Poll awareness for user/cursor updates
    awarenessInterval = setInterval(() => {
      setUsers(getConnectedUsers(newRoom.awareness));
      setCursors(getCursorPositions(newRoom.awareness));
    }, 100);

    setRoom(newRoom);
    setRoomId(id);
  }

  function leaveRoom() {
    const currentRoom = room();
    if (currentRoom) {
      currentRoom.destroy();
      setRoom(null);
    }
    if (awarenessInterval) {
      clearInterval(awarenessInterval);
      awarenessInterval = null;
    }
    setConnected(false);
    setRoomId(null);
    setUsers([]);
    setCursors([]);
  }

  function getText(field: string = "content"): string {
    const currentRoom = room();
    if (!currentRoom) return "";
    return getSharedText(currentRoom.doc, field).toString();
  }

  function setText(field: string, text: string) {
    const currentRoom = room();
    if (!currentRoom) return;
    const yText = getSharedText(currentRoom.doc, field);
    currentRoom.doc.transact(() => {
      yText.delete(0, yText.length);
      yText.insert(0, text);
    });
  }

  function getStateVal(key: string): unknown {
    const currentRoom = room();
    if (!currentRoom) return undefined;
    return getSharedMap(currentRoom.doc, "state").get(key);
  }

  function setStateVal(key: string, value: unknown) {
    const currentRoom = room();
    if (!currentRoom) return;
    getSharedMap(currentRoom.doc, "state").set(key, value);
  }

  onCleanup(leaveRoom);

  const state: CollabState = {
    get connected() { return connected(); },
    get roomId() { return roomId(); },
    get users() { return users(); },
    get cursors() { return cursors(); },
    get room() { return room(); },
  };

  const actions: CollabActions = {
    joinRoom,
    leaveRoom,
    getText,
    setText,
    getState: getStateVal,
    setState: setStateVal,
  };

  const store: CollabStore = [state, actions];

  // @ts-expect-error - SolidJS context provider typing
  return CollabContext.Provider({ value: store, children: props.children });
};
