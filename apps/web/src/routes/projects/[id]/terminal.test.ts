// ── /projects/[id]/terminal — Smoke Regression Guard ────────────────
//
// Pins the per-project web terminal surface: the route exists, ships a
// default component, is gated behind ProtectedRoute, mounts the shared
// Terminal component with the live :id param, carries no Math.random
// simulation, and keeps the polite-tone contract.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(import.meta.dir, "terminal.tsx");

describe("projects/[id]/terminal route — smoke", () => {
  test("route file exists", () => {
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });

  test("exports a default component", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // The component is declared as `function TerminalPage` and then
    // exported via `export default TerminalPage;` at the bottom.
    expect(src).toContain("export default TerminalPage");
  });

  test("is auth-gated via ProtectedRoute", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("ProtectedRoute");
    expect(src).toContain("<ProtectedRoute>");
  });

  test("reads the project id from the router via useParams", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("useParams");
    expect(src).toContain("params.id");
  });

  test("mounts the shared Terminal component with the live project id", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("<Terminal");
    expect(src).toContain("projectId={projectId()}");
  });

  test("no Math.random in executable code", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    const code = src
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toContain("Math.random");
  });

  test("ships SEO metadata with the canonical /projects/:id/terminal path", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("SEOHead");
    expect(src).toContain("/projects/${projectId()}/terminal");
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
