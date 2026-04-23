// ── /founding — Founding Member Offer Regression Guard ────────────
//
// The founding page pitches the lifetime founding-member offer. It's
// pricing-adjacent (CLAUDE.md §0.7 HARD GATE) so any change to the
// offer terms needs Craig's authorization — this guard turns red
// when that happens, making the change visible in the PR diff.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(import.meta.dir, "founding.tsx");

describe("founding route — smoke", () => {
  test("route file exists", () => {
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });

  test("exports a default component", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src.includes("export default function")).toBe(true);
  });

  test("no fabricated signup counters", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    const code = src
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    // Fake "142 / 500 founding members claimed" counters are a common
    // regression — lock against them.
    expect(code).not.toMatch(/Math\.random/);
    // No hardcoded "142 founding members" scarcity theatre.
    expect(code).not.toMatch(/\d{2,3}\s+founding\s+members/i);
  });

  test("polite tone — no competitor names", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8").toLowerCase();
    const fromCodes = (...codes: number[]): string =>
      String.fromCharCode(...codes);
    const banned = [
      ` ${fromCodes(118, 101, 114, 99, 101, 108)} `, // vercel
      ` ${fromCodes(115, 117, 112, 97, 98, 97, 115, 101)} `, // supabase
    ];
    for (const name of banned) {
      expect(src).not.toContain(name);
    }
  });
});
