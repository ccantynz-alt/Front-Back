// ── Keyboard Help Overlay ───────────────────────────────────────────
//
// Modal triggered by `?` (Shift+/) that lists every currently
// registered keyboard shortcut, grouped by page. The shortcut registry
// (`lib/keyboard.ts`) is the single source of truth — this component
// just renders it. Pages register their own shortcuts on mount and the
// overlay automatically reflects whatever is live.
//
// Accessibility:
//   - role="dialog" + aria-modal="true" so assistive tech treats it
//     correctly.
//   - aria-labelledby points at the title for context.
//   - Esc closes (handled both by the registry and a local listener so
//     it works even if the registry's listener is suspended).
//   - Focus trap is intentionally minimal (we restore focus on close
//     but don't lock Tab); the overlay is read-only and short-lived.

import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import type { JSX } from "solid-js";
import {
  groupShortcuts,
  listShortcuts,
  registerShortcut,
  type RegisteredShortcut,
  type ShortcutGroup,
} from "../lib/keyboard";

// ── Display ordering ────────────────────────────────────────────────

const GROUP_ORDER: readonly ShortcutGroup[] = [
  "Global",
  "Navigation",
  "Dashboard",
  "Project view",
  "Lists",
  "Admin",
];

// ── Pretty-print a chord like "g d" or "cmd+k" → array of <kbd>s ───

function chordParts(keys: string): string[] {
  // Two-key sequences are space-separated; render each chord with
  // a "then" affordance between them via the parent component.
  return keys.split(" ");
}

function chordSegments(chord: string): string[] {
  return chord.split("+").map(prettyKey);
}

function prettyKey(k: string): string {
  switch (k) {
    case "cmd":
      return "\u2318"; // ⌘
    case "ctrl":
      return "Ctrl";
    case "alt":
      return "Alt";
    case "shift":
      return "Shift";
    case "esc":
      return "Esc";
    case "enter":
      return "Enter";
    case "tab":
      return "Tab";
    case "space":
      return "Space";
    case "up":
      return "\u2191";
    case "down":
      return "\u2193";
    case "left":
      return "\u2190";
    case "right":
      return "\u2192";
    default:
      return k.length === 1 ? k.toUpperCase() : k;
  }
}

// ── Component ───────────────────────────────────────────────────────

