// ── Command Registry ──────────────────────────────────────────────────
// A typed, central registry of every action the command palette can
// invoke. The palette consumes this; nothing else touches the keyboard
// surface. Following CLAUDE.md §6.1: TypeScript strict, Zod at runtime
// boundaries, zero HTML — just pure data + functions.
//
// Design notes:
//   1. Commands are *static metadata + a perform fn*. They do not own UI.
//      The palette renders them. This keeps the registry headless and
//      testable without a render harness (matches `Icon.test.ts`).
//   2. `when` is a pure predicate evaluated each time the palette opens
//      so role gating and feature flags can hide commands at runtime.
//   3. Recents are persisted under `btf:cmdk:recent` (per the brief).
//   4. The fuzzy scorer is in-house — no `cmdk`, no `fuzzysort`. The
//      brief explicitly forbids new deps.

// ── Types ─────────────────────────────────────────────────────────────

export const COMMAND_GROUPS = ["navigation", "actions", "admin", "search"] as const;
export type CommandGroup = (typeof COMMAND_GROUPS)[number];

function assertGroup(value: unknown): asserts value is CommandGroup {
  if (typeof value !== "string" || !(COMMAND_GROUPS as readonly string[]).includes(value)) {
    throw new Error(
      `Invalid command group "${String(value)}" (expected ${COMMAND_GROUPS.join(" | ")})`,
    );
  }
}

/**
 * Context passed to `when` predicates and `perform` fns. Kept narrow on
 * purpose so the registry doesn't accidentally couple to the auth store
 * or the router — the palette injects whatever it needs.
 */
export interface CommandContext {
  /** Authenticated user role, or `null` if anonymous. */
  role: "admin" | "editor" | "viewer" | null;
  /** Imperative router navigation (from `@solidjs/router`'s `useNavigate`). */
  navigate: (path: string) => void;
  /** Theme toggle hook from the theme store. */
  toggleTheme: () => void;
  /** Sign out hook from the auth store. */
  signOut: () => Promise<void> | void;
}

export interface CommandDescriptor {
  /** Stable id — used for recents, telemetry, dedupe. Lowercase kebab. */
  id: string;
  /** Human label shown in the palette row. */
  label: string;
  /** Bucket for the grouped list (Navigation / Actions / Admin / Search). */
  group: CommandGroup;
  /** Optional keyboard shortcut hint (display-only — palette is the bind). */
  shortcut?: string;
  /** Extra search terms — synonyms, abbreviations, route hints. */
  keywords?: readonly string[];
  /** One-line description shown in the right-hand preview pane. */
  description?: string;
  /** If the action navigates somewhere, the destination path (for preview). */
  destination?: string;
  /** Marks the command as destructive — preview surfaces a warning. */
  destructive?: boolean;
  /** Predicate gating visibility. Defaults to "always visible". */
  when?: (ctx: CommandContext) => boolean;
  /** Side-effecting executor. May be sync or async. */
  perform: (ctx: CommandContext) => void | Promise<void>;
}

// ── Registry ──────────────────────────────────────────────────────────

const REGISTRY = new Map<string, CommandDescriptor>();

/**
 * Register a command. Re-registering the same id replaces the previous
 * descriptor — useful for hot-module reloads and tests. Returns the
 * descriptor so callers can keep a typed handle.
 */
export function registerCommand(cmd: CommandDescriptor): CommandDescriptor {
  if (!cmd.id || !cmd.label || !cmd.perform) {
    throw new Error(`registerCommand: id, label, and perform are required (got id="${cmd.id}")`);
  }
  assertGroup(cmd.group);
  REGISTRY.set(cmd.id, cmd);
  return cmd;
}

/** Remove a command from the registry. Returns true if it existed. */
export function unregisterCommand(id: string): boolean {
  return REGISTRY.delete(id);
}

/** Snapshot of all registered commands, in insertion order. */
export function getAllCommands(): CommandDescriptor[] {
  return Array.from(REGISTRY.values());
}

/** Filter visible commands using the supplied context's `when` predicates. */
export function getVisibleCommands(ctx: CommandContext): CommandDescriptor[] {
  return getAllCommands().filter((c) => (c.when ? c.when(ctx) : true));
}

/** Lookup by id. */
export function findCommand(id: string): CommandDescriptor | undefined {
  return REGISTRY.get(id);
}

/** Test helper — wipe the registry between cases. */
export function _clearRegistryForTests(): void {
  REGISTRY.clear();
}

// ── Recents (localStorage-backed) ─────────────────────────────────────

export const RECENT_STORAGE_KEY = "btf:cmdk:recent";
export const RECENT_MAX = 5;

