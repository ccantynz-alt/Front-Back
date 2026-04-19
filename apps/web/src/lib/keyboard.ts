// ── Global Keyboard Shortcut Registry ───────────────────────────────
//
// One process-wide registry that any component can write to. Pages
// register their shortcuts on mount, unregister on cleanup, and the
// registry maintains a single global keydown listener regardless of how
// many shortcuts are live. Listing the registry is what powers the
// `?` help overlay.
//
// Shortcut keys come in two shapes:
//   - Single chord: "?", "esc", "c", "n", "/", "cmd+k", "ctrl+k"
//   - Two-key sequence: "g d", "g p", "g b" — pressed within
//     SEQUENCE_TIMEOUT_MS of each other.
//
// We deliberately COEXIST with the existing CommandPalette (Cmd+K) and
// any existing modal close handlers — the registry never calls
// preventDefault unless the registered handler actually matches AND
// fires, and we leave keys unhandled when the user is typing in an
// input, textarea, or contenteditable element.

// ── Types ───────────────────────────────────────────────────────────

export type ShortcutGroup =
  | "Global"
  | "Dashboard"
  | "Project view"
  | "Admin"
  | "Navigation"
  | "Lists";

export interface Shortcut {
  /**
   * The key chord. Examples:
   *   "?", "esc", "c", "n", "/"
   *   "cmd+k", "ctrl+k"
   *   "g d", "g p", "g b"  ← two-key sequences (space-separated)
   *
   * Non-printable special keys: "esc", "enter", "tab", "space",
   * "up", "down", "left", "right", "backspace", "delete".
   */
  keys: string;
  /** Human-readable description shown in the help overlay. */
  description: string;
  /** Group bucket in the help overlay. */
  group: ShortcutGroup;
  /** The action to run when the shortcut fires. */
  action: (event: KeyboardEvent) => void;
  /**
   * Optional gate. When provided, the shortcut only fires when this
   * predicate returns true. Use it to scope context-aware shortcuts
   * like `c` → Create (different on dashboard vs project view).
   */
  when?: () => boolean;
}

export interface RegisteredShortcut extends Shortcut {
  id: string;
}

// ── Registry State ──────────────────────────────────────────────────

const SEQUENCE_TIMEOUT_MS = 1500;

const registry = new Map<string, RegisteredShortcut>();
let listenerInstalled = false;
let pendingPrefix: string | null = null;
let pendingPrefixTimer: ReturnType<typeof setTimeout> | null = null;

// Track last-registered id so we can hand out monotonic ids without
// requiring the caller to mint one.
let nextId = 0;

// ── Public API ──────────────────────────────────────────────────────

/**
 * Register a keyboard shortcut. Returns an `unregister` function that
 * the caller MUST invoke on component cleanup to avoid leaks.
 *
 * Example:
 *
 *   onMount(() => {
 *     const off = registerShortcut({
 *       keys: "g d",
 *       description: "Go to Dashboard",
 *       group: "Navigation",
 *       action: () => navigate("/dashboard"),
 *     });
 *     onCleanup(off);
 *   });
 */
export function registerShortcut(shortcut: Shortcut): () => void {
  ensureListener();
  const id = `sc_${++nextId}`;
  registry.set(id, { ...shortcut, id });
  return () => {
    registry.delete(id);
  };
}

/** Snapshot of every currently-registered shortcut — used by the help overlay. */
export function listShortcuts(): readonly RegisteredShortcut[] {
  return Array.from(registry.values());
}

/** Group helper for the help overlay. */
export function groupShortcuts(
  shortcuts: readonly RegisteredShortcut[],
): Record<ShortcutGroup, RegisteredShortcut[]> {
  const groups: Record<ShortcutGroup, RegisteredShortcut[]> = {
    Global: [],
    Navigation: [],
    Dashboard: [],
    "Project view": [],
    Admin: [],
    Lists: [],
  };
  for (const sc of shortcuts) {
    groups[sc.group].push(sc);
  }
  return groups;
}

// ── Internal: Listener Management ───────────────────────────────────

function ensureListener(): void {
  if (listenerInstalled) return;
  if (typeof window === "undefined") return;
  window.addEventListener("keydown", handleKeydown);
  listenerInstalled = true;
}

/**
 * Test-only hook that wipes registry state between tests so each suite
 * starts from a clean slate. Not exported from the package barrel — use
 * via direct import in tests.
 */
