import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

/**
 * Live Updates SSE channel — lightweight server-push for data changes.
 *
 * When a tRPC mutation changes data (projects, settings, deployments, etc.),
 * it calls `emitDataChange("projects")`. All connected SSE clients receive
 * the event and invalidate their local cache for that key.
 *
 * This is NOT the collaboration/room system — this is a global "data changed"
 * notification channel. One connection per browser tab, watching all keys.
 */

// ── Server-side event emitter ──────────────────────────────────────

interface Subscriber {
  writer: WritableStreamDefaultWriter<string>;
  controller: AbortController;
}

const subscribers = new Set<Subscriber>();

/**
 * Emit a data change event to all connected SSE clients.
 * Call this from tRPC procedures after successful mutations.
 *
 * @param keys - Cache key(s) that changed (e.g. "projects", "settings", "chat")
 * @param detail - Optional context about what changed
 */
export function emitDataChange(keys: string | string[], detail?: string): void {
  const keyArray = Array.isArray(keys) ? keys : [keys];
  const payload = JSON.stringify({
    type: "data_changed",
    keys: keyArray,
    detail: detail ?? null,
    timestamp: new Date().toISOString(),
  });

  const dead: Subscriber[] = [];
  for (const sub of subscribers) {
    try {
      void sub.writer.write(`event: data_changed\ndata: ${payload}\nid: ${Date.now()}\n\n`);
    } catch {
      dead.push(sub);
    }
  }
  // Clean up dead connections
  for (const sub of dead) {
    subscribers.delete(sub);
    try { sub.controller.abort(); } catch { /* already closed */ }
  }
}

/** Get count of active SSE subscribers (for monitoring). */
export function getLiveUpdateSubscriberCount(): number {
  return subscribers.size;
}

// ── SSE endpoint ───────────────────────────────────────────────────

const liveUpdatesApp = new Hono();

liveUpdatesApp.get("/live-updates", async (c) => {
  return streamSSE(
    c,
    async (stream) => {
      const { readable, writable } = new TransformStream<string, string>();
      const writer = writable.getWriter();
      const controller = new AbortController();
      const sub: Subscriber = { writer, controller };

      subscribers.add(sub);

      // Send initial connected event
      await stream.writeSSE({
        event: "connected",
        data: JSON.stringify({
          type: "connected",
          subscriberCount: subscribers.size,
          timestamp: new Date().toISOString(),
        }),
        id: String(Date.now()),
      });

      // Keep-alive every 20 seconds
      const keepAlive = setInterval(async () => {
        try {
          await stream.writeSSE({
            event: "keepalive",
            data: JSON.stringify({ type: "keepalive" }),
            id: String(Date.now()),
          });
        } catch {
          clearInterval(keepAlive);
        }
      }, 20_000);

      // Forward events from emitDataChange -> SSE stream
      const reader = readable.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await stream.write(value);
        }
      } catch {
        // Client disconnected
      } finally {
        clearInterval(keepAlive);
        subscribers.delete(sub);
        reader.releaseLock();
        try { await writer.close(); } catch { /* already closed */ }
      }
    },
    async (_error, stream) => {
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({ type: "error", message: "Stream error" }),
        id: String(Date.now()),
      });
    },
  );
});

/** GET /live-updates/status — monitoring endpoint */
liveUpdatesApp.get("/live-updates/status", (c) => {
  return c.json({
    subscribers: subscribers.size,
    timestamp: new Date().toISOString(),
  });
});

export { liveUpdatesApp };
