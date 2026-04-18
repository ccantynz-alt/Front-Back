// ── Collaborative Cursors Component ──────────────────────────────────
// Renders other users' cursor positions with smooth animation.
// AI agent cursors get a pulsing effect and different icon.
// Inactive cursors fade out after 5 seconds.

import { For, createSignal, createEffect, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import type { AwarenessState } from "../collab/collaborative-doc";

// ── Types ────────────────────────────────────────────────────────────

interface CollaborativeCursorsProps {
  remoteUsers: () => AwarenessState[];
  currentUserId: string;
}

interface CursorDisplayState {
  user: AwarenessState["user"];
  x: number;
  y: number;
  isAI: boolean;
  isActive: boolean;
}

// ── Component ────────────────────────────────────────────────────────

export function CollaborativeCursors(props: CollaborativeCursorsProps): JSX.Element {
  const [cursorStates, setCursorStates] = createSignal<CursorDisplayState[]>([]);

  createEffect(() => {
    const users = props.remoteUsers();
    const now = Date.now();
    const INACTIVE_THRESHOLD = 5000;

    const states: CursorDisplayState[] = [];
    for (const state of users) {
      if (!state.user || state.user.id === props.currentUserId) continue;
      if (!state.cursor) continue;

      const lastActive = state.lastActive ?? now;
      const isActive = now - lastActive < INACTIVE_THRESHOLD;

      states.push({
        user: state.user,
        x: state.cursor.x,
        y: state.cursor.y,
        isAI: state.user.isAI ?? false,
        isActive,
      });
    }

    setCursorStates(states);
  });

  // Periodic refresh for fade-out timing
  const interval = setInterval(() => {
    setCursorStates((prev) => {
      const now = Date.now();
      const users = props.remoteUsers();
      return prev.map((cs) => {
        const remote = users.find((u) => u.user?.id === cs.user.id);
        const lastActive = remote?.lastActive ?? 0;
        return { ...cs, isActive: now - lastActive < 5000 };
      });
    });
  }, 1000);

  onCleanup(() => clearInterval(interval));

  return (
    <div
      style={{
        position: "absolute",
        inset: "0",
        "pointer-events": "none",
        overflow: "hidden",
        "z-index": "9999",
      }}
    >
      <For each={cursorStates()}>
        {(cursor) => (
          <div
            style={{
              position: "absolute",
              left: `${cursor.x}px`,
              top: `${cursor.y}px`,
              "pointer-events": "none",
              transition: "left 80ms linear, top 80ms linear, opacity 300ms ease",
              opacity: cursor.isActive ? "1" : "0.3",
            }}
          >
            {cursor.isAI ? (
              <div
                style={{
                  width: "20px",
                  height: "20px",
                  "border-radius": "50%",
                  background: cursor.user.color,
                  border: "2px solid var(--color-text)",
                  "box-shadow": `0 0 8px ${cursor.user.color}, 0 2px 4px rgba(0,0,0,0.3)`,
                  animation: "pulse-cursor 1.5s ease-in-out infinite",
                }}
              />
            ) : (
              <svg
                width="16"
                height="20"
                viewBox="0 0 16 20"
                fill="none"
                style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }}
              >
                <path d="M0 0L16 12L8 12L4 20L0 0Z" fill={cursor.user.color} />
              </svg>
            )}
            <div
              style={{
                position: "absolute",
                left: cursor.isAI ? "24px" : "16px",
                top: cursor.isAI ? "2px" : "12px",
                background: cursor.user.color,
                color: "var(--color-text)",
                padding: "2px 8px",
                "border-radius": "4px",
                "font-size": "11px",
                "font-weight": "600",
                "white-space": "nowrap",
                "box-shadow": "0 1px 3px rgba(0,0,0,0.2)",
              }}
            >
              {cursor.isAI ? `AI: ${cursor.user.name}` : cursor.user.name}
            </div>
          </div>
        )}
      </For>
      <style>{`
        @keyframes pulse-cursor {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
