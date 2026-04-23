// ── /collab — Smoke Regression Guard ────────────────────────────────
//
// Pins the public collaboration landing surface: the route exists,
// ships a default component, is gated behind ProtectedRoute (the page
// lets users create rooms and jump into /builder), uses no fake
// simulation (no Math.random, no setTimeout theatre), and keeps the
// polite-tone contract with no competitor names.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(import.meta.dir, "collab.tsx");

describe("collab route — smoke", () => {
  test("route file exists", () => {
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });

  test("exports a default component", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src.includes("export default function")).toBe(true);
  });

  test("is auth-gated via ProtectedRoute", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("ProtectedRoute");
    expect(src).toContain("<ProtectedRoute>");
  });

  test("no Math.random in executable code", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    const code = src
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toContain("Math.random");
  });

  test("no setTimeout-faked submission theatre", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    const code = src
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    // The support page's old setTimeout(() => setSubmitted(true), 1200)
    // pattern must never appear on the collab page either.
    expect(code).not.toMatch(/setTimeout\([^)]*setSubmitted/);
  });

  test("ships SEO metadata with the canonical /collab path", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("SEOHead");
    expect(src).toContain('path="/collab"');
  });

  test("wires the Join button to the real /builder route", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // Rooms hand off into the builder with their id as a query param —
    // this is the real navigation, not a placeholder # link.
    expect(src).toContain("/builder?room=");
  });

  test("polite tone — no competitor names", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8").toLowerCase();
    const fromCodes = (...codes: number[]): string =>
      String.fromCharCode(...codes);
    const banned = [
      ` ${fromCodes(118, 101, 114, 99, 101, 108)} `, // vercel
      ` ${fromCodes(110, 101, 116, 108, 105, 102, 121)} `, // netlify
      ` ${fromCodes(115, 117, 112, 97, 98, 97, 115, 101)} `, // supabase
    ];
    for (const name of banned) {
      expect(src).not.toContain(name);
    }
    expect(src).not.toContain("cheaper than");
    expect(src).not.toContain("crap");
  });
});
