// @refresh reload
import { StartClient, mount } from "@solidjs/start/client";
import { registerServiceWorker } from "./lib/sw-register";

mount(() => <StartClient />, document.getElementById("app")!);

// Register service worker after hydration, deferred to avoid blocking main thread
if (typeof requestIdleCallback === "function") {
  requestIdleCallback(() => {
    registerServiceWorker({
      onUpdate: (_registration) => {
        // A new version is available — the app can prompt the user to refresh.
        // Use activateWaitingWorker(registration) to apply immediately.
        console.info("[SW] New version available. Refresh to update.");
      },
      onInstall: () => {
        console.info("[SW] App is now available offline.");
      },
    });
  });
} else {
  setTimeout(() => {
    registerServiceWorker({
      onUpdate: () => {
        console.info("[SW] New version available. Refresh to update.");
      },
      onInstall: () => {
        console.info("[SW] App is now available offline.");
      },
    });
  }, 1);
}
