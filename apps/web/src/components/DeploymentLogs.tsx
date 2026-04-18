import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import type { JSX } from "solid-js";
import { Button } from "@back-to-the-future/ui";
import { useDeploymentLogStream } from "../lib/useDeploymentLogStream";

// ── Types ────────────────────────────────────────────────────────────
//
// Terminal-style log viewer for deployment builds. Renders each log line
// with monospace font, auto-scrolls to the bottom as new lines arrive,
// and colours stderr red while stdout stays neutral.
//
// Two input modes:
//   - Live mode (preferred): pass `live={true}` and the component opens
//     an SSE stream to /api/deployments/:id/logs/stream via the
//     `useDeploymentLogStream` hook. Lines stream in as the build runs.
//   - Static mode: pass a `lines` array and the component just renders
//     it (used in storybook / empty-state fixtures / the placeholder UI).

export type LogStream = "stdout" | "stderr";

export interface DeploymentLogLine {
  readonly timestamp: string; // ISO 8601
  readonly stream: LogStream;
  readonly message: string;
}

export interface DeploymentLogsProps {
  readonly deploymentId: string;
  /** Static lines — used when `live` is false/undefined. */
  readonly lines?: ReadonlyArray<DeploymentLogLine>;
  /** When true, open an SSE stream and render live log rows instead of `lines`. */
  readonly live?: boolean;
  readonly streaming?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const hh = d.getHours().toString().padStart(2, "0");
    const mm = d.getMinutes().toString().padStart(2, "0");
    const ss = d.getSeconds().toString().padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  } catch {
    return iso;
  }
}

function toPlainText(lines: ReadonlyArray<DeploymentLogLine>): string {
  return lines
    .map((l) => `[${formatTimestamp(l.timestamp)}] ${l.stream === "stderr" ? "ERR " : "OUT "}${l.message}`)
    .join("\n");
}

// ── Component ────────────────────────────────────────────────────────

export function DeploymentLogs(props: DeploymentLogsProps): JSX.Element {
  const [autoScroll, setAutoScroll] = createSignal<boolean>(true);
  let containerRef: HTMLDivElement | undefined;

  // Live stream mode — opens an EventSource via the hook and renders the
  // accumulated lines. When `live` is false the hook receives a null id
  // so no connection is ever opened.
  const liveStream = useDeploymentLogStream(
    () => (props.live === true ? props.deploymentId : null),
  );

  const effectiveLines = createMemo<ReadonlyArray<DeploymentLogLine>>(() =>
    props.live === true ? liveStream.lines() : props.lines ?? [],
  );

  const effectiveStreaming = createMemo<boolean>(() => {
    if (props.live === true) {
      const s = liveStream.status();
      const ended = liveStream.deployment().ended;
      return !ended && (s === "connecting" || s === "open" || s === "reconnecting");
    }
    return props.streaming === true;
  });

  // Auto-scroll whenever the line count changes — but only when the user
  // has not deliberately scrolled up to inspect earlier output.
  createEffect(() => {
    // Track reactivity on the line count.
    const count = effectiveLines().length;
    if (!containerRef) return;
    if (!autoScroll()) return;
    // Defer to the next frame so the DOM has painted the new lines first.
    requestAnimationFrame(() => {
      if (!containerRef) return;
      containerRef.scrollTop = containerRef.scrollHeight;
    });
    // reference `count` so this is reactive
    void count;
  });

  function handleScroll(e: Event): void {
    const target = e.currentTarget as HTMLDivElement;
    const atBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 40;
    setAutoScroll(atBottom);
  }

  function handleDownload(): void {
    if (typeof window === "undefined") return;
    const text = toPlainText(effectiveLines());
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deployment-${props.deploymentId}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleJumpToBottom(): void {
    if (!containerRef) return;
    containerRef.scrollTop = containerRef.scrollHeight;
    setAutoScroll(true);
  }

  onCleanup(() => {
    // Belt-and-braces: the hook owns its own onCleanup, but calling close
    // explicitly here makes the teardown order deterministic and keeps
    // the test fixtures from leaking into one another.
    try {
      liveStream.close();
    } catch {
      // already closed
    }
  });

  return (
    <div
      class="rounded-xl overflow-hidden"
      style={{
        background: "#0a0a0a",
        border: "1px solid var(--color-border)",
      }}
    >
      {/* Toolbar */}
      <div
        class="flex items-center justify-between px-4 py-2"
        style={{
          background: "var(--color-bg-elevated)",
          "border-bottom": "1px solid var(--color-border)",
        }}
      >
        <div class="flex items-center gap-2">
          <span
            class="h-2 w-2 rounded-full"
            classList={{
              "animate-pulse": effectiveStreaming(),
            }}
            style={{
              background: effectiveStreaming() ? "#60a5fa" : "var(--color-text-faint)",
              "box-shadow": effectiveStreaming() ? "0 0 8px rgba(96,165,250,0.6)" : "none",
            }}
            aria-hidden="true"
          />
          <span
            class="text-xs font-mono uppercase tracking-widest"
            style={{ color: "var(--color-text-muted)" }}
          >
            {effectiveStreaming() ? "Streaming logs" : "Build log"}
          </span>
          <span class="text-xs font-mono" style={{ color: "var(--color-text-faint)" }}>
            · {effectiveLines().length} line{effectiveLines().length === 1 ? "" : "s"}
          </span>
        </div>
        <div class="flex items-center gap-2">
          <Show when={!autoScroll()}>
            <Button variant="ghost" size="sm" onClick={handleJumpToBottom}>
              Jump to bottom
            </Button>
          </Show>
          <Button variant="outline" size="sm" onClick={handleDownload}>
            Download logs
          </Button>
        </div>
      </div>

      {/* Log viewport */}
      <div
        ref={containerRef}
        class="deployment-logs-viewport overflow-y-auto overflow-x-auto"
        style={{
          "max-height": "420px",
          "min-height": "200px",
          "font-family":
            "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'SF Mono', Menlo, Monaco, 'Courier New', monospace",
          "font-size": "12.5px",
          "line-height": "1.55",
          padding: "12px 16px",
          background: "#0a0a0a",
          color: "#e5e7eb",
        }}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={`Deployment ${props.deploymentId} logs`}
      >
        <Show
          when={effectiveLines().length > 0}
          fallback={
            <div
              class="flex h-full min-h-[160px] items-center justify-center text-center text-xs"
              style={{ color: "var(--color-text-faint)" }}
            >
              Waiting for build output...
            </div>
          }
        >
          <For each={effectiveLines()}>
            {(line) => (
              <div class="whitespace-pre-wrap break-all">
                <span style={{ color: "#6b7280" }}>
                  [{formatTimestamp(line.timestamp)}]
                </span>{" "}
                <span
                  style={{
                    color: line.stream === "stderr" ? "#f87171" : "#e5e7eb",
                  }}
                >
                  {line.message}
                </span>
              </div>
            )}
          </For>
        </Show>
      </div>

      <style>{`
        .deployment-logs-viewport::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .deployment-logs-viewport::-webkit-scrollbar-track {
          background: transparent;
        }
        .deployment-logs-viewport::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.12);
          border-radius: 4px;
        }
        .deployment-logs-viewport::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.22);
        }
      `}</style>
    </div>
  );
}
