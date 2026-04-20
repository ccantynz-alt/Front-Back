/**
 * Smoke tests for the command palette registry.
 *
 * Strategy:
 *   * The default command set is registered eagerly at module import,
 *     so the first describe block exercises that surface area.
 *   * The second block clears the registry and re-tests the public API
 *     (registerCommand, unregisterCommand, when-gating) in isolation.
 *   * Fuzzy scoring is tested against fabricated commands so we can
 *     assert ordering deterministically.
 *   * Recents persistence uses a tiny in-memory localStorage shim so
 *     the test runs cleanly under Bun's test runner.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  DEFAULT_COMMAND_IDS,
  GROUP_LABELS,
  RECENT_MAX,
  RECENT_STORAGE_KEY,
  _clearRegistryForTests,
  findCommand,
  getAllCommands,
  getRecentCommandIds,
  getVisibleCommands,
  groupCommands,
  recordCommandUse,
  registerCommand,
  scoreCommand,
  searchCommands,
  unregisterCommand,
} from "./commands";
import type { CommandContext, CommandDescriptor } from "./commands";

// ── Test fixtures ─────────────────────────────────────────────────────

function makeContext(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    role: "viewer",
    navigate: () => {},
    toggleTheme: () => {},
    signOut: () => {},
    ...overrides,
  };
}

// Minimal localStorage shim — Bun's test runner doesn't ship one.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

function installLocalStorage(): MemoryStorage {
  const mem = new MemoryStorage();
  // biome-ignore lint/suspicious/noExplicitAny: test shim
  (globalThis as any).localStorage = mem;
  return mem;
}

function uninstallLocalStorage(): void {
  // biome-ignore lint/suspicious/noExplicitAny: test shim
  delete (globalThis as any).localStorage;
}

// ── Default command set ──────────────────────────────────────────────

describe("default command registry", () => {
  test("ships every required canonical command", () => {
    const ids = new Set(getAllCommands().map((c) => c.id));
    for (const required of DEFAULT_COMMAND_IDS) {
      expect(ids.has(required)).toBe(true);
    }
  });

  test("hides admin commands from non-admins", () => {
    const visible = getVisibleCommands(makeContext({ role: "viewer" }));
    const ids = new Set(visible.map((c) => c.id));
    expect(ids.has("admin.claude-console")).toBe(false);
    expect(ids.has("admin.db-inspector")).toBe(false);
    expect(ids.has("admin.flush-cache")).toBe(false);
    expect(ids.has("nav.admin")).toBe(false);
  });

  test("exposes admin commands for admins", () => {
    const visible = getVisibleCommands(makeContext({ role: "admin" }));
    const ids = new Set(visible.map((c) => c.id));
    expect(ids.has("admin.claude-console")).toBe(true);
    expect(ids.has("admin.db-inspector")).toBe(true);
    expect(ids.has("admin.flush-cache")).toBe(true);
    expect(ids.has("nav.admin")).toBe(true);
  });

  test("hides sign-out for anonymous visitors", () => {
    const visible = getVisibleCommands(makeContext({ role: null }));
    const ids = new Set(visible.map((c) => c.id));
    expect(ids.has("action.sign-out")).toBe(false);
  });

  test("groupCommands buckets default commands into all four groups", () => {
    const buckets = groupCommands(getVisibleCommands(makeContext({ role: "admin" })));
    expect(buckets.navigation.length).toBeGreaterThan(0);
    expect(buckets.actions.length).toBeGreaterThan(0);
    expect(buckets.admin.length).toBeGreaterThan(0);
    expect(buckets.search.length).toBeGreaterThan(0);
  });

  test("GROUP_LABELS covers every group", () => {
    expect(GROUP_LABELS.navigation).toBe("Navigation");
    expect(GROUP_LABELS.actions).toBe("Actions");
    expect(GROUP_LABELS.admin).toBe("Admin");
    expect(GROUP_LABELS.search).toBe("Search");
  });

  test("destructive commands are flagged correctly", () => {
    const rotate = findCommand("action.rotate-api-key");
    const flush = findCommand("admin.flush-cache");
    const signout = findCommand("action.sign-out");
    expect(rotate?.destructive).toBe(true);
    expect(flush?.destructive).toBe(true);
    expect(signout?.destructive).toBe(true);
  });

  test("toggle-theme calls the theme hook on perform", async () => {
    let toggled = 0;
    const cmd = findCommand("action.toggle-theme");
    expect(cmd).toBeDefined();
    await cmd?.perform(makeContext({ toggleTheme: () => toggled++ }));
    expect(toggled).toBe(1);
  });

  test("nav.dashboard navigates to /dashboard", async () => {
    const targets: string[] = [];
    const cmd = findCommand("nav.dashboard");
    await cmd?.perform(makeContext({ navigate: (p) => targets.push(p) }));
    expect(targets).toEqual(["/dashboard"]);
  });
});

// ── Registry surface (isolated) ──────────────────────────────────────

describe("registerCommand / unregisterCommand", () => {
  // These tests mutate the shared registry. Snapshot the defaults so we
  // can restore them after the suite — avoids polluting the other test
  // file that may run in the same process.
  let snapshot: CommandDescriptor[] = [];
  beforeEach(() => {
    snapshot = getAllCommands();
    _clearRegistryForTests();
  });
  afterEach(() => {
    _clearRegistryForTests();
    for (const cmd of snapshot) registerCommand(cmd);
  });

  test("registers a new command", () => {
    registerCommand({
      id: "test.alpha",
      label: "Alpha",
      group: "actions",
      perform: () => {},
    });
    expect(findCommand("test.alpha")?.label).toBe("Alpha");
  });

  test("rejects unknown groups", () => {
    expect(() =>
      registerCommand({
        id: "test.bad",
        label: "Bad",
        // biome-ignore lint/suspicious/noExplicitAny: deliberate bad input
        group: "nonsense" as any,
        perform: () => {},
      }),
    ).toThrow();
  });

  test("rejects missing id/label/perform", () => {
    expect(() =>
      registerCommand({
        id: "",
        label: "x",
        group: "actions",
        perform: () => {},
      }),
    ).toThrow();
  });

  test("re-registering the same id replaces the previous entry", () => {
    registerCommand({ id: "x", label: "v1", group: "actions", perform: () => {} });
    registerCommand({ id: "x", label: "v2", group: "actions", perform: () => {} });
    expect(findCommand("x")?.label).toBe("v2");
    expect(getAllCommands().filter((c) => c.id === "x")).toHaveLength(1);
  });

  test("unregisterCommand removes the entry", () => {
    registerCommand({ id: "y", label: "y", group: "actions", perform: () => {} });
    expect(unregisterCommand("y")).toBe(true);
    expect(findCommand("y")).toBeUndefined();
    expect(unregisterCommand("y")).toBe(false);
  });

  test("when-predicate gates visibility", () => {
    registerCommand({
      id: "gated",
      label: "Gated",
      group: "admin",
      when: (ctx) => ctx.role === "admin",
      perform: () => {},
    });
    expect(getVisibleCommands(makeContext({ role: "viewer" })).map((c) => c.id)).not.toContain(
      "gated",
    );
    expect(getVisibleCommands(makeContext({ role: "admin" })).map((c) => c.id)).toContain("gated");
  });
});

// ── Fuzzy scoring ────────────────────────────────────────────────────

describe("scoreCommand / searchCommands", () => {
  test("empty query keeps all commands visible", () => {
    const ctx = makeContext({ role: "admin" });
    const results = searchCommands(ctx, "");
    expect(results.length).toBe(getVisibleCommands(ctx).length);
  });

  test("prefix match outscores substring match", () => {
    const prefix: CommandDescriptor = {
      id: "p",
      label: "Deploys",
      group: "navigation",
      perform: () => {},
    };
    const substring: CommandDescriptor = {
      id: "s",
      label: "Recent Deploys",
      group: "navigation",
      perform: () => {},
    };
    expect(scoreCommand(prefix, "dep")).toBeGreaterThan(scoreCommand(substring, "dep"));
  });

  test("word-boundary match outscores mid-word match", () => {
    const boundary: CommandDescriptor = {
      id: "b",
      label: "Open Claude Console",
      group: "admin",
      perform: () => {},
    };
    const midWord: CommandDescriptor = {
      id: "m",
      label: "Reclaim",
      group: "admin",
      perform: () => {},
    };
    expect(scoreCommand(boundary, "claude")).toBeGreaterThan(scoreCommand(midWord, "claim"));
  });

  test("typo-style fuzzy match still scores >0", () => {
    const cmd: CommandDescriptor = {
      id: "t",
      label: "Toggle Theme",
      group: "actions",
      perform: () => {},
    };
    expect(scoreCommand(cmd, "tgl")).toBeGreaterThan(0);
  });

  test("non-matching query scores 0", () => {
    const cmd: CommandDescriptor = {
      id: "z",
      label: "Dashboard",
      group: "navigation",
      perform: () => {},
    };
    expect(scoreCommand(cmd, "xyzqq")).toBe(0);
  });

  test("keyword match makes a command findable", () => {
    const cmd = findCommand("nav.billing");
    expect(cmd).toBeDefined();
    if (cmd) expect(scoreCommand(cmd, "subscription")).toBeGreaterThan(0);
  });

  test("searchCommands returns matches in score order", () => {
    const ctx = makeContext({ role: "admin" });
    const results = searchCommands(ctx, "deploy");
    const ids = results.map((r) => r.id);
    // The exact-prefix nav.deploys should outrank action.start-deploy
    // (which only matches via "deploy" in label / keywords).
    expect(ids[0]).toBe("nav.deploys");
    expect(ids).toContain("action.start-deploy");
  });
});

// ── Recents (localStorage) ───────────────────────────────────────────

describe("recents persistence", () => {
  beforeEach(() => {
    installLocalStorage();
  });
  afterEach(() => {
    uninstallLocalStorage();
  });

  test("starts empty when storage is empty", () => {
    expect(getRecentCommandIds()).toEqual([]);
  });

  test("recordCommandUse adds an entry and persists under the right key", () => {
    recordCommandUse("nav.dashboard");
    expect(getRecentCommandIds()).toEqual(["nav.dashboard"]);
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    expect(raw).toBe(JSON.stringify(["nav.dashboard"]));
  });

  test("most recent command bubbles to the top", () => {
    recordCommandUse("a");
    recordCommandUse("b");
    recordCommandUse("a");
    expect(getRecentCommandIds()).toEqual(["a", "b"]);
  });

  test("recents cap at RECENT_MAX entries", () => {
    for (let i = 0; i < RECENT_MAX + 3; i++) recordCommandUse(`cmd${i}`);
    const recents = getRecentCommandIds();
    expect(recents).toHaveLength(RECENT_MAX);
    // Last recorded should be first.
    expect(recents[0]).toBe(`cmd${RECENT_MAX + 2}`);
  });

  test("ignores garbage in storage gracefully", () => {
    localStorage.setItem(RECENT_STORAGE_KEY, "not json");
    expect(getRecentCommandIds()).toEqual([]);
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify({ not: "an array" }));
    expect(getRecentCommandIds()).toEqual([]);
  });
});
