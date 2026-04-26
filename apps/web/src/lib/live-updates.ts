// ── Live Updates Client ─────────────────────────────────────────────
// Connects to the API's SSE live-update channel and triggers automatic
// cache invalidation when data changes on the server.
//
// Usage (call once at app startup):
//   import { connectLiveUpdates } from "~/lib/live-updates";
//   connectLiveUpdates();
//
// The connection auto-reconnects on failure with exponential backoff.

import { invalidateQueries, invalidateAll } from "./use-trpc";

let eventSource: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1_000; // Start at 1s, max 30s
const MAX_RECONNECT_DELAY = 30_000;

function getApiUrl(): string {
  const meta = import.meta as unknown as Record<string, Record<string, string> | undefined>;
  const envUrl = meta.env?.VITE_PUBLIC_API_URL;
  if (envUrl) return envUrl;

  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    if (hostname === "crontech.ai" || hostname === "www.crontech.ai") {
      return "https://api.crontech.ai";
    }
    if (hostname.endsWith(".pages.dev")) {
      return `${protocol}//${hostname}`;
    }
  }
  return "http://localhost:3001";
}

function handleMessage(event: MessageEvent): void {
  try {
    const data = JSON.parse(event.data as string) as {
      type: string;
      keys?: string[];
    };

    if (data.type === "data_changed" && data.keys?.length) {
      invalidateQueries(...data.keys);
    } else if (data.type === "full_invalidation") {
      invalidateAll();
    }
  } catch {
    // Malformed event — ignore
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectLiveUpdates();
  }, reconnectDelay);
  // Exponential backoff with jitter
  reconnectDelay = Math.min(reconnectDelay * 2 + (crypto.getRandomValues(new Uint32Array(1))[0]! % 500), MAX_RECONNECT_DELAY);
}

/** Connect to the live updates SSE channel. Safe to call multiple times. */
export function connectLiveUpdates(): void {
  // SSR guard
  if (typeof window === "undefined" || typeof EventSource === "undefined") return;

  // Already connected
  if (eventSource?.readyState === EventSource.OPEN || eventSource?.readyState === EventSource.CONNECTING) {
    return;
  }

  const url = `${getApiUrl()}/api/live-updates`;
  eventSource = new EventSource(url);

  eventSource.addEventListener("data_changed", handleMessage);

  eventSource.addEventListener("connected", () => {
    // Reset backoff on successful connection
    reconnectDelay = 1_000;
  });

  eventSource.onerror = () => {
    eventSource?.close();
    eventSource = null;
    scheduleReconnect();
  };
}

/** Disconnect from the live updates channel. */
export function disconnectLiveUpdates(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

/** Check if the live updates channel is connected. */
export function isLiveUpdatesConnected(): boolean {
  return eventSource?.readyState === EventSource.OPEN;
}
