import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import type { JSX } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useAuth, useTheme } from "../stores";
import {
  GROUP_LABELS,
  type CommandContext,
  type CommandDescriptor,
  type CommandGroup,
  findCommand,
  getRecentCommandIds,
  getVisibleCommands,
  groupCommands,
  recordCommandUse,
  searchCommands,
} from "../lib/commands";

// ── Command Palette (Cmd+K / Ctrl+K) ───────────────────────────────
//
// Linear-grade entry point for every action in the platform.
//   * Mounted globally in app.tsx — works on every route
//   * Cmd+K / Ctrl+K toggles open, Esc closes
//   * Up/Down navigate, Enter executes, type-ahead filters via fuzzy search
//   * Recent commands surface at the top (max 5, persisted to
//     `btf:cmdk:recent`)
//   * Right-hand panel previews the selected command (description,
//     destination, destructive flag)
//   * Role gating delegated to the registry's `when` predicates

const ORDERED_GROUPS: CommandGroup[] = ["navigation", "actions", "admin", "search"];

interface PaletteRow {
  command: CommandDescriptor;
  /** Group label rendered as a section header. `null` for the recents bucket. */
  groupLabel: string | null;
  /** First-in-section flag — used to decide whether to render the header. */
  isFirstInSection: boolean;
}