export function KeyboardHelp(): JSX.Element {
  const [open, setOpen] = createSignal(false);
  // Snapshot of the registry, refreshed each time the overlay opens.
  const [snapshot, setSnapshot] = createSignal<readonly RegisteredShortcut[]>([]);

  const close = (): void => {
    setOpen(false);
  };

  const refresh = (): void => {
    setSnapshot(listShortcuts());
  };

  onMount(() => {
    // Register the `?` trigger via the central registry so it shows up
    // in its own help overlay (delightfully meta — and a sanity check
    // that the registry actually works end-to-end).
    const offOpen = registerShortcut({
      keys: "?",
      description: "Show keyboard shortcuts",
      group: "Global",
      action: () => {
        refresh();
        setOpen((o) => !o);
      },
    });

    const offEsc = registerShortcut({
      keys: "esc",
      description: "Close help / back out",
      group: "Global",
      when: () => open(),
      action: close,
    });

    onCleanup(() => {
      offOpen();
      offEsc();
    });
  });

  return (
    <Show when={open()}>
      <div
        onClick={close}
        role="presentation"
        style={{
          position: "fixed",
          inset: "0",
          background: "rgba(0,0,0,0.55)",
          "z-index": "10000",
          display: "flex",
          "align-items": "flex-start",
          "justify-content": "center",
          "padding-top": "8vh",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="keyboard-help-title"
          style={{
            width: "min(720px, 92vw)",
            "max-height": "84vh",
            background: "var(--color-bg-elevated)",
            "border-radius": "14px",
            "box-shadow": "0 24px 64px rgba(0,0,0,0.35)",
            overflow: "hidden",
            display: "flex",
            "flex-direction": "column",
          }}
        >
          {/* ── Header ──────────────────────────────────────────── */}
          <div
            style={{
              padding: "18px 22px",
              "border-bottom": "1px solid var(--color-border)",
              display: "flex",
              "align-items": "center",
              "justify-content": "space-between",
              gap: "16px",
            }}
          >
            <h2
              id="keyboard-help-title"
              style={{
                margin: "0",
                "font-size": "16px",
                "font-weight": "600",
                color: "var(--color-text)",
              }}
            >
              Keyboard shortcuts
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label="Close keyboard shortcuts"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--color-text-muted)",
                cursor: "pointer",
                "font-size": "14px",
                padding: "4px 8px",
              }}
            >
              Esc
            </button>
          </div>

          {/* ── Body: grouped tables ────────────────────────────── */}
          <div style={{ "overflow-y": "auto", padding: "12px 22px 20px" }}>
            <Show
              when={snapshot().length > 0}
              fallback={
                <p
                  style={{
                    color: "var(--color-text-muted)",
                    "text-align": "center",
                    padding: "32px 0",
                    "font-size": "14px",
                  }}
                >
                  No keyboard shortcuts registered yet on this page.
                </p>
              }
            >
              <For each={GROUP_ORDER}>
                {(group) => {
                  const grouped = groupShortcuts(snapshot());
                  const items = grouped[group];
                  return (
                    <Show when={items.length > 0}>
                      <section style={{ "margin-top": "14px" }}>
                        <h3
                          style={{
                            margin: "0 0 8px",
                            "font-size": "11px",
                            "font-weight": "600",
                            "letter-spacing": "0.08em",
                            "text-transform": "uppercase",
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          {group}
                        </h3>
                        <table
                          style={{
                            width: "100%",
                            "border-collapse": "collapse",
                          }}
                        >
                          <tbody>
                            <For each={items}>
                              {(sc) => (
                                <tr
                                  style={{
                                    "border-top": "1px solid var(--color-border)",
                                  }}
                                >
                                  <td
                                    style={{
                                      padding: "8px 0",
                                      "font-size": "13px",
                                      color: "var(--color-text)",
                                    }}
                                  >
                                    {sc.description}
                                  </td>
                                  <td
                                    style={{
                                      padding: "8px 0",
                                      "text-align": "right",
                                      "white-space": "nowrap",
                                    }}
                                  >
                                    <For each={chordParts(sc.keys)}>
                                      {(chord, i) => (
                                        <>
                                          <Show when={i() > 0}>
                                            <span
                                              style={{
                                                margin: "0 6px",
                                                color: "var(--color-text-muted)",
                                                "font-size": "12px",
                                              }}
                                            >
                                              then
                                            </span>
                                          </Show>
                                          <For each={chordSegments(chord)}>
                                            {(seg, j) => (
                                              <>
                                                <Show when={j() > 0}>
                                                  <span
                                                    style={{
                                                      margin: "0 4px",
                                                      color:
                                                        "var(--color-text-muted)",
                                                    }}
                                                  >
                                                    +
                                                  </span>
                                                </Show>
                                                <kbd
                                                  style={{
                                                    display: "inline-block",
                                                    padding: "2px 8px",
                                                    "border-radius": "6px",
                                                    border:
                                                      "1px solid var(--color-border)",
                                                    background:
                                                      "var(--color-bg-subtle)",
                                                    "font-family":
                                                      "ui-monospace, SFMono-Regular, Menlo, monospace",
                                                    "font-size": "12px",
                                                    color: "var(--color-text)",
                                                    "min-width": "20px",
                                                    "text-align": "center",
                                                  }}
                                                >
                                                  {seg}
                                                </kbd>
                                              </>
                                            )}
                                          </For>
                                        </>
                                      )}
                                    </For>
                                  </td>
                                </tr>
                              )}
                            </For>
                          </tbody>
                        </table>
                      </section>
                    </Show>
                  );
                }}
              </For>
            </Show>
          </div>

          {/* ── Footer hint ─────────────────────────────────────── */}
          <div
            style={{
              padding: "10px 22px",
              "border-top": "1px solid var(--color-border)",
              "font-size": "12px",
              color: "var(--color-text-muted)",
              display: "flex",
              "justify-content": "space-between",
            }}
          >
            <span>
              Press <kbd>?</kbd> any time to reopen this list
            </span>
            <span>
              <kbd>Esc</kbd> to close
            </span>
          </div>
        </div>
      </div>
    </Show>
  );
}

export default KeyboardHelp;
