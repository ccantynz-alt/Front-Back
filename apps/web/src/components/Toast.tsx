// ── Toast Notification System ─────────────────────────────────────────
// Global toast notifications with success/error/info/warning variants.
// Use showToast() from anywhere to give user feedback.
//
// The "undo" variant is a thin convenience that delegates to the
// dedicated UndoToast queue (see ./UndoToast.tsx). It exists so the
// rest of the codebase can call a single `showToast(... , "undo")`
// API for undoable destructive actions without importing two modules.

import { createSignal, For, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import { enqueueUndo, type UndoToastDescriptor } from "./UndoToast";

export type ToastVariant = "success" | "error" | "info" | "warning" | "undo";

export interface Toast {
  id: number;
  message: string;
  variant: Exclude<ToastVariant, "undo">;
  duration: number;
}

const [toasts, setToasts] = createSignal<Toast[]>([]);
let nextId = 1;

export function showToast(
  message: string,
  variant: ToastVariant = "info",
  duration = 4000,
): void {
  if (typeof window === "undefined") return;
  if (variant === "undo") {
    // Callers that want full undo semantics should use
    // `useOptimisticMutation` directly; this convenience path keeps
    // the API uniform when the caller only needs a no-op undo button
    // (e.g. surfacing a cosmetic "Undo" affordance from legacy code).
    showUndoToast({
      message,
      durationMs: duration > 0 ? duration : 30_000,
      onUndo: () => undefined,
      onTimeout: () => undefined,
    });
    return;
  }
  const id = nextId++;
  const toast: Toast = { id, message, variant, duration };
  setToasts((prev) => [...prev, toast]);
  if (duration > 0) {
    window.setTimeout(() => dismissToast(id), duration);
  }
}

/** Push a toast onto the undo queue. Thin re-export of `enqueueUndo`. */
export function showUndoToast(desc: UndoToastDescriptor): number {
  return enqueueUndo(desc);
}

export function dismissToast(id: number): void {
  setToasts((prev) => prev.filter((t) => t.id !== id));
}

const variantStyles: Record<Exclude<ToastVariant, "undo">, { bg: string; border: string; color: string; icon: string }> = {
  success: { bg: "rgba(34, 197, 94, 0.15)", border: "rgba(34, 197, 94, 0.5)", color: "var(--color-success)", icon: "✓" },
  error: { bg: "rgba(239, 68, 68, 0.15)", border: "rgba(239, 68, 68, 0.5)", color: "var(--color-danger)", icon: "✕" },
  info: { bg: "rgba(59, 130, 246, 0.15)", border: "rgba(59, 130, 246, 0.5)", color: "var(--color-primary)", icon: "ℹ" },
  warning: { bg: "rgba(245, 158, 11, 0.15)", border: "rgba(245, 158, 11, 0.5)", color: "var(--color-warning)", icon: "⚠" },
};

export function ToastContainer(): JSX.Element {
  onCleanup(() => setToasts([]));
  return (
    <div
      style={{
        position: "fixed",
        top: "20px",
        right: "20px",
        "z-index": "9999",
        display: "flex",
        "flex-direction": "column",
        gap: "8px",
        "max-width": "380px",
        "pointer-events": "none",
      }}
      role="status"
      aria-live="polite"
    >
      <For each={toasts()}>
        {(toast) => {
          const style = variantStyles[toast.variant];
          return (
            <div
              style={{
                background: style.bg,
                border: `1px solid ${style.border}`,
                color: style.color,
                padding: "12px 16px",
                "border-radius": "8px",
                "backdrop-filter": "blur(12px)",
                "box-shadow": "0 8px 24px rgba(0,0,0,0.25)",
                display: "flex",
                "align-items": "flex-start",
                gap: "10px",
                "pointer-events": "auto",
                "animation": "toast-slide-in 0.2s ease-out",
                "font-size": "14px",
                "font-weight": "500",
              }}
            >
              <span style={{ "font-size": "16px", "line-height": "1.4" }}>{style.icon}</span>
              <span style={{ flex: "1", "line-height": "1.4" }}>{toast.message}</span>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss notification"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "inherit",
                  cursor: "pointer",
                  "font-size": "16px",
                  padding: "0 4px",
                  opacity: "0.7",
                }}
              >
                ×
              </button>
            </div>
          );
        }}
      </For>
      <style>{`
        @keyframes toast-slide-in {
          from { transform: translateX(20px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
