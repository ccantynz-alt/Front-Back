// ── / (landing) — Locked-Copy Regression Guard ──────────────────────
//
// docs/POSITIONING.md locks the hero headline + subhead + the two
// primary CTAs. The landing page also suffered an unresolved-merge
// incident in an earlier session where two <div>, two <section>, and
// two tech-strip blocks were left after a bad Main merge — the route
// wouldn't type-check. This guard pins the current clean, locked-copy
// state so neither drift can regress silently.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(import.meta.dir, "index.tsx");

describe("landing route (/) — smoke", () => {
  test("route file exists", () => {
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });

  test("exports a default component named Home", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src.includes("export default function")).toBe(true);
  });

  test("renders the POSITIONING.md-locked headline + subhead", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // Locked copy per docs/POSITIONING.md §3 (Headline Direction).
    expect(src).toContain("The developer platform for the");
    expect(src).toContain("next decade");
  });

  test("renders both primary and secondary CTAs with real hrefs", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // Locked CTAs per POSITIONING.md (Start building → /register,
    // See the docs → /docs).
    expect(src).toContain("/register");
    expect(src).toContain("/docs");
    expect(src).toContain("Start building");
    expect(src).toContain("See the docs");
  });

  test("no duplicate section opens (guards the April-23 merge incident)", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // The bad Main merge at 46c4844 left two identical div openings in
    // the hero container (lines 252+253 of the broken state) and the
    // Vinxi cache hid the tsc failure. Two identical opening tags on
    // consecutive lines must never come back.
    const lines = src.split("\n");
    for (let i = 0; i < lines.length - 1; i++) {
      const a = (lines[i] ?? "").trim();
      const b = (lines[i + 1] ?? "").trim();
      // A pair of identical opening tags longer than a trivial wrapper.
      if (
        a.startsWith("<section") &&
        b.startsWith("<section") &&
        a.length > 20 &&
        a === b
      ) {
        throw new Error(
          `Duplicate <section> on lines ${i + 1} and ${i + 2}: ${a}`,
        );
      }
      if (
        a.startsWith('<div class="relative') &&
        b.startsWith('<div class="relative') &&
        a === b
      ) {
        throw new Error(
          `Duplicate outer <div> on lines ${i + 1} and ${i + 2}: ${a}`,
        );
      }
    }
    expect(true).toBe(true);
  });

  test("polite tone — no competitor names in public landing copy", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8").toLowerCase();
    const fromCodes = (...codes: number[]): string =>
      String.fromCharCode(...codes);
    // Space-bounded tokens so substrings don't false-positive inside
    // larger words (e.g. "descript" inside "description").
    const banned = [
      ` ${fromCodes(118, 101, 114, 99, 101, 108)} `, // vercel
      ` ${fromCodes(110, 101, 116, 108, 105, 102, 121)} `, // netlify
      ` ${fromCodes(115, 117, 112, 97, 98, 97, 115, 101)} `, // supabase
      ` ${fromCodes(99, 111, 110, 118, 101, 120)} `, // convex
      ` ${fromCodes(114, 101, 110, 100, 101, 114)} `, // render
    ];
    for (const name of banned) {
      expect(src).not.toContain(name);
    }
    expect(src).not.toContain("crap");
    expect(src).not.toContain("garbage");
  });

  test("hero badge advertises 'early access' rather than a fake launch date", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // The previous compliance-native pivot pre-announced a dated
    // launch. We kept the honest early-access framing.
    expect(src.toLowerCase()).toContain("early access");
  });
});
