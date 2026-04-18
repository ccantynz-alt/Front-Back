import { describe, test, expect } from "bun:test";
import { createShellState, processCommand } from "./handler";

// ── Terminal handler tests ──────────────────────────────────────────
// Green-ecosystem rule (CLAUDE.md §1 ZERO BROKEN ANYTHING): no
// "coming soon" placeholder text may ship to production. These tests
// lock in a degraded-state message the user can actually act on, and
// prevent the placeholder from returning via a drive-by edit.

describe("Terminal: help output hygiene (green ecosystem)", () => {
  test("help output does NOT contain 'coming soon' placeholder text", () => {
    const state = createShellState("test-project");
    const output = processCommand("help", state);
    expect(output.toLowerCase()).not.toContain("coming soon");
  });

  test("help output surfaces a real degraded-state message for PTY", () => {
    const state = createShellState("test-project");
    const output = processCommand("help", state);
    // The user needs to know the feature is unavailable and what to
    // do about it — not that it's "coming soon".
    expect(output).toContain("PTY is currently unavailable");
    expect(output).toContain("Contact support");
  });

  test("help output includes the core mock-shell commands", () => {
    const state = createShellState("test-project");
    const output = processCommand("help", state);
    // Sanity: the help text still renders the command list.
    for (const cmd of ["pwd", "cat", "echo", "env", "whoami", "help", "exit"]) {
      expect(output).toContain(cmd);
    }
  });
});

describe("Terminal: basic command wiring", () => {
  test("pwd returns the project cwd", () => {
    const state = createShellState("alpha");
    const output = processCommand("pwd", state);
    expect(output).toContain("/home/user/projects/alpha");
  });

  test("unknown command returns 'command not found'", () => {
    const state = createShellState("alpha");
    const output = processCommand("definitely-not-a-real-cmd", state);
    expect(output).toContain("command not found");
  });
});