export function getRecentCommandIds(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

export function recordCommandUse(id: string): void {
  if (typeof localStorage === "undefined") return;
  const next = [id, ...getRecentCommandIds().filter((x) => x !== id)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full / private mode — recents are best-effort.
  }
}

// ── Fuzzy scorer ──────────────────────────────────────────────────────
//
// In-house, no deps. Three-tier scoring:
//   * EXACT prefix on the label                   → +1000
//   * substring match on the label                 → +500
//   * substring match on a keyword                 → +200
// Then per-character matches add small bonuses:
//   * char at start of label                       → +50
//   * char at a word boundary (after ' ', '-', '/')→ +20
//   * char in label                                → +5
//   * char in keyword                              → +2
// Non-matching chars do NOT veto; they're absorbed and the base score
// determines visibility. A query that doesn't match the label OR any
// keyword scores 0 → filtered out.

interface ScoredCommand {
  command: CommandDescriptor;
  score: number;
}

function isWordBoundary(ch: string): boolean {
  return ch === " " || ch === "-" || ch === "_" || ch === "/" || ch === ".";
}

function scoreMatch(haystack: string, needle: string): number {
  if (!needle) return 0;
  if (haystack.startsWith(needle)) return 1000 + needle.length * 50;
  const idx = haystack.indexOf(needle);
  if (idx >= 0) {
    const boundary = idx === 0 || isWordBoundary(haystack[idx - 1] ?? "");
    return 500 + (boundary ? 100 : 0) + needle.length * 5;
  }

  // Per-char fallback — every needle char must appear in order.
  let cursor = 0;
  let charScore = 0;
  for (const ch of needle) {
    const found = haystack.indexOf(ch, cursor);
    if (found < 0) return 0;
    if (found === 0) charScore += 50;
    else if (isWordBoundary(haystack[found - 1] ?? "")) charScore += 20;
    else charScore += 5;
    cursor = found + 1;
  }
  return charScore;
}

export function scoreCommand(cmd: CommandDescriptor, queryRaw: string): number {
  const query = queryRaw.toLowerCase().trim();
  if (!query) return 1; // empty query = everything visible at score 1.

  const label = cmd.label.toLowerCase();
  let score = scoreMatch(label, query);

  for (const kw of cmd.keywords ?? []) {
    score = Math.max(score, scoreMatch(kw.toLowerCase(), query) * 0.4);
  }

  if (cmd.description) {
    score = Math.max(score, scoreMatch(cmd.description.toLowerCase(), query) * 0.2);
  }

  return score;
}

/**
 * Run fuzzy search across the visible commands and return them in score
 * order. An empty query returns all visible commands in registration
 * order (palette can then re-bucket by group).
 */
export function searchCommands(ctx: CommandContext, query: string): CommandDescriptor[] {
  const visible = getVisibleCommands(ctx);
  const trimmed = query.trim();
  if (!trimmed) return visible;

  const scored: ScoredCommand[] = visible
    .map((command) => ({ command, score: scoreCommand(command, trimmed) }))
    .filter((entry) => entry.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.map((entry) => entry.command);
}

/** Group commands by their `group` field, preserving insertion order. */
export function groupCommands(
  cmds: readonly CommandDescriptor[],
): Record<CommandGroup, CommandDescriptor[]> {
  const buckets: Record<CommandGroup, CommandDescriptor[]> = {
    navigation: [],
    actions: [],
    admin: [],
    search: [],
  };
  for (const cmd of cmds) buckets[cmd.group].push(cmd);
  return buckets;
}

export const GROUP_LABELS: Record<CommandGroup, string> = {
  navigation: "Navigation",
  actions: "Actions",
  admin: "Admin",
  search: "Search",
};

// ── Default command set ───────────────────────────────────────────────
//
// Registered eagerly on module import. Commands that need server work
// (e.g. "Rotate API key") delegate to existing routes for now — the
// palette is an *entry point*, not a parallel implementation of every
// flow.

const ADMIN_ONLY = (ctx: CommandContext): boolean => ctx.role === "admin";

function nav(path: string): (ctx: CommandContext) => void {
  return (ctx) => ctx.navigate(path);
}

// Navigation
registerCommand({
  id: "nav.dashboard",
  label: "Go to Dashboard",
  group: "navigation",
  shortcut: "g d",
  keywords: ["home", "main"],
  description: "Open the main workspace dashboard.",
  destination: "/dashboard",
  perform: nav("/dashboard"),
});
registerCommand({
  id: "nav.billing",
  label: "Go to Billing",
  group: "navigation",
  keywords: ["plans", "subscription", "invoice", "payment"],
  description: "Manage subscription, invoices, and payment methods.",
  destination: "/billing",
  perform: nav("/billing"),
});
registerCommand({
  id: "nav.admin",
  label: "Go to Admin",
  group: "navigation",
  keywords: ["console", "ops"],
  description: "Open the admin console.",
  destination: "/admin",
  when: ADMIN_ONLY,
  perform: nav("/admin"),
});
registerCommand({
  id: "nav.projects",
  label: "Go to Projects",
  group: "navigation",
  keywords: ["repos", "workspaces"],
  description: "Browse all of your projects.",
  destination: "/projects",
  perform: nav("/projects"),
});
registerCommand({
  id: "nav.deploys",
  label: "Go to Deploys",
  group: "navigation",
  keywords: ["deployments", "releases", "ship"],
  description: "Inspect recent deployments and rollouts.",
  destination: "/deployments",
  perform: nav("/deployments"),
});
registerCommand({
  id: "nav.dns",
  label: "Go to DNS",
  group: "navigation",
  keywords: ["records", "zone", "nameserver"],
  description: "Manage DNS records and zones.",
  destination: "/dns",
  perform: nav("/dns"),
});
registerCommand({
  id: "nav.domains",
  label: "Go to Domains",
  group: "navigation",
  keywords: ["custom domain", "vanity", "ssl"],
  description: "Manage custom domains and certificates.",
  destination: "/domains",
  perform: nav("/domains"),
});

// Actions
registerCommand({
  id: "action.create-project",
  label: "Create project",
  group: "actions",
  shortcut: "c p",
  keywords: ["new", "scaffold", "start"],
  description: "Spin up a new project.",
  destination: "/projects/new",
  perform: nav("/projects/new"),
});
registerCommand({
  id: "action.start-deploy",
  label: "Start deploy",
  group: "actions",
  shortcut: "g s",
  keywords: ["ship", "release", "production", "push live"],
  description: "Trigger a fresh production deploy from the dashboard.",
  destination: "/dashboard?deploy=true",
  perform: nav("/dashboard?deploy=true"),
});
registerCommand({
  id: "action.rotate-api-key",
  label: "Rotate API key",
  group: "actions",
  keywords: ["secret", "credentials", "regenerate"],
  description: "Rotate your personal API key. Old key stops working immediately.",
  destination: "/settings?tab=api&action=rotate",
  destructive: true,
  perform: nav("/settings?tab=api&action=rotate"),
});
registerCommand({
  id: "action.toggle-theme",
  label: "Toggle theme",
  group: "actions",
  keywords: ["dark", "light", "appearance"],
  description: "Switch between light and dark mode.",
  perform: (ctx) => ctx.toggleTheme(),
});
registerCommand({
  id: "action.sign-out",
  label: "Sign out",
  group: "actions",
  keywords: ["logout", "log out", "leave"],
  description: "End your session and return to the sign-in page.",
  destructive: true,
  when: (ctx) => ctx.role !== null,
  perform: async (ctx) => {
    await ctx.signOut();
  },
});

// Admin
registerCommand({
  id: "admin.claude-console",
  label: "Open Claude Console",
  group: "admin",
  keywords: ["agents", "ai", "console"],
  description: "Open the internal Claude operations console.",
  destination: "/admin/claude",
  when: ADMIN_ONLY,
  perform: nav("/admin/claude"),
});
registerCommand({
  id: "admin.db-inspector",
  label: "View DB inspector",
  group: "admin",
  keywords: ["database", "sql", "tables", "rows"],
  description: "Inspect tables, indexes, and recent queries.",
  destination: "/database",
  when: ADMIN_ONLY,
  perform: nav("/database"),
});
registerCommand({
  id: "admin.flush-cache",
  label: "Flush cache",
  group: "admin",
  keywords: ["purge", "invalidate", "cdn"],
  description: "Purge all edge caches across regions.",
  destination: "/admin?action=flush-cache",
  destructive: true,
  when: ADMIN_ONLY,
  perform: nav("/admin?action=flush-cache"),
});

// Search
registerCommand({
  id: "search.docs",
  label: "Search docs",
  group: "search",
  keywords: ["documentation", "help", "guides", "manual"],
  description: "Open the docs search.",
  destination: "/docs",
  perform: nav("/docs?focus=search"),
});
registerCommand({
  id: "search.logs",
  label: "Search logs",
  group: "search",
  keywords: ["events", "audit", "trace"],
  description: "Search across deployment and audit logs.",
  destination: "/deployments?focus=logs",
  perform: nav("/deployments?focus=logs"),
});

/**
 * Snapshot of the canonical command IDs that ship in the default set.
 * Exported so tests can assert presence without re-listing every entry.
 */
export const DEFAULT_COMMAND_IDS = [
  "nav.dashboard",
  "nav.billing",
  "nav.admin",
  "nav.projects",
  "nav.deploys",
  "nav.dns",
  "nav.domains",
  "action.create-project",
  "action.start-deploy",
  "action.rotate-api-key",
  "action.toggle-theme",
  "action.sign-out",
  "admin.claude-console",
  "admin.db-inspector",
  "admin.flush-cache",
  "search.docs",
  "search.logs",
] as const;
