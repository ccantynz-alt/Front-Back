// ── Optimistic Mutation Helper ────────────────────────────────────────
//
// `useOptimisticMutation` provides a generic optimistic-UI + 30-second
// undo pattern. The flow:
//
//   1. `apply()` runs immediately   — UI is mutated optimistically.
//   2. An undo toast is enqueued    — user sees what just happened.
//   3a. If the user clicks "Undo" inside the window  → `rollback()` runs,
//       `commit()` is never called, no server mutation occurs.
//   3b. If the timeout fires        → `commit()` runs against the server.
//       On commit failure we automatically `rollback()` and surface an
//       error toast so the UI returns to truth.
//
// Set `undoable` to `0` (or omit) to skip the undo window and commit
// immediately; rollback still fires on commit failure. This makes the
// helper safe for non-destructive flows that just want optimistic apply
// + auto-rollback on error.
//
// The helper is framework-agnostic apart from emitting events to the
// `UndoToast` component's pub/sub bus — see `components/UndoToast.tsx`.

import { enqueueUndo, dismissUndo } from "../components/UndoToast";
import { showToast } from "../components/Toast";

export interface OptimisticMutationOptions<TArg> {
  /** Mutate the local store/UI immediately. Required. */
  apply: (arg: TArg) => void | Promise<void>;
  /** Restore the local store/UI to its prior state. Required. */
  rollback: (arg: TArg) => void | Promise<void>;
  /** Persist the change to the server. Called once the undo window expires. */
  commit: (arg: TArg) => Promise<unknown>;
  /**
   * Undo window in milliseconds. `0` (the default) means commit fires
   * synchronously and the undo toast is suppressed. Typical usage: 30_000.
   */
  undoable?: number;
  /** Toast message. May be a string or a function of the argument. */
  message?: string | ((arg: TArg) => string);
  /** Error toast prefix when `commit` throws (default: "Failed to save"). */
  errorMessage?: string | ((arg: TArg, err: unknown) => string);
}

export interface OptimisticMutationResult<TArg> {
  /** Trigger the optimistic flow. Returns once `apply` has run. */
  (arg: TArg): Promise<void>;
}

/**
 * Build a function that wraps a destructive UI action in an optimistic
 * apply → wait-for-undo → commit (or rollback-on-undo / rollback-on-error)
 * pipeline. See module-level docstring for the lifecycle.
 */
export function useOptimisticMutation<TArg>(
  options: OptimisticMutationOptions<TArg>,
): OptimisticMutationResult<TArg> {
  const undoable = Math.max(0, options.undoable ?? 0);

  const resolveMessage = (arg: TArg): string => {
    if (typeof options.message === "function") return options.message(arg);
    return options.message ?? "Action completed";
  };

  const resolveError = (arg: TArg, err: unknown): string => {
    if (typeof options.errorMessage === "function") {
      return options.errorMessage(arg, err);
    }
    const base = options.errorMessage ?? "Failed to save change";
    const detail = err instanceof Error ? err.message : String(err);
    return detail && detail !== "Error" ? `${base}: ${detail}` : base;
  };

  const performCommit = async (arg: TArg): Promise<void> => {
    try {
      await options.commit(arg);
    } catch (err) {
      // Server rejected → reverse the optimistic update and notify.
      try {
        await options.rollback(arg);
      } catch {
        // Rollback itself failed — at this point the UI is in an
        // unknown state; we still surface the original error.
      }
      showToast(resolveError(arg, err), "error", 6_000);
    }
  };

  return async (arg: TArg) => {
    await options.apply(arg);

    if (undoable === 0) {
      await performCommit(arg);
      return;
    }

    let committed = false;
    const message = resolveMessage(arg);

    const toastId = enqueueUndo({
      message,
      durationMs: undoable,
      onUndo: () => {
        if (committed) return;
        committed = true;
        // Roll back the optimistic mutation; commit is never called.
        Promise.resolve(options.rollback(arg)).catch(() => {
          // Swallow — the UI was already optimistic; if rollback fails
          // there is no better state to fall back to.
        });
      },
      onTimeout: () => {
        if (committed) return;
        committed = true;
        void performCommit(arg);
      },
    });

    // Returned promise resolves immediately after `apply` so the caller
    // can keep navigating. Long-running commit work happens in the
    // background. `toastId` is exposed via the dismiss helper for tests.
    void toastId;
  };
}

/**
 * Programmatically dismiss an undo toast (useful in tests / route teardown).
 * Re-exported here so callers don't need to import `UndoToast` directly.
 */
export const dismissUndoToast = dismissUndo;
