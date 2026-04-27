// ── Collaborative Builder Wrapper ────────────────────────────────────
// Wraps the builder with collaboration features: live cursors,
// presence bar, editing indicators, and Yjs document sync.

import {
  createSignal,
  onMount,
  onCleanup,
  Show,
  For,
} from "solid-js";
import type { JSX } from "solid-js";
import { Text, Stack } from "@back-to-the-future/ui";
import {
  CollaborativeDocument,
  type AwarenessState,
  type ComponentNode,
} from "../collab/collaborative-doc";
import { CollaborativeCursors } from "./CollaborativeCursors";
import { PresenceBar } from "./PresenceBar";
import { createAIParticipant } from "../collab/ai-participant";
import { createCollabRoom, getRandomColor } from "../collab/yjs-provider";

// ── Types ────────────────────────────────────────────────────────────

interface CollaborativeBuilderProps {
  roomId: string;
  userId: string;
  userName: string;
  children: JSX.Element;
  onTreeChange?: (tree: ComponentNode[]) => void;
}

interface EditingIndicator {
  userName: string;
  userColor: string;
  componentId: string;
  isAI: boolean;
}

// ── Component ────────────────────────────────────────────────────────

export function CollaborativeBuilder(props: CollaborativeBuilderProps): JSX.Element {
  const [collabDoc, setCollabDoc] = createSignal<CollaborativeDocument | null>(null);
  const [remoteUsers, setRemoteUsers] = createSignal<AwarenessState[]>([]);
  const [connected, setConnected] = createSignal(false);
  const [editingIndicators, setEditingIndicators] = createSignal<EditingIndicator[]>([]);
  let containerRef: HTMLDivElement | undefined;

  onMount(() => {
    const doc = new CollaborativeDocument(props.roomId, props.userId, props.userName);
    setCollabDoc(doc);
    doc.connect();

    // Listen for connection status
    const unsubStatus = doc.onConnectionStatus((isConnected) => {
      setConnected(isConnected);
    });

    // Listen for awareness changes (cursors, presence)
    const unsubAwareness = doc.onAwarenessChange(() => {
      const users = doc.getRemoteUsers();
      setRemoteUsers(users);

      // Build editing indicators
      const indicators: EditingIndicator[] = [];
      for (const state of users) {
        if (state.editingComponent && state.user) {
          indicators.push({
            userName: state.user.name,
            userColor: state.user.color,
            componentId: state.editingComponent,
            isAI: state.user.isAI ?? false,
          });
        }
      }
      setEditingIndicators(indicators);
    });

    // Listen for component tree changes
    const unsubTree = doc.onChange((tree) => {
      props.onTreeChange?.(tree);
    });

    onCleanup(() => {
      unsubStatus();
      unsubAwareness();
      unsubTree();
      doc.disconnect();
      doc.destroy();
    });
  });

  // Track mouse movement for cursor sharing
  function handleMouseMove(e: MouseEvent): void {
    const doc = collabDoc();
    if (!doc || !containerRef) return;
    const rect = containerRef.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    doc.updateCursor(x, y);
  }

  // Invite AI agent
  function handleInviteAI(): void {
    const doc = collabDoc();
    if (!doc) return;

    const aiColor = getRandomColor();
    const aiRoom = createCollabRoom({
      roomId: props.roomId,
      user: {
        id: `ai-agent-${Date.now()}`,
        name: "Composer Agent",
        color: aiColor,
        isAI: true,
      },
    });

    const aiAgent = createAIParticipant({
      agent: {
        id: `ai-agent-${Date.now()}`,
        name: "Composer Agent",
        color: aiColor,
        isAI: true,
      },
      room: aiRoom,
    });

    // Simulate AI cursor movement
    let aiX = 200;
    let aiY = 200;
    const aiInterval = setInterval(() => {
      aiX += (crypto.getRandomValues(new Uint32Array(1))[0]! / 0x100000000) * 40 - 20;
      aiY += (crypto.getRandomValues(new Uint32Array(1))[0]! / 0x100000000) * 40 - 20;
      aiX = Math.max(50, Math.min(800, aiX));
      aiY = Math.max(50, Math.min(600, aiY));
      aiAgent.moveCursor(aiX, aiY);
    }, 2000);

    onCleanup(() => {
      clearInterval(aiInterval);
      aiAgent.disconnect();
      aiRoom.destroy();
    });
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Presence bar at top */}
      <div style={{ padding: "8px 12px" }}>
        <PresenceBar
          remoteUsers={remoteUsers}
          currentUserId={props.userId}
          currentUserName={props.userName}
          currentUserColor={collabDoc()?.getUserColor() ?? "#4ECDC4"}
          connected={connected}
          onInviteAI={handleInviteAI}
        />
      </div>

      {/* Editing indicators */}
      <Show when={editingIndicators().length > 0}>
        <div style={{ padding: "4px 12px" }}>
          <Stack direction="horizontal" gap="sm">
            <For each={editingIndicators()}>
              {(indicator) => (
                <div
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "4px",
                    padding: "2px 8px",
                    "border-radius": "4px",
                    background: `${indicator.userColor}20`,
                    border: `1px solid ${indicator.userColor}40`,
                    "font-size": "11px",
                  }}
                >
                  <div
                    style={{
                      width: "6px",
                      height: "6px",
                      "border-radius": "50%",
                      background: indicator.userColor,
                    }}
                  />
                  <Text variant="caption">
                    {indicator.isAI ? `AI: ${indicator.userName}` : indicator.userName} is editing
                  </Text>
                </div>
              )}
            </For>
          </Stack>
        </div>
      </Show>

      {/* Builder content with cursor overlay */}
      <div
        ref={containerRef}
        style={{ position: "relative", flex: "1", overflow: "hidden" }}
        onMouseMove={handleMouseMove}
      >
        {props.children}
        <CollaborativeCursors
          remoteUsers={remoteUsers}
          currentUserId={props.userId}
        />
      </div>
    </div>
  );
}
