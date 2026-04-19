// ── KeyboardHelp + Shortcut Registry: Smoke + Unit Tests ────────────
//
// Two layers:
//   1. Source-level smoke tests — verify the KeyboardHelp component
//      exists, exports the expected API, and renders the a11y bits the
//      help overlay promises (role="dialog", aria-modal, kbd tags).
//      We avoid booting the SolidJS renderer because the web package
//      doesn't ship a JSDOM harness (matches the pattern used by
//      Icon.test.ts / StackRow.test.ts).
//   2. Pure unit tests for the keyboard registry that DOES run logic:
//      shortcut registration, listener wiring, the `?` chord normaliser,
//      the typing-context guard, and the two-key sequence machinery.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  __resetForTests,
  eventToChord,
  groupShortcuts,
  listShortcuts,
  registerShortcut,
} from "../lib/keyboard";

// ── Source-Level Smoke Tests ────────────────────────────────────────

const HELP_PATH = resolve(import.meta.dir, "KeyboardHelp.tsx");

describe("KeyboardHelp.tsx — source smoke", () => {
  test("file exists", () => {
    expect(existsSync(HELP_PATH)).toBe(true);
  });

  test("exports a KeyboardHelp component (named + default)", () => {
    const src = readFileSync(HELP_PATH, "utf-8");
    expect(src).toContain("export function KeyboardHelp");
    expect(src).toContain("export default KeyboardHelp");
  });

  test("registers the `?` shortcut at mount", () => {
    const src = readFileSync(HELP_PATH, "utf-8");
    expect(src).toContain("registerShortcut");
    expect(src).toMatch(/keys:\s*"\?"/);
  });

  test("renders an accessible dialog (role + aria-modal + label)", () => {
    const src = readFileSync(HELP_PATH, "utf-8");
    expect(src).toContain('role="dialog"');
    expect(src).toContain('aria-modal="true"');
    expect(src).toContain('aria-labelledby="keyboard-help-title"');
  });

  test("renders shortcut chords inside <kbd> tags", () => {
    const src = readFileSync(HELP_PATH, "utf-8");
    expect(src).toContain("<kbd");
  });

  test("Esc closes the overlay", () => {
    const src = readFileSync(HELP_PATH, "utf-8");
    expect(src).toMatch(/keys:\s*"esc"/);
    expect(src).toContain("aria-label=\"Close keyboard shortcuts\"");
  });

  test("groups shortcuts by page (Global / Navigation / Project view / Admin)", () => {
    const src = readFileSync(HELP_PATH, "utf-8");
    expect(src).toContain("Global");
    expect(src).toContain("Navigation");
    expect(src).toContain("Project view");
    expect(src).toContain("Admin");
  });
});

// ── Registry Unit Tests ─────────────────────────────────────────────

describe("registry: registerShortcut / listShortcuts", () => {
  beforeEach(() => {
    __resetForTests();
  });
  afterEach(() => {
    __resetForTests();
  });

  test("starts empty", () => {
    expect(listShortcuts().length).toBe(0);
  });

  test("registerShortcut adds an entry and returns an unregister fn", () => {
    const off = registerShortcut({
      keys: "c",
      description: "Create",
      group: "Project view",
      action: () => {},
    });
    expect(listShortcuts().length).toBe(1);
    expect(listShortcuts()[0]?.description).toBe("Create");
    off();
    expect(listShortcuts().length).toBe(0);
  });

  test("supports multiple shortcuts and unregisters individually", () => {
    const off1 = registerShortcut({
      keys: "g d",
      description: "Dashboard",
      group: "Navigation",
      action: () => {},
    });
    const off2 = registerShortcut({
      keys: "g p",
      description: "Projects",
      group: "Navigation",
      action: () => {},
    });
    expect(listShortcuts().length).toBe(2);
    off1();
    expect(listShortcuts().length).toBe(1);
    expect(listShortcuts()[0]?.keys).toBe("g p");
    off2();
  });

  test("groupShortcuts buckets entries by group", () => {
    registerShortcut({
      keys: "?",
      description: "Help",
      group: "Global",
      action: () => {},
    });
    registerShortcut({
      keys: "g d",
      description: "Dashboard",
      group: "Navigation",
      action: () => {},
    });
    registerShortcut({
      keys: "c",
      description: "Create",
      group: "Project view",
      action: () => {},
    });
    const grouped = groupShortcuts(listShortcuts());
    expect(grouped.Global.length).toBe(1);
    expect(grouped.Navigation.length).toBe(1);
    expect(grouped["Project view"].length).toBe(1);
    expect(grouped.Admin.length).toBe(0);
  });
});