export function __resetForTests(): void {
  registry.clear();
  pendingPrefix = null;
  if (pendingPrefixTimer) {
    clearTimeout(pendingPrefixTimer);
    pendingPrefixTimer = null;
  }
  nextId = 0;
  if (typeof window !== "undefined" && listenerInstalled) {
    window.removeEventListener("keydown", handleKeydown);
    listenerInstalled = false;
  }
}

// ── Internal: Key Normalisation ─────────────────────────────────────

/**
 * Convert a `KeyboardEvent` into a normalised chord string like:
 *   "a", "?", "esc", "cmd+k", "ctrl+k", "shift+/"
 *
 * Modifier ordering is fixed: cmd < ctrl < alt < shift < key. We treat
 * `meta` as `cmd` so "cmd+k" works on macOS and "ctrl+k" works on
 * Windows/Linux without forcing the caller to register both.
 */
export function eventToChord(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey) parts.push("cmd");
  if (e.ctrlKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  // Shift is intentionally NOT auto-added for printable keys — we want
  // "?" (shift+/) to register as just "?" so it matches naturally. We
  // only emit "shift" when the resolved key is a non-printable name
  // like "shift+enter".
  const key = normaliseKey(e);
  if (e.shiftKey && !isShiftedPrintable(key)) parts.push("shift");
  parts.push(key);
  return parts.join("+");
}

function normaliseKey(e: KeyboardEvent): string {
  const key = e.key;
  switch (key) {
    case "Escape":
      return "esc";
    case "Enter":
      return "enter";
    case "Tab":
      return "tab";
    case " ":
      return "space";
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    case "Backspace":
      return "backspace";
    case "Delete":
      return "delete";
    default:
      return key.length === 1 ? key.toLowerCase() : key.toLowerCase();
  }
}

/**
 * Returns true when `key` is a printable character that the user
 * obviously had to hold Shift to produce — e.g. "?" (shift+/), "!",
 * "@". For these we suppress the auto "shift+" prefix so registrations
 * read naturally ("?") instead of ("shift+?").
 */
function isShiftedPrintable(key: string): boolean {
  if (key.length !== 1) return false;
  return /[!@#$%^&*()_+{}|:"<>?~]/.test(key);
}

// ── Internal: Listener ──────────────────────────────────────────────

/**
 * Returns true when the event target is a place the user is actively
 * typing — inputs, textareas, contenteditable elements. We never fire
 * shortcuts in those contexts, otherwise typing "g" in a search box
 * would hijack the next keystroke.
 *
 * Exception: `Escape` is allowed to bubble through so users can always
 * back out of a focused input via shortcut.
 */
function isTypingContext(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return false;
}

function handleKeydown(e: KeyboardEvent): void {
  const chord = eventToChord(e);

  // Always let Escape through, even when typing — it's the universal
  // back-out gesture.
  const isEscape = chord === "esc";
  if (!isEscape && isTypingContext(e.target)) {
    return;
  }

  // ── Two-key sequence handling ───────────────────────────────────
  // If we have a pending prefix from the previous keystroke, try to
  // match `prefix space chord` against the registry first.
  if (pendingPrefix) {
    const sequence = `${pendingPrefix} ${chord}`;
    clearPendingPrefix();
    if (tryFire(sequence, e)) {
      e.preventDefault();
      return;
    }
    // Fall through — the second keystroke might still match a single
    // chord on its own.
  }

  // Try to match as a single chord.
  if (tryFire(chord, e)) {
    e.preventDefault();
    return;
  }

  // If no shortcut fired AND this chord is the prefix of a registered
  // sequence, latch it as the pending prefix and wait for the next key.
  if (isSequencePrefix(chord)) {
    pendingPrefix = chord;
    pendingPrefixTimer = setTimeout(clearPendingPrefix, SEQUENCE_TIMEOUT_MS);
  }
}

function tryFire(keys: string, e: KeyboardEvent): boolean {
  for (const sc of registry.values()) {
    if (sc.keys !== keys) continue;
    if (sc.when && !sc.when()) continue;
    sc.action(e);
    return true;
  }
  return false;
}

function isSequencePrefix(chord: string): boolean {
  for (const sc of registry.values()) {
    const first = sc.keys.split(" ")[0];
    if (first === chord && sc.keys.includes(" ")) {
      if (sc.when && !sc.when()) continue;
      return true;
    }
  }
  return false;
}

function clearPendingPrefix(): void {
  pendingPrefix = null;
  if (pendingPrefixTimer) {
    clearTimeout(pendingPrefixTimer);
    pendingPrefixTimer = null;
  }
}
