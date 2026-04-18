import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { TEMPLATES } from "@back-to-the-future/schemas";
import {
  QUICK_ACTIONS,
  getRecentActionIds,
  runAction,
  searchActions,
  type QuickAction,
} from "../lib/quick-actions";

// ── Command Palette (Cmd+K / Ctrl+K) ───────────────────────────────
// Searchable list of every action, template, and page.
// Keyboard navigation. Recent actions surfaced at the top.

interface CommandItem {
  id: string;
  title: string;
  subtitle: string;
  kind: "action" | "template" | "page";
  run: () => void | Promise<void>;
}

const PAGES: { id: string; title: string; subtitle: string; href: string }[] = [
  { id: "page-dashboard", title: "Dashboard", subtitle: "Your main workspace", href: "/dashboard" },
  { id: "page-templates", title: "Templates", subtitle: "Pre-built starter projects", href: "/templates" },
  { id: "page-builder", title: "Builder", subtitle: "Visual website builder", href: "/builder" },
  { id: "page-chat", title: "Claude Chat", subtitle: "Anthropic API direct chat", href: "/chat" },
  { id: "page-repos", title: "Repositories", subtitle: "GitHub repos, PRs, CI status", href: "/repos" },
  { id: "page-billing", title: "Billing", subtitle: "Plans and payment", href: "/billing" },
  { id: "page-settings", title: "Settings", subtitle: "Account and preferences", href: "/settings" },
];

function actionToItem(a: QuickAction): CommandItem {
  return {
    id: `action:${a.id}`,
    title: a.name,
    subtitle: a.description,
    kind: "action",
    run: () => runAction(a.id),
  };
}

export function CommandPalette(): ReturnType<typeof Show> {
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [selectedIndex, setSelectedIndex] = createSignal(0);

  const handleKey = (e: KeyboardEvent): void => {
    const isMac = typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac");
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
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, items().length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items()[selectedIndex()];
      if (item) {
        void item.run();
        setOpen(false);
      }
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

  const allItems = createMemo<CommandItem[]>(() => {
    const recents = getRecentActionIds();
    const recentItems = recents
      .map((id) => QUICK_ACTIONS.find((a) => a.id === id))
      .filter((a): a is QuickAction => a !== undefined)
      .map(actionToItem);

    const otherActions = QUICK_ACTIONS.filter((a) => !recents.includes(a.id)).map(actionToItem);

    const templateItems: CommandItem[] = TEMPLATES.map((t) => ({
      id: `template:${t.id}`,
      title: `Template: ${t.name}`,
      subtitle: t.description,
      kind: "template",
      run: () => {
        if (typeof window !== "undefined") {
          window.location.assign(`/builder?template=${t.id}`);
        }
      },
    }));

    const pageItems: CommandItem[] = PAGES.map((p) => ({
      id: p.id,
      title: p.title,
      subtitle: p.subtitle,
      kind: "page",
      run: () => {
        if (typeof window !== "undefined") {
          window.location.assign(p.href);
        }
      },
    }));

    return [...recentItems, ...otherActions, ...templateItems, ...pageItems];
  });

  const items = createMemo<CommandItem[]>(() => {
    const q = query().toLowerCase().trim();
    if (!q) return allItems();
    // Filter actions through fuzzy search, then rest by simple includes.
    const fuzzyActionIds = new Set(searchActions(q).map((a) => `action:${a.id}`));
    return allItems().filter(
      (it) =>
        fuzzyActionIds.has(it.id) ||
        it.title.toLowerCase().includes(q) ||
        it.subtitle.toLowerCase().includes(q),
    );
  });

  createEffect(() => {
    items();
    setSelectedIndex(0);
  });

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
          style={{
            width: "min(640px, 90vw)",
            background: "var(--color-bg-elevated)",
            "border-radius": "12px",
            "box-shadow": "0 20px 60px rgba(0,0,0,0.3)",
            overflow: "hidden",
          }}
        >
          <input
            autofocus
            type="text"
            placeholder="Type a command or search... (Esc to close)"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            style={{
              width: "100%",
              padding: "16px 20px",
              border: "none",
              "border-bottom": "1px solid var(--color-border)",
              "font-size": "16px",
              outline: "none",
              "box-sizing": "border-box",
            }}
          />
          <div style={{ "max-height": "60vh", "overflow-y": "auto" }}>
            <Show
              when={items().length > 0}
              fallback={
                <div style={{ padding: "24px", "text-align": "center", color: "var(--color-text-muted)" }}>
                  No matches. Try a different search.
                </div>
              }
            >
              <For each={items()}>
                {(item, i) => (
                  <div
                    onClick={() => {
                      void item.run();
                      setOpen(false);
                    }}
                    onMouseEnter={() => setSelectedIndex(i())}
                    style={{
                      padding: "12px 20px",
                      cursor: "pointer",
                      background: selectedIndex() === i() ? "var(--color-bg-subtle)" : "var(--color-bg-elevated)",
                      "border-left": selectedIndex() === i() ? "3px solid var(--color-primary)" : "3px solid transparent",
                    }}
                  >
                    <div style={{ "font-weight": "500", color: "var(--color-text)" }}>{item.title}</div>
                    <div style={{ "font-size": "13px", color: "var(--color-text-muted)" }}>{item.subtitle}</div>
                  </div>
                )}
              </For>
            </Show>
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
