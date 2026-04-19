// Unit tests for the undo-toast pub/sub queue.
//
// We don't render the SolidJS component here (the rest of the web
// package does not ship a JSDOM harness). We test the queue's public
// behaviour directly: enqueuing fires `onTimeout` after the configured
// delay, dismissing cancels the timer, and the source file declares
// the accessibility + reduced-motion contract the UI relies on.

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  enqueueUndo,
  dismissUndo,
  _resetUndoToasts,
} from "./UndoToast";

const SOURCE = resolve(import.meta.dir, "UndoToast.tsx");

beforeEach(() => {
  _resetUndoToasts();
});

afterEach(() => {
  _resetUndoToasts();
});

describe("Undo toast queue — runtime", () => {
  test("onTimeout fires after the configured duration", async () => {
    let timed = 0;
    enqueueUndo({
      message: "x",
      durationMs: 20,
      onUndo: () => {},
      onTimeout: () => {
        timed += 1;
      },
    });
    await new Promise((r) => setTimeout(r, 60));
    expect(timed).toBe(1);
  });

  test("dismissUndo cancels the pending timeout", async () => {
    let timed = 0;
    const id = enqueueUndo({
      message: "x",
      durationMs: 30,
      onUndo: () => {},
      onTimeout: () => {
        timed += 1;
      },
    });
    dismissUndo(id);
    await new Promise((r) => setTimeout(r, 60));
    expect(timed).toBe(0);
  });

  test("multiple toasts stack independently", async () => {
    let aFired = 0;
    let bFired = 0;
    enqueueUndo({
      message: "A",
      durationMs: 15,
      onUndo: () => {},
      onTimeout: () => {
        aFired += 1;
      },
    });
    enqueueUndo({
      message: "B",
      durationMs: 25,
      onUndo: () => {},
      onTimeout: () => {
        bFired += 1;
      },
    });
    await new Promise((r) => setTimeout(r, 60));
    expect(aFired).toBe(1);
    expect(bFired).toBe(1);
  });

  test("onTimeout errors do not break the queue", async () => {
    let secondFired = false;
    enqueueUndo({
      message: "first",
      durationMs: 10,
      onUndo: () => {},
      onTimeout: () => {
        throw new Error("nope");
      },
    });
    enqueueUndo({
      message: "second",
      durationMs: 20,
      onUndo: () => {},
      onTimeout: () => {
        secondFired = true;
      },
    });
    await new Promise((r) => setTimeout(r, 60));
    expect(secondFired).toBe(true);
  });
});

describe("Undo toast — source contract", () => {
  test("source file exists", () => {
    expect(existsSync(SOURCE)).toBe(true);
  });

  test("declares role=status / aria-live=polite container", () => {
    const src = readFileSync(SOURCE, "utf-8");
    expect(src).toContain('role="status"');
    expect(src).toContain('aria-live="polite"');
  });

  test("respects prefers-reduced-motion", () => {
    const src = readFileSync(SOURCE, "utf-8");
    expect(src).toContain("prefers-reduced-motion");
  });

  test("renders an accessible Undo button per toast", () => {
    const src = readFileSync(SOURCE, "utf-8");
    expect(src).toContain('aria-label={`Undo:');
  });

  test("anchors to the bottom-right of the viewport", () => {
    const src = readFileSync(SOURCE, "utf-8");
    expect(src).toContain('bottom: "20px"');
    expect(src).toContain('right: "20px"');
  });
});
