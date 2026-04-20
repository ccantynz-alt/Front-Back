// ── Undo Toast ────────────────────────────────────────────────────────
//
// Transient toast with a circular countdown ring + an "Undo" button.
// Used by `useOptimisticMutation` to give the user a 30-second window
// to reverse a destructive action before it commits to the server.
//
// Stacks if multiple fire in succession. Bottom-right of the viewport.
// Honours `prefers-reduced-motion`: when set, the ring renders the
// remaining time but does not animate.
//
// Accessibility: the live region is `role="status"` + `aria-live="polite"`.
// Each toast carries its own `aria-label` describing the pending action
// and the time remaining.

import { createSignal, For, onCleanup, Show } from "solid-js";
import type { JSX } from "solid-js";

export interface UndoToastDescriptor {
  /** Human-readable summary, e.g. "Deleted project-x". */
  message: string;
  /** How long to show the undo button (ms). Typically 30_000. */
  durationMs: number;
  /** Fires when the user clicks the Undo button. */
  onUndo: () => void;
  /** Fires when the timer expires without the user clicking Undo. */
  onTimeout: () => void;
}

interface UndoToast extends UndoToastDescriptor {
  id: number;
  /** Wall-clock time when the toast was enqueued (ms since epoch). */
  startedAt: number;
}

const [toasts, setToasts] = createSignal<UndoToast[]>([]);
const timers = new Map<number, ReturnType<typeof setTimeout>>();
let nextId = 1;

/**
 * Push a new undo toast onto the stack. Returns the id so callers can
 * programmatically dismiss it (rare — typically the toast manages itself).
 *
 * `setTimeout` is used unguarded — it exists in browsers, Node, and Bun
 * (this code never runs at SSR module-evaluation time, only in response
 * to user actions, so leaking timers on the server is a non-issue).
 */
export function enqueueUndo(desc: UndoToastDescriptor): number {
  const id = nextId++;
  const toast: UndoToast = { ...desc, id, startedAt: Date.now() };
  setToasts((prev) => [...prev, toast]);

  const handle: ReturnType<typeof setTimeout> = setTimeout(() => {
    timers.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
    try {
      desc.onTimeout();
    } catch {
      // Caller-side errors must not crash the toast pipeline.
    }
  }, desc.durationMs);
  timers.set(id, handle);
  return id;
}

/** Programmatically dismiss a pending toast (does not fire onTimeout). */
export function dismissUndo(id: number): void {
  const handle = timers.get(id);
  if (handle !== undefined) {
    clearTimeout(handle);
    timers.delete(id);
  }
  setToasts((prev) => prev.filter((t) => t.id !== id));
}

/** Test-only: drain the queue between specs. */
export function _resetUndoToasts(): void {
  for (const handle of timers.values()) clearTimeout(handle);
  timers.clear();
  setToasts([]);
}

// ── Internal ring tick (drives the SVG dasharray) ─────────────────────

function useNow(intervalMs: number): () => number {
  const [now, setNow] = createSignal(Date.now());
  if (typeof window !== "undefined") {
    const handle: ReturnType<typeof setInterval> = setInterval(
      () => setNow(Date.now()),
      intervalMs,
    );
    onCleanup(() => clearInterval(handle));
  }
  return now;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// ── Container ─────────────────────────────────────────────────────────

export function UndoToastContainer(): JSX.Element {
  const reduced = prefersReducedMotion();
  // 100ms tick is fast enough for a smooth ring without burning CPU.
  // When reduced motion is set we slow the tick to 1s — the ring becomes
  // a discrete countdown rather than an animation.
  const now = useNow(reduced ? 1_000 : 100);

  onCleanup(() => {
    for (const handle of timers.values()) clearTimeout(handle);
    timers.clear();
  });

  return (
    <div
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        "z-index": "9998",
        display: "flex",
        "flex-direction": "column-reverse",
        gap: "8px",
        "max-width": "360px",
        "pointer-events": "none",
      }}
      role="status"
      aria-live="polite"
      data-testid="undo-toast-container"
    >
      <For each={toasts()}>
        {(toast) => {
          const elapsed = (): number => Math.min(toast.durationMs, now() - toast.startedAt);
          const remainingMs = (): number => Math.max(0, toast.durationMs - elapsed());
          const remainingSeconds = (): number => Math.ceil(remainingMs() / 1_000);
          const progress = (): number => 1 - elapsed() / toast.durationMs;

          const handleUndo = (): void => {
            // Stop the timer & remove the toast first, then run the
            // caller's undo handler. This guarantees the user can't
            // double-click into a race with the timeout.
            dismissUndo(toast.id);
            try {
              toast.onUndo();
            } catch {
              // Caller errors must not break the UI.
            }
          };

          return (
            <div
              data-testid="undo-toast"
              aria-label={`${toast.message}. Undo available for ${remainingSeconds()} seconds.`}
              style={{
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
                padding: "10px 14px",
                "border-radius": "10px",
                "backdrop-filter": "blur(12px)",
                "box-shadow": "0 8px 24px rgba(0,0,0,0.35)",
                display: "flex",
                "align-items": "center",
                gap: "12px",
                "pointer-events": "auto",
                "font-size": "13px",
                "font-weight": "500",
                "min-width": "260px",
              }}
            >
              <CountdownRing progress={progress()} seconds={remainingSeconds()} reduced={reduced} />
              <span style={{ flex: "1", "line-height": "1.4" }}>{toast.message}</span>
              <button
                type="button"
                onClick={handleUndo}
                aria-label={`Undo: ${toast.message}`}
                style={{
                  background: "var(--color-primary)",
                  color: "var(--color-text)",
                  border: "none",
                  "border-radius": "6px",
                  padding: "6px 12px",
                  cursor: "pointer",
                  "font-size": "12px",
                  "font-weight": "600",
                  "letter-spacing": "0.02em",
                }}
              >
                Undo
              </button>
            </div>
          );
        }}
      </For>
    </div>
  );
}

// ── Countdown Ring ────────────────────────────────────────────────────

interface CountdownRingProps {
  progress: number; // 1 → 0 over the lifetime
  seconds: number;
  reduced: boolean;
}

function CountdownRing(props: CountdownRingProps): JSX.Element {
  const size = 28;
  const stroke = 2.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = (): number => circumference * (1 - props.progress);

  return (
    <div
      style={{
        position: "relative",
        width: `${size}px`,
        height: `${size}px`,
        "flex-shrink": "0",
      }}
      aria-hidden="true"
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          stroke-width={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-primary)"
          stroke-width={stroke}
          stroke-linecap="round"
          stroke-dasharray={String(circumference)}
          stroke-dashoffset={String(dashOffset())}
          style={{
            transform: `rotate(-90deg)`,
            "transform-origin": "center",
            transition: props.reduced ? "none" : "stroke-dashoffset 100ms linear",
          }}
        />
      </svg>
      <Show when={props.seconds > 0}>
        <span
          style={{
            position: "absolute",
            inset: "0",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            "font-size": "10px",
            "font-weight": "600",
            color: "var(--color-text-muted)",
            "font-variant-numeric": "tabular-nums",
          }}
        >
          {props.seconds}
        </span>
      </Show>
    </div>
  );
}

export default UndoToastContainer;
