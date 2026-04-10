// ── Presence Bar Component ───────────────────────────────────────────
// Horizontal bar showing connected user avatars with status indicators.
// Includes "Invite AI" button and total connected count.

import { For, Show, createSignal, createEffect } from "solid-js";
import type { JSX } from "solid-js";
import { Button, Badge, Tooltip } from "@back-to-the-future/ui";
import type { AwarenessState } from "../collab/collaborative-doc";

// ── Types ────────────────────────────────────────────────────────────

interface PresenceBarProps {
  remoteUsers: () => AwarenessState[];
  currentUserId: string;
  currentUserName: string;
  currentUserColor: string;
  onInviteAI?: () => void;
  connected: () => boolean;
}

interface UserDisplay {
  id: string;
  name: string;
  color: string;
  initials: string;
  isAI: boolean;
  status: "online" | "typing" | "idle";
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function getStatusColor(status: string): string {
  switch (status) {
    case "typing":
      return "#22c55e";
    case "idle":
      return "#eab308";
    default:
      return "#22c55e";
  }
}

// ── Component ────────────────────────────────────────────────────────

export function PresenceBar(props: PresenceBarProps): JSX.Element {
  const [displayUsers, setDisplayUsers] = createSignal<UserDisplay[]>([]);

  createEffect(() => {
    const remote = props.remoteUsers();
    const users: UserDisplay[] = [];

    for (const state of remote) {
      if (!state.user || state.user.id === props.currentUserId) continue;
      users.push({
        id: state.user.id,
        name: state.user.name,
        color: state.user.color,
        initials: getInitials(state.user.name),
        isAI: state.user.isAI ?? false,
        status: (state.status as "online" | "typing" | "idle") ?? "online",
      });
    }

    setDisplayUsers(users);
  });

  const totalCount = (): number => displayUsers().length + 1;

  return (
    <div
      style={{
        display: "flex",
        "align-items": "center",
        gap: "8px",
        padding: "6px 12px",
        background: "var(--color-surface, #1a1a2e)",
        "border-radius": "8px",
        "border": "1px solid var(--color-border, #333)",
      }}
    >
      {/* Current user */}
      <Tooltip content={`${props.currentUserName} (You)`} position="bottom">
        <div
          style={{
            position: "relative",
            width: "32px",
            height: "32px",
            "border-radius": "50%",
            background: props.currentUserColor,
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            color: "white",
            "font-size": "12px",
            "font-weight": "700",
            border: "2px solid white",
            cursor: "default",
          }}
        >
          {getInitials(props.currentUserName)}
          <div
            style={{
              position: "absolute",
              bottom: "-1px",
              right: "-1px",
              width: "10px",
              height: "10px",
              "border-radius": "50%",
              background: "#22c55e",
              border: "2px solid var(--color-surface, #1a1a2e)",
            }}
          />
        </div>
      </Tooltip>

      {/* Remote users */}
      <For each={displayUsers()}>
        {(user) => (
          <Tooltip content={`${user.name}${user.isAI ? " (AI Agent)" : ""} - ${user.status}`} position="bottom">
            <div
              style={{
                position: "relative",
                width: "32px",
                height: "32px",
                "border-radius": "50%",
                background: user.color,
                display: "flex",
                "align-items": "center",
                "justify-content": "center",
                color: "white",
                "font-size": "12px",
                "font-weight": "700",
                border: user.isAI ? "2px dashed white" : "2px solid transparent",
                cursor: "default",
                animation: user.isAI ? "pulse-avatar 2s ease-in-out infinite" : "none",
              }}
            >
              {user.isAI ? "AI" : user.initials}
              <div
                style={{
                  position: "absolute",
                  bottom: "-1px",
                  right: "-1px",
                  width: "10px",
                  height: "10px",
                  "border-radius": "50%",
                  background: getStatusColor(user.status),
                  border: "2px solid var(--color-surface, #1a1a2e)",
                }}
              />
            </div>
          </Tooltip>
        )}
      </For>

      {/* Separator */}
      <div
        style={{
          width: "1px",
          height: "20px",
          background: "var(--color-border, #333)",
          margin: "0 4px",
        }}
      />

      {/* Count */}
      <Badge variant="info" size="sm" label={`${totalCount()} online`} />

      {/* Connection status */}
      <Show when={!props.connected()}>
        <Badge variant="warning" size="sm" label="Reconnecting..." />
      </Show>

      {/* Invite AI button */}
      <Show when={props.onInviteAI}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => props.onInviteAI?.()}
        >
          + Invite AI
        </Button>
      </Show>

      <style>{`
        @keyframes pulse-avatar {
          0%, 100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.4); }
          50% { box-shadow: 0 0 0 4px rgba(139, 92, 246, 0); }
        }
      `}</style>
    </div>
  );
}
