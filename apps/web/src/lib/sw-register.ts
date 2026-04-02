/**
 * Service Worker registration and lifecycle management.
 *
 * Handles install, update detection, and cleanup.
 * All browser API access is guarded for SSR safety.
 */

export type SWUpdateCallback = (registration: ServiceWorkerRegistration) => void;

interface RegisterOptions {
  /** Called when a new SW version is waiting to activate. */
  onUpdate?: SWUpdateCallback;
  /** Called when the SW is installed for the first time. */
  onInstall?: SWUpdateCallback;
}

/**
 * Register the service worker and listen for lifecycle events.
 *
 * Call this after hydration (ideally via requestIdleCallback) to avoid
 * blocking the main thread during initial load.
 */
export function registerServiceWorker(options: RegisterOptions = {}): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        // Freshly installed — no previous version
        if (registration.active && !navigator.serviceWorker.controller) {
          options.onInstall?.(registration);
        }

        // Listen for new SW versions
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;

          installing.addEventListener("statechange", () => {
            if (installing.state === "installed") {
              if (navigator.serviceWorker.controller) {
                // New version waiting — notify the app
                options.onUpdate?.(registration);
              } else {
                // First install complete
                options.onInstall?.(registration);
              }
            }
          });
        });

        // Check for updates periodically (every 60 seconds)
        setInterval(
          () => {
            registration.update();
          },
          60 * 1000,
        );
      })
      .catch((error) => {
        console.error("[SW] Registration failed:", error);
      });

    // Listen for messages from the service worker
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "PENDING_COUNT") {
        // Dispatch a custom event so stores can listen
        window.dispatchEvent(
          new CustomEvent("sw-pending-count", {
            detail: { count: event.data.count },
          }),
        );
      }
    });
  });
}

/**
 * Tell the waiting service worker to skip waiting and take over immediately.
 */
export function activateWaitingWorker(registration: ServiceWorkerRegistration): void {
  registration.waiting?.postMessage({ type: "SKIP_WAITING" });
}

/**
 * Unregister all service workers. Useful for development/debugging.
 */
export async function unregisterServiceWorker(): Promise<boolean> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return false;
  }

  const registration = await navigator.serviceWorker.getRegistration();
  if (registration) {
    return registration.unregister();
  }
  return false;
}

/**
 * Request the service worker to report its pending mutation count.
 */
export function requestPendingCount(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker.controller?.postMessage({ type: "GET_PENDING_COUNT" });
}

/**
 * Tell the service worker to retry queued mutations now.
 */
export function retryPendingMutations(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker.controller?.postMessage({ type: "RETRY_MUTATIONS" });
}
