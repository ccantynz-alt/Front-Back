/**
 * Offline status store — signal-based reactive offline/online tracking.
 *
 * Provides:
 *   - `isOnline` signal: tracks navigator.onLine
 *   - `pendingActions` signal: count of queued offline mutations
 *   - `OfflineIndicator` component: renders a banner when offline
 *   - `useOffline()` hook: returns all offline state
 *
 * All browser API access is SSR-safe.
 */

import { type Component, type JSX, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { isServer } from "solid-js/web";

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

const [isOnline, setIsOnline] = createSignal<boolean>(isServer ? true : navigator.onLine);
const [pendingActions, setPendingActions] = createSignal<number>(0);

// ---------------------------------------------------------------------------
// Browser-side listeners (initialized once)
// ---------------------------------------------------------------------------

let listenersAttached = false;

function attachListeners(): void {
  if (isServer || listenersAttached) return;
  listenersAttached = true;

  const handleOnline = (): void => {
    setIsOnline(true);
    // Trigger retry of queued mutations
    navigator.serviceWorker?.controller?.postMessage({ type: "RETRY_MUTATIONS" });
  };
  const handleOffline = (): void => {
    setIsOnline(false);
  };

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  // Listen for pending-count messages from the SW
  window.addEventListener("sw-pending-count", ((event: CustomEvent<{ count: number }>) => {
    setPendingActions(event.detail.count);
  }) as EventListener);

  // Request initial pending count from SW
  navigator.serviceWorker?.controller?.postMessage({ type: "GET_PENDING_COUNT" });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface OfflineState {
  /** Whether the browser currently has network connectivity. */
  isOnline: () => boolean;
  /** Number of mutations queued for retry when back online. */
  pendingActions: () => number;
}

/**
 * Reactive offline state hook.
 *
 * Automatically attaches browser event listeners on first use.
 */
export function useOffline(): OfflineState {
  onMount(() => {
    attachListeners();
  });

  return { isOnline, pendingActions };
}

// ---------------------------------------------------------------------------
// OfflineIndicator Component
// ---------------------------------------------------------------------------

export interface OfflineIndicatorProps {
  /** Custom class name for the banner container. */
  class?: string;
}

/**
 * Renders a fixed banner at the top of the viewport when the user is offline.
 * Shows pending mutation count when there are queued actions.
 */
export const OfflineIndicator: Component<OfflineIndicatorProps> = (props): JSX.Element => {
  const { isOnline: online, pendingActions: pending } = useOffline();

  return (
    <>
      {!online() && (
        <div
          role="alert"
          aria-live="assertive"
          class={props.class}
          style={{
            position: "fixed",
            top: "0",
            left: "0",
            right: "0",
            "z-index": "9999",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            gap: "0.5rem",
            padding: "0.625rem 1rem",
            "background-color": "#dc2626",
            color: "#ffffff",
            "font-size": "0.875rem",
            "font-weight": "500",
            "font-family": "system-ui, -apple-system, sans-serif",
          }}
        >
          <span>You are offline.</span>
          {pending() > 0 && (
            <span>
              {pending()} pending {pending() === 1 ? "action" : "actions"} will sync when reconnected.
            </span>
          )}
        </div>
      )}
    </>
  );
};

// Re-export signals for direct access
export { isOnline, pendingActions };
