// ── Collaboration Overlay ────────────────────────────────────────────
// Shows other users' cursors on the canvas and user avatars in the
// header. Uses the collab store for presence/cursor state.

import { type JSX, For, Show, createMemo } from "solid-js";
import type { UserAwareness } from "@cronix/collab";

// ── Types ────────────────────────────────────────────────────────────

interface CollabOverlayProps {
  peers: () => UserAwareness[];
  localUser: () => UserAwareness | undefined;
  connected: () => boolean;
}

// ── Remote Cursor ───────────────────────────────────────────────────

function RemoteCursor(props: { peer: UserAwareness }): JSX.Element {
  const cursor = createMemo(() => props.peer.cursor);
  const color = (): string => props.peer.color ?? "#6366f1";

  return (
    <Show when={cursor()}>
      {(pos) => (
        <div
          class="absolute pointer-events-none z-30 transition-all duration-100"
          style={{
            left: `${pos().x}px`,
            top: `${pos().y}px`,
          }}
        >
          {/* Cursor arrow */}
          <svg
            width="16"
            height="20"
            viewBox="0 0 16 20"
            fill="none"
            style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.2))" }}
          >
            <path
              d="M0 0L16 12L8 12L4 20L0 0Z"
              fill={color()}
            />
          </svg>
          {/* Name label */}
          <div
            class="absolute left-4 top-3 px-1.5 py-0.5 rounded text-[10px] font-medium text-white whitespace-nowrap"
            style={{ "background-color": color() }}
          >
            {props.peer.displayName}
            <Show when={props.peer.isAI}>
              <span class="ml-1 opacity-75">AI</span>
            </Show>
          </div>
        </div>
      )}
    </Show>
  );
}

// ── Canvas Overlay (cursors) ────────────────────────────────────────

export function CollabCursorsOverlay(props: CollabOverlayProps): JSX.Element {
  const remotePeers = createMemo((): UserAwareness[] => {
    const local = props.localUser();
    if (!local) return props.peers();
    return props.peers().filter((p) => p.userId !== local.userId);
  });

  return (
    <Show when={props.connected()}>
      <div class="absolute inset-0 pointer-events-none z-30 overflow-hidden">
        <For each={remotePeers()}>
          {(peer) => <RemoteCursor peer={peer} />}
        </For>
      </div>
    </Show>
  );
}

// ── Header Avatars ──────────────────────────────────────────────────

export function CollabAvatars(props: CollabOverlayProps): JSX.Element {
  const MAX_VISIBLE = 5;

  const allPeers = createMemo((): UserAwareness[] => props.peers());
  const visiblePeers = createMemo((): UserAwareness[] => allPeers().slice(0, MAX_VISIBLE));
  const overflowCount = createMemo((): number => Math.max(0, allPeers().length - MAX_VISIBLE));
  const aiPeers = createMemo((): UserAwareness[] => allPeers().filter((p) => p.isAI));

  return (
    <div class="flex items-center gap-1">
      {/* Connection indicator */}
      <div
        class={`w-2 h-2 rounded-full mr-1 ${
          props.connected() ? "bg-green-500" : "bg-gray-300"
        }`}
        title={props.connected() ? "Connected" : "Disconnected"}
      />

      {/* Avatar stack */}
      <div class="flex items-center -space-x-2">
        <For each={visiblePeers()}>
          {(peer) => (
            <div
              class="relative w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold text-white shrink-0"
              style={{ "background-color": peer.color ?? "#6366f1" }}
              title={`${peer.displayName}${peer.isAI ? " (AI)" : ""}`}
            >
              {peer.displayName.charAt(0).toUpperCase()}
              {/* AI indicator dot */}
              <Show when={peer.isAI}>
                <div class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-purple-500 border border-white flex items-center justify-center">
                  <svg class="w-2 h-2 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" />
                  </svg>
                </div>
              </Show>
            </div>
          )}
        </For>

        {/* Overflow */}
        <Show when={overflowCount() > 0}>
          <div class="w-7 h-7 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-[10px] font-medium text-gray-600 shrink-0">
            +{overflowCount()}
          </div>
        </Show>
      </div>

      {/* AI participant indicator */}
      <Show when={aiPeers().length > 0}>
        <div class="ml-1 flex items-center gap-0.5 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full text-[10px] font-medium">
          <svg class="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" />
          </svg>
          {aiPeers().length} AI
        </div>
      </Show>
    </div>
  );
}
