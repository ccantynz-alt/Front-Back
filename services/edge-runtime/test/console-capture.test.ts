// ── ConsoleCapture primitive tests ──────────────────────────────────
// The capture surface must:
//   * Mirror the Console interface so customer code "just works".
//   * Capture every log/warn/error/info/debug call into a snapshot.
//   * Cap by lines and bytes so a runaway log loop cannot blow memory.
//   * Format primitives + objects + Errors the way Node does.

import { describe, expect, test } from "bun:test";
import { ConsoleCapture, formatArgs } from "../src/console-capture";

describe("formatArgs", () => {
  test("renders primitives the same way String() would", () => {
    expect(formatArgs(["hello", 1, true, null, undefined])).toBe(
      "hello 1 true null undefined",
    );
  });

  test("serialises plain objects as JSON", () => {
    expect(formatArgs([{ a: 1 }])).toBe('{"a":1}');
  });

  test("renders Error stacks", () => {
    const err = new Error("kaboom");
    const out = formatArgs([err]);
    expect(out).toContain("kaboom");
  });

  test("falls back gracefully on circular structures", () => {
    const obj: { self?: unknown } = {};
    obj.self = obj;
    expect(formatArgs([obj])).toBe("[Circular]");
  });
});

describe("ConsoleCapture", () => {
  test("captures each level into the snapshot", () => {
    const cap = new ConsoleCapture();
    const c = cap.asConsole();
    c.log("a");
    c.warn("b");
    c.error("c");
    c.info("d");
    c.debug("e");
    const snap = cap.snapshot();
    expect(snap.lines.map((l) => l.level)).toEqual([
      "log",
      "warn",
      "error",
      "info",
      "debug",
    ]);
    expect(snap.lines.map((l) => l.message)).toEqual(["a", "b", "c", "d", "e"]);
  });

  test("respects the maxLines cap and reports drops", () => {
    const cap = new ConsoleCapture({ maxLines: 2 });
    const c = cap.asConsole();
    c.log("1");
    c.log("2");
    c.log("3");
    c.log("4");
    const snap = cap.snapshot();
    expect(snap.lines).toHaveLength(2);
    expect(snap.dropped).toBe(2);
  });

  test("respects the maxBytes cap", () => {
    const cap = new ConsoleCapture({ maxBytes: 10 });
    const c = cap.asConsole();
    c.log("12345");
    c.log("12345");
    c.log("12345");
    const snap = cap.snapshot();
    // Two fit in the 10-byte budget; the third trips the byte cap.
    expect(snap.lines).toHaveLength(2);
    expect(snap.dropped).toBe(1);
    expect(snap.droppedBytes).toBe(5);
  });

  test("snapshot is defensive — caller mutation does not corrupt internal state", () => {
    const cap = new ConsoleCapture();
    cap.asConsole().log("first");
    const snap = cap.snapshot();
    (snap.lines as unknown as unknown[]).length = 0;
    expect(cap.snapshot().lines).toHaveLength(1);
  });

  test("destructured methods still capture", () => {
    const cap = new ConsoleCapture();
    const { log } = cap.asConsole();
    log("detached");
    expect(cap.snapshot().lines[0]?.message).toBe("detached");
  });

  test("assert(false) records an error line; assert(true) records nothing", () => {
    const cap = new ConsoleCapture();
    const c = cap.asConsole();
    c.assert(true, "fine");
    c.assert(false, "broken");
    const snap = cap.snapshot();
    expect(snap.lines).toHaveLength(1);
    expect(snap.lines[0]?.level).toBe("error");
    expect(snap.lines[0]?.message).toContain("broken");
  });
});