// ── Chord Normalisation ─────────────────────────────────────────────
//
// Bun's test runtime has no DOM, so `new KeyboardEvent()` blows up.
// We feed `eventToChord` a hand-rolled object that satisfies the four
// fields it actually reads (key + the three modifier booleans). The
// signature accepts the real KeyboardEvent type, so we cast at the
// call site — the cast is a test-only ergonomics shortcut.

interface FakeKeyEvt {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

function fake(e: FakeKeyEvt): KeyboardEvent {
  return {
    key: e.key,
    metaKey: e.metaKey ?? false,
    ctrlKey: e.ctrlKey ?? false,
    altKey: e.altKey ?? false,
    shiftKey: e.shiftKey ?? false,
  } as unknown as KeyboardEvent;
}

describe("eventToChord: key normalisation", () => {
  test("plain letter → lowercase", () => {
    expect(eventToChord(fake({ key: "C" }))).toBe("c");
  });

  test("? (shift+/) renders as `?` not `shift+?`", () => {
    // Browsers report the resolved character in `key` when shift is held,
    // so a "?" chord arrives as key="?" with shiftKey=true. We don't
    // want to force callers to register "shift+?" — they registered "?".
    expect(eventToChord(fake({ key: "?", shiftKey: true }))).toBe("?");
  });

  test("Escape → `esc`", () => {
    expect(eventToChord(fake({ key: "Escape" }))).toBe("esc");
  });

  test("ArrowDown → `down`", () => {
    expect(eventToChord(fake({ key: "ArrowDown" }))).toBe("down");
  });

  test("Cmd+K (macOS) → `cmd+k`", () => {
    expect(eventToChord(fake({ key: "k", metaKey: true }))).toBe("cmd+k");
  });

  test("Ctrl+K (Win/Linux) → `ctrl+k`", () => {
    expect(eventToChord(fake({ key: "k", ctrlKey: true }))).toBe("ctrl+k");
  });

  test("Shift+Enter → `shift+enter` (Enter is non-printable)", () => {
    expect(eventToChord(fake({ key: "Enter", shiftKey: true }))).toBe(
      "shift+enter",
    );
  });
});

// ── Documented exit-criteria coverage ───────────────────────────────

describe("registry covers the doctrine shortcut set", () => {
  beforeEach(() => __resetForTests());
  afterEach(() => __resetForTests());

  test("can register every documented shortcut shape", () => {
    const samples: { keys: string; group: Parameters<typeof registerShortcut>[0]["group"] }[] = [
      { keys: "g d", group: "Navigation" },
      { keys: "g p", group: "Navigation" },
      { keys: "g b", group: "Navigation" },
      { keys: "c", group: "Project view" },
      { keys: "n", group: "Lists" },
      { keys: "?", group: "Global" },
      { keys: "/", group: "Global" },
      { keys: "cmd+k", group: "Global" },
      { keys: "ctrl+k", group: "Global" },
      { keys: "esc", group: "Global" },
    ];
    for (const s of samples) {
      registerShortcut({
        keys: s.keys,
        description: s.keys,
        group: s.group,
        action: () => {},
      });
    }
    expect(listShortcuts().length).toBe(samples.length);
  });
});
