// ── /builder — Component Composer Regression Guard ────────────────
//
// /builder is the Component Composer (internal dev tool, NOT a
// customer-facing AI website builder per BLK-006). This guard pins
// the locked positioning + the gated collab UI.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(import.meta.dir, "builder.tsx");

describe("builder route — smoke", () => {
  test("route file exists", () => {
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });

  test("exports a default component", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src.includes("export default function")).toBe(true);
  });

  test("framed as 'Component Composer', NOT 'AI Website Builder'", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // BLK-006 (Composer) locks this framing. Non-scope per BUILD_BIBLE:
    // "Re-framing this route as 'AI Website Builder' or targeting
    // non-developers" — must never happen.
    expect(src).toContain("Component Composer");
    expect(src).not.toMatch(/<h[1-6][^>]*>[^<]*AI Website Builder</);
  });

  test("collab UI is gated off until BLK-011 ships", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // The isCollaborative gate was hardcoded false in commit c460e47
    // or earlier to hide the permanently-"Disconnected" UI until the
    // real Yjs + Durable Object transport lands.
    expect(src).toContain("isCollaborative = (): boolean => false");
  });

  test("compute-tier pill pulls from real detection, not hardcoded", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // The pill must call detectAndSetTier, not show a hardcoded tier.
    expect(src).toContain("detectAndSetTier");
  });

  test("polite tone — no competitor names", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8").toLowerCase();
    const fromCodes = (...codes: number[]): string =>
      String.fromCharCode(...codes);
    const banned = [
      ` ${fromCodes(118, 101, 114, 99, 101, 108)} `, // vercel
      ` ${fromCodes(99, 117, 114, 115, 111, 114)} `, // cursor
      ` ${fromCodes(99, 111, 112, 105, 108, 111, 116)} `, // copilot
    ];
    for (const name of banned) {
      expect(src).not.toContain(name);
    }
  });
});