export function CommandPalette(): JSX.Element {
  const navigate = useNavigate();
  const auth = useAuth();
  const theme = useTheme();

  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  let inputRef: HTMLInputElement | undefined;

  // ── Context fed to the registry ────────────────────────────────────

  const context = createMemo<CommandContext>(() => ({
    role: auth.currentUser()?.role ?? null,
    navigate: (path) => navigate(path),
    toggleTheme: theme.toggleTheme,
    signOut: () => auth.logout(),
  }));

  // ── Keyboard handling ──────────────────────────────────────────────

  const handleKey = (e: KeyboardEvent): void => {
    const isMac =
      typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac");
    const trigger = (isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === "k";
    if (trigger) {
      e.preventDefault();
      setOpen((o) => !o);
      setQuery("");
      setSelectedIndex(0);
      return;
    }
    if (!open()) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, rows().length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const row = rows()[selectedIndex()];
      if (row) void execute(row.command);
    }
  };

  onMount(() => {
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", handleKey);
    }
  });
  onCleanup(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", handleKey);
    }
  });

  // Auto-focus the input when the palette opens.
  createEffect(() => {
    if (open()) {
      queueMicrotask(() => inputRef?.focus());
    }
  });

  // ── Row composition ────────────────────────────────────────────────
  //
  // The palette renders a flat list of rows but each row knows whether
  // it's the first in its visual section (for the section header). When
  // the user types, we collapse to score-ordered results without group
  // headers — Linear's behavior, which keeps fuzzy search snappy.

  const rows = createMemo<PaletteRow[]>(() => {
    const ctx = context();
    const q = query().trim();

    if (q) {
      const results = searchCommands(ctx, q);
      return results.map((command, i) => ({
        command,
        groupLabel: i === 0 ? "Results" : null,
        isFirstInSection: i === 0,
      }));
    }

    const visible = getVisibleCommands(ctx);
    const visibleIds = new Set(visible.map((c) => c.id));

    // Recents bucket — preserve user order, drop ones the registry no
    // longer knows about (or ones the role gate hides now).
    const recents: CommandDescriptor[] = [];
    for (const id of getRecentCommandIds()) {
      if (!visibleIds.has(id)) continue;
      const cmd = findCommand(id);
      if (cmd) recents.push(cmd);
    }
    const recentIds = new Set(recents.map((c) => c.id));

    // Remaining commands grouped in canonical order.
    const remaining = visible.filter((c) => !recentIds.has(c.id));
    const buckets = groupCommands(remaining);

    const out: PaletteRow[] = [];
    if (recents.length > 0) {
      recents.forEach((command, i) => {
        out.push({ command, groupLabel: i === 0 ? "Recent" : null, isFirstInSection: i === 0 });
      });
    }
    for (const group of ORDERED_GROUPS) {
      const items = buckets[group];
      if (items.length === 0) continue;
      items.forEach((command, i) => {
        out.push({
          command,
          groupLabel: i === 0 ? GROUP_LABELS[group] : null,
          isFirstInSection: i === 0,
        });
      });
    }
    return out;
  });

  // Reset selection when the row set changes.
  createEffect(() => {
    rows();
    setSelectedIndex(0);
  });

  // ── Execution ──────────────────────────────────────────────────────

  const execute = async (command: CommandDescriptor): Promise<void> => {
    recordCommandUse(command.id);
    setOpen(false);
    try {
      await command.perform(context());
    } catch (err) {
      // Commands shouldn't throw, but if they do we don't want to take
      // the whole app down. Surface for debugging.
      console.error(`[CommandPalette] command "${command.id}" failed:`, err);
    }
  };

  const selectedRow = (): PaletteRow | undefined => rows()[selectedIndex()];

  return (
    <Show when={open()}>
      <div
        onClick={() => setOpen(false)}
        style={{
          position: "fixed",
          inset: "0",
          background: "rgba(0,0,0,0.5)",
          "z-index": "9999",
          display: "flex",
          "align-items": "flex-start",
          "justify-content": "center",
          "padding-top": "10vh",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          style={{
            width: "min(820px, 92vw)",
            background: "var(--color-bg-elevated)",
            "border-radius": "12px",
            "box-shadow": "0 20px 60px rgba(0,0,0,0.3)",
            overflow: "hidden",
            display: "flex",
            "flex-direction": "column",
          }}
        >
          <input
            ref={inputRef}
            autofocus
            type="text"
            placeholder="Type a command or search..."
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            aria-label="Search commands"
            style={{
              width: "100%",
              padding: "16px 20px",
              border: "none",
              "border-bottom": "1px solid var(--color-border)",
              "font-size": "16px",
              outline: "none",
              "box-sizing": "border-box",
              background: "transparent",
              color: "var(--color-text)",
            }}
          />

          <div style={{ display: "flex", "max-height": "60vh" }}>
            {/* List ─────────────────────────────────────────────── */}
            <div
              style={{
                flex: "1 1 auto",
                "overflow-y": "auto",
                "min-width": "0",
                "border-right": "1px solid var(--color-border)",
              }}
            >
              <Show
                when={rows().length > 0}
                fallback={
                  <div
                    style={{
                      padding: "24px",
                      "text-align": "center",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    No matches. Try a different search.
                  </div>
                }
              >
                <For each={rows()}>
                  {(row, i) => (
                    <>
                      <Show when={row.isFirstInSection && row.groupLabel}>
                        <div
                          style={{
                            padding: "8px 20px 4px",
                            "font-size": "11px",
                            "font-weight": "600",
                            "letter-spacing": "0.08em",
                            "text-transform": "uppercase",
                            color: "var(--color-text-faint)",
                            background: "var(--color-bg-subtle)",
                          }}
                        >
                          {row.groupLabel}
                        </div>
                      </Show>
                      <button
                        type="button"
                        onClick={() => void execute(row.command)}
                        onMouseEnter={() => setSelectedIndex(i())}
                        aria-selected={selectedIndex() === i()}
                        style={{
                          display: "flex",
                          "align-items": "center",
                          "justify-content": "space-between",
                          gap: "12px",
                          width: "100%",
                          padding: "10px 20px",
                          border: "none",
                          cursor: "pointer",
                          "text-align": "left",
                          background:
                            selectedIndex() === i()
                              ? "var(--color-bg-subtle)"
                              : "var(--color-bg-elevated)",
                          "border-left":
                            selectedIndex() === i()
                              ? "3px solid var(--color-primary)"
                              : "3px solid transparent",
                          color: "var(--color-text)",
                        }}
                      >
                        <span
                          style={{
                            "font-weight": "500",
                            "white-space": "nowrap",
                            overflow: "hidden",
                            "text-overflow": "ellipsis",
                          }}
                        >
                          {row.command.label}
                        </span>
                        <Show when={row.command.shortcut}>
                          <span
                            style={{
                              "font-size": "11px",
                              "font-family": "ui-monospace, SFMono-Regular, monospace",
                              padding: "2px 6px",
                              "border-radius": "4px",
                              border: "1px solid var(--color-border)",
                              color: "var(--color-text-muted)",
                              "white-space": "nowrap",
                            }}
                          >
                            {row.command.shortcut}
                          </span>
                        </Show>
                      </button>
                    </>
                  )}
                </For>
              </Show>
            </div>

            {/* Preview pane ─────────────────────────────────────── */}
            <div
              style={{
                flex: "0 0 240px",
                padding: "16px",
                "overflow-y": "auto",
                background: "var(--color-bg-subtle)",
                "font-size": "13px",
                color: "var(--color-text-muted)",
              }}
            >
              <Show
                when={selectedRow()}
                fallback={
                  <div style={{ "font-style": "italic" }}>
                    Select a command to see what it does.
                  </div>
                }
              >
                {(row) => (
                  <div style={{ display: "flex", "flex-direction": "column", gap: "10px" }}>
                    <div
                      style={{
                        "font-size": "14px",
                        "font-weight": "600",
                        color: "var(--color-text)",
                      }}
                    >
                      {row().command.label}
                    </div>
                    <Show when={row().command.description}>
                      <div>{row().command.description}</div>
                    </Show>
                    <Show when={row().command.destination}>
                      <div>
                        <div
                          style={{
                            "font-size": "11px",
                            "text-transform": "uppercase",
                            "letter-spacing": "0.08em",
                            color: "var(--color-text-faint)",
                            "margin-bottom": "2px",
                          }}
                        >
                          Lands on
                        </div>
                        <code
                          style={{
                            "font-family": "ui-monospace, SFMono-Regular, monospace",
                            "font-size": "12px",
                            color: "var(--color-text)",
                          }}
                        >
                          {row().command.destination}
                        </code>
                      </div>
                    </Show>
                    <Show when={row().command.destructive}>
                      <div
                        style={{
                          padding: "6px 8px",
                          "border-radius": "6px",
                          background: "var(--color-danger-bg)",
                          color: "var(--color-danger-text)",
                          "font-weight": "600",
                          "font-size": "12px",
                        }}
                      >
                        Destructive — review before confirming.
                      </div>
                    </Show>
                  </div>
                )}
              </Show>
            </div>
          </div>

          <div
            style={{
              padding: "8px 20px",
              "border-top": "1px solid var(--color-border)",
              "font-size": "12px",
              color: "var(--color-text-muted)",
              display: "flex",
              "justify-content": "space-between",
            }}
          >
            <span>Up/Down to navigate</span>
            <span>Enter to select</span>
            <span>Esc to close</span>
          </div>
        </div>
      </div>
    </Show>
  );
}
