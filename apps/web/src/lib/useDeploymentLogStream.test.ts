/**
 * Smoke tests for the BLK-009 deployment log stream hook.
 *
 * These drive the hook inside a `createRoot` so SolidJS reactivity works,
 * with a hand-rolled FakeEventSource so no real network IO happens. The
 * tests pin the two behaviours the deployments UI depends on:
 *
 *   1. Incoming `log` frames land in `lines()` in arrival order, with
 *      `stream` and `timestamp` preserved.
 *   2. `status` reflects the connection lifecycle (connecting → open →
 *      closed after an `end` frame), and `deployment().ended` flips true.
 *   3. Teardown (via `close()`) closes the EventSource so no background
 *      polling leaks into later tests.
 */

import { describe, expect, test } from "bun:test";
import { createRoot, createSignal } from "solid-js";
import { useDeploymentLogStream } from "./useDeploymentLogStream";

// ── Fake EventSource ───────────────────────────────────────────────

type Listener = (evt: MessageEvent) => void;

class FakeEventSource {
  static last: FakeEventSource | null = null;

  readonly url: string;
  readonly withCredentials = false;
  readonly CONNECTING = 0 as const;
  readonly OPEN = 1 as const;
  readonly CLOSED = 2 as const;
  readyState: number = 0;
  onopen: ((evt: Event) => void) | null = null;
  onerror: ((evt: Event) => void) | null = null;
  onmessage: ((evt: MessageEvent) => void) | null = null;

  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(url: string | URL) {
    this.url = typeof url === "string" ? url : url.toString();
    FakeEventSource.last = this;
  }

  addEventListener(type: string, cb: Listener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
  }

  removeEventListener(type: string, cb: Listener): void {
    this.listeners.get(type)?.delete(cb);
  }

  dispatchEvent(_evt: Event): boolean {
    return true;
  }

  close(): void {
    this.readyState = this.CLOSED;
  }

  // Test-only helpers — not part of the real EventSource API.
  emit(type: string, data: unknown): void {
    const cbs = this.listeners.get(type);
    if (!cbs) return;
    const evt = new MessageEvent(type, {
      data: typeof data === "string" ? data : JSON.stringify(data),
    });
    for (const cb of cbs) cb(evt);
  }

  emitOpen(): void {
    this.readyState = this.OPEN;
    const cbs = this.listeners.get("open");
    if (cbs) {
      const evt = new Event("open");
      for (const cb of cbs) cb(evt as MessageEvent);
    }
  }
}

// ── Tests ───────────────────────────────────────────────────────────

describe("useDeploymentLogStream", () => {
  test("stays idle with no deployment id", () => {
    createRoot((dispose) => {
      const [id] = createSignal<string | null>(null);
      const hook = useDeploymentLogStream(id, {
        apiUrl: "http://test.local",
        token: "tkn",
        eventSourceCtor: FakeEventSource as unknown as typeof EventSource,
      });
      expect(hook.status()).toBe("idle");
      expect(hook.lines()).toHaveLength(0);
      dispose();
    });
  });

  test("opens an EventSource against the expected URL when an id is supplied", () => {
    createRoot((dispose) => {
      const [id] = createSignal<string | null>("dpl-1");
      const hook = useDeploymentLogStream(id, {
        apiUrl: "http://test.local",
        token: "tkn",
        eventSourceCtor: FakeEventSource as unknown as typeof EventSource,
      });
      expect(FakeEventSource.last).not.toBeNull();
      expect(FakeEventSource.last!.url).toBe(
        "http://test.local/api/deployments/dpl-1/logs/stream?token=tkn",
      );
      expect(hook.status()).toBe("connecting");
      dispose();
    });
  });

  test("accumulates incoming log frames into lines()", () => {
    createRoot((dispose) => {
      const [id] = createSignal<string | null>("dpl-1");
      const hook = useDeploymentLogStream(id, {
        apiUrl: "http://test.local",
        token: "tkn",
        eventSourceCtor: FakeEventSource as unknown as typeof EventSource,
      });
      const es = FakeEventSource.last!;
      es.emitOpen();
      expect(hook.status()).toBe("open");

      es.emit("log", {
        id: "1",
        stream: "stdout",
        line: "Cloning repo",
        timestamp: "2026-04-18T12:00:00.000Z",
      });
      es.emit("log", {
        id: "2",
        stream: "stderr",
        line: "warning: something",
        timestamp: "2026-04-18T12:00:01.000Z",
      });

      const lines = hook.lines();
      expect(lines).toHaveLength(2);
      expect(lines[0]?.message).toBe("Cloning repo");
      expect(lines[0]?.stream).toBe("stdout");
      expect(lines[1]?.message).toBe("warning: something");
      expect(lines[1]?.stream).toBe("stderr");
      expect(lines[1]?.timestamp).toBe("2026-04-18T12:00:01.000Z");
      dispose();
    });
  });

  test("tracks deployment phase from status frames and closes on end", () => {
    createRoot((dispose) => {
      const [id] = createSignal<string | null>("dpl-1");
      const hook = useDeploymentLogStream(id, {
        apiUrl: "http://test.local",
        token: "tkn",
        eventSourceCtor: FakeEventSource as unknown as typeof EventSource,
      });
      const es = FakeEventSource.last!;
      es.emitOpen();
      es.emit("status", { status: "building" });
      expect(hook.deployment().phase).toBe("building");
      expect(hook.deployment().ended).toBe(false);

      es.emit("end", { status: "live" });
      expect(hook.deployment().phase).toBe("live");
      expect(hook.deployment().ended).toBe(true);
      expect(hook.status()).toBe("closed");
      expect(es.readyState).toBe(es.CLOSED);
      dispose();
    });
  });

  test("ignores malformed frames without crashing the stream", () => {
    createRoot((dispose) => {
      const [id] = createSignal<string | null>("dpl-1");
      const hook = useDeploymentLogStream(id, {
        apiUrl: "http://test.local",
        token: "tkn",
        eventSourceCtor: FakeEventSource as unknown as typeof EventSource,
      });
      const es = FakeEventSource.last!;
      es.emitOpen();
      es.emit("log", "{not valid json");
      es.emit("log", { line: "after-bad", stream: "stdout" });
      const lines = hook.lines();
      expect(lines).toHaveLength(1);
      expect(lines[0]?.message).toBe("after-bad");
      dispose();
    });
  });

  test("close() tears down the EventSource", () => {
    createRoot((dispose) => {
      const [id] = createSignal<string | null>("dpl-1");
      const hook = useDeploymentLogStream(id, {
        apiUrl: "http://test.local",
        token: "tkn",
        eventSourceCtor: FakeEventSource as unknown as typeof EventSource,
      });
      const es = FakeEventSource.last!;
      es.emitOpen();
      hook.close();
      expect(hook.status()).toBe("closed");
      expect(es.readyState).toBe(es.CLOSED);
      dispose();
    });
  });
});
