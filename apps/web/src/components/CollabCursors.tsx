// ── Collaborative Cursor & Presence UI ───────────────────────────────
// Renders remote user cursors, selections, and presence indicators.
// Shows who's online, what they're doing, and where they're looking.

import { For, Show, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { Text, Badge, Avatar, Stack } from "@back-to-the-future/ui";

// ── Types ────────────────────────────────────────────────────────────

interface CollabUser {
  id: string;
  name: string;
  color: string;
  isAI?: boolean;
}

interface CursorPosition {
  userId: string;
  x: number;
  y: number;
}

// ── Cursor Component ─────────────────────────────────────────────────

interface RemoteCursorProps {
  user: CollabUser;
  position: CursorPosition;
}

function RemoteCursor(props: RemoteCursorProps): JSX.Element {
  return (
    <div
      class="collab-cursor"
      style={{
        position: "absolute",
        left: `${props.position.x}px`,
        top: `${props.position.y}px`,
        "pointer-events": "none",
        "z-index": "9999",
        transition: "left 50ms linear, top 50ms linear",
      }}
    >
      {/* Cursor arrow SVG */}
      <svg
        width="16"
        height="20"
        viewBox="0 0 16 20"
        fill="none"
        style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }}
      >
        <path
          d="M0 0L16 12L8 12L4 20L0 0Z"
          fill={props.user.color}
        />
      </svg>
      {/* User name label */}
      <div
        class="collab-cursor-label"
        style={{
          position: "absolute",
          left: "16px",
          top: "12px",
          background: props.user.color,
          color: "white",
          padding: "2px 6px",
          "border-radius": "4px",
          "font-size": "11px",
          "font-weight": "600",
          "white-space": "nowrap",
          "box-shadow": "0 1px 3px rgba(0,0,0,0.2)",
        }}
      >
        {props.user.isAI ? `🤖 ${props.user.name}` : props.user.name}
      </div>
    </div>
  );
}

// ── Cursors Overlay ──────────────────────────────────────────────────

interface CursorsOverlayProps {
  users: CollabUser[];
  cursors: CursorPosition[];
  /** The current user's ID (their cursor is not shown) */
  currentUserId: string;
}

export function CursorsOverlay(props: CursorsOverlayProps): JSX.Element {
  const remoteCursors = createMemo(() => {
    return props.cursors
      .filter((c) => c.userId !== props.currentUserId)
      .map((cursor) => {
        const user = props.users.find((u) => u.id === cursor.userId);
        if (!user) return null;
        return { user, position: cursor };
      })
      .filter(Boolean) as Array<{ user: CollabUser; position: CursorPosition }>;
  });

  return (
    <div
      class="collab-cursors-overlay"
      style={{
        position: "absolute",
        inset: "0",
        "pointer-events": "none",
        overflow: "hidden",
      }}
    >
      <For each={remoteCursors()}>
        {(item) => <RemoteCursor user={item.user} position={item.position} />}
      </For>
    </div>
  );
}

// ── Presence Bar ─────────────────────────────────────────────────────

interface PresenceBarProps {
  users: CollabUser[];
  currentUserId: string;
}

export function PresenceBar(props: PresenceBarProps): JSX.Element {
  const otherUsers = createMemo(() =>
    props.users.filter((u) => u.id !== props.currentUserId),
  );

  return (
    <Stack direction="horizontal" gap="sm" align="center" class="presence-bar">
      <Show when={otherUsers().length > 0}>
        <For each={otherUsers()}>
          {(user) => (
            <div
              class="presence-indicator"
              style={{
                display: "flex",
                "align-items": "center",
                gap: "4px",
              }}
            >
              <div
                style={{
                  width: "8px",
                  height: "8px",
                  "border-radius": "50%",
                  background: user.color,
                  "box-shadow": `0 0 0 2px ${user.color}33`,
                }}
              />
              <Text variant="caption">
                {user.isAI ? `🤖 ${user.name}` : user.name}
              </Text>
            </div>
          )}
        </For>
      </Show>

      <Show when={otherUsers().length === 0}>
        <Text variant="caption" class="text-muted">
          Only you are here
        </Text>
      </Show>

      <Badge
        variant="info"
        size="sm"
        label={`${props.users.length} online`}
      />
    </Stack>
  );
}
