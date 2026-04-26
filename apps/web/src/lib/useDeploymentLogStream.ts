// ── BLK-009 Deployment Log Stream Hook ──────────────────────────────
// SolidJS composable that opens an SSE connection to the API's
// `/api/deployments/:id/logs/stream` endpoint and accumulates every
// incoming log line into a signal. Handles reconnection with jittered
// exponential backoff when the network drops and tears the socket down
// cleanly on unmount (or when the deployment reaches a terminal state).
//
// Usage:
//   const logs = useDeploymentLogStream(() => deploymentId());
//   <For each={logs.lines()}>{(line) => <LogRow line={line} />}</For>

import {
  createRenderEffect,
  createSignal,
  onCleanup,
  type Accessor,
} from "solid-js";
import type { DeploymentLogLine } from "../components/DeploymentLogs";

// ── Types ────────────────────────────────────────────────────────────

export type LogStreamStatus =
  | "idle"
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed"
  | "error";

export interface DeploymentStreamStatus {
  /** Current deployment status reported by the server. */
  readonly phase: string | null;
  /** Whether the server has signalled the stream is done. */
  readonly ended: boolean;
}

export interface UseDeploymentLogStream {
  readonly lines: Accessor<ReadonlyArray<DeploymentLogLine>>;
  readonly status: Accessor<LogStreamStatus>;
  readonly deployment: Accessor<DeploymentStreamStatus>;
  /** Force-close the stream — useful when the UI dismisses the panel. */
  readonly close: () => void;
}

export interface UseDeploymentLogStreamOptions {
  /** Base API URL override — defaults to the same resolver as `trpc.ts`. */
  readonly apiUrl?: string;
  /** Session token override — defaults to localStorage lookup. */
  readonly token?: string | null;
  /**
   * EventSource constructor override — injected for unit tests.
   *
   * Default: `globalThis.EventSource` when the runtime provides it.
   */
  readonly eventSourceCtor?: typeof EventSource;
}

// ── Defaults ────────────────────────────────────────────────────────

const SESSION_TOKEN_KEY = "btf_session_token";
const MAX_LINES = 5_000; // Hard cap on buffered lines to protect memory.
const BASE_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;

function defaultApiUrl(): string {
  if (typeof window === "undefined") return "http://localhost:3001";
  const { protocol, hostname } = window.location;
  if (hostname === "crontech.ai" || hostname === "www.crontech.ai") {
    return "https://api.crontech.ai";
  }
  if (hostname.endsWith(".pages.dev")) {
    return `${protocol}//${hostname}`;
  }
  return "http://localhost:3001";
}

function defaultToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

function resolveEventSource(
  override?: typeof EventSource,
): typeof EventSource | null {
  if (override) return override;
  if (typeof EventSource !== "undefined") return EventSource;
  return null;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function useDeploymentLogStream(
  deploymentIdAccessor: Accessor<string | null | undefined>,
  options?: UseDeploymentLogStreamOptions,
): UseDeploymentLogStream {
  const [lines, setLines] = createSignal<ReadonlyArray<DeploymentLogLine>>([]);
  const [status, setStatus] = createSignal<LogStreamStatus>("idle");
  const [deployment, setDeployment] = createSignal<DeploymentStreamStatus>({
    phase: null,
    ended: false,
  });

  let source: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = BASE_RECONNECT_MS;
  let manualClose = false;

  const EventSourceCtor = resolveEventSource(options?.eventSourceCtor);

  function teardown(): void {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (source) {
      try {
        source.close();
      } catch {
        // already closed
      }
      source = null;
    }
  }

  function scheduleReconnect(id: string): void {
    if (manualClose) return;
    setStatus("reconnecting");
    if (reconnectTimer !== null) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect(id);
    }, reconnectDelay);
    reconnectDelay = Math.min(
      reconnectDelay * 2 + (crypto.getRandomValues(new Uint32Array(1))[0]! % 500),
      MAX_RECONNECT_MS,
    );
  }

  function appendLine(line: DeploymentLogLine): void {
    setLines((prev) => {
      const next = prev.length >= MAX_LINES
        ? prev.slice(prev.length - MAX_LINES + 1)
        : prev.slice();
      next.push(line);
      return next;
    });
  }

  function connect(id: string): void {
    teardown();
    if (!EventSourceCtor) {
      // SSR or unsupported runtime — stay idle instead of throwing.
      setStatus("idle");
      return;
    }
    const baseUrl = options?.apiUrl ?? defaultApiUrl();
    const token = options?.token ?? defaultToken();
    const url = token
      ? `${baseUrl}/api/deployments/${id}/logs/stream?token=${encodeURIComponent(token)}`
      : `${baseUrl}/api/deployments/${id}/logs/stream`;

    setStatus("connecting");
    const es = new EventSourceCtor(url);
    source = es;

    es.addEventListener("open", () => {
      // Reset the backoff window on every healthy (re)connection.
      reconnectDelay = BASE_RECONNECT_MS;
      setStatus("open");
    });

    es.addEventListener("log", (ev: MessageEvent) => {
      try {
        const payload = JSON.parse(ev.data as string) as {
          id?: string;
          stream?: "stdout" | "stderr" | "event";
          line?: string;
          timestamp?: string;
        };
        if (typeof payload.line !== "string") return;
        const stream =
          payload.stream === "stderr"
            ? "stderr"
            : payload.stream === "event"
              ? "stdout"
              : "stdout";
        appendLine({
          timestamp: payload.timestamp ?? new Date().toISOString(),
          stream,
          message: payload.line,
        });
      } catch {
        // Ignore malformed frames.
      }
    });

    es.addEventListener("status", (ev: MessageEvent) => {
      try {
        const payload = JSON.parse(ev.data as string) as { status?: string };
        if (typeof payload.status === "string") {
          setDeployment((prev) => ({ ...prev, phase: payload.status ?? null }));
        }
      } catch {
        // Ignore malformed frames.
      }
    });

    es.addEventListener("end", (ev: MessageEvent) => {
      try {
        const payload = JSON.parse(ev.data as string) as { status?: string };
        setDeployment({
          phase: typeof payload.status === "string" ? payload.status : null,
          ended: true,
        });
      } catch {
        setDeployment((prev) => ({ ...prev, ended: true }));
      }
      manualClose = true;
      teardown();
      setStatus("closed");
    });

    es.addEventListener("error", () => {
      // Terminal close after an explicit `end` frame: stay closed.
      if (deployment().ended || manualClose) {
        setStatus("closed");
        teardown();
        return;
      }
      setStatus("error");
      teardown();
      scheduleReconnect(id);
    });
  }

  // React to deploymentId changes — reset everything and reconnect.
  // `createRenderEffect` runs synchronously on the first pass, which
  // makes the hook immediately open its EventSource (important for
  // tests that introspect `FakeEventSource.last` right after setup).
  createRenderEffect(() => {
    const id = deploymentIdAccessor();
    manualClose = false;
    reconnectDelay = BASE_RECONNECT_MS;
    setLines([]);
    setDeployment({ phase: null, ended: false });
    if (!id) {
      teardown();
      setStatus("idle");
      return;
    }
    connect(id);
  });

  onCleanup(() => {
    manualClose = true;
    teardown();
  });

  function close(): void {
    manualClose = true;
    teardown();
    setStatus("closed");
  }

  return {
    lines,
    status,
    deployment,
    close,
  };
}
