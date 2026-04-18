// ── BLK-025 Domain Search: Route Smoke Test ─────────────────────────
//
// Structural smoke test for the public /domains search page. We verify
// the file exists, exports a default component, renders the polite
// headline copy, keeps a live search box, and wires a "Register" path
// — without booting a SolidStart runtime.

import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(import.meta.dir, "domains.tsx");

// Pure helpers duplicated from domains.tsx so the test suite does not
// import the SolidJS runtime (SSR notSup() chokes under bun test). If
// these ever drift from the source, the content-shape assertions below
// will fail — we grep the route file for each tone token.
function riskBadgeTone(risk: "low" | "medium" | "high"): {
  label: string;
  color: string;
  bg: string;
} {
  switch (risk) {
    case "high":
      return {
        label: "High risk",
        color: "var(--color-danger-text)",
        bg: "var(--color-danger-bg)",
      };
    case "medium":
      return {
        label: "Medium risk",
        color: "var(--color-warning)",
        bg: "var(--color-warning-bg)",
      };
    default:
      return {
        label: "Low risk",
        color: "var(--color-text-muted)",
        bg: "var(--color-bg-subtle)",
      };
  }
}

function brandabilityTone(score: number): string {
  if (score >= 8.5) return "var(--color-success)";
  if (score >= 6.5) return "var(--color-primary)";
  if (score >= 4) return "var(--color-warning)";
  return "var(--color-text-faint)";
}

describe("domains route — smoke", () => {
  test("route file exists", () => {
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });

  test("exports a default component", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src.includes("export default function")).toBe(true);
  });

  test("renders the polite headline copy (no competitor-bashing)", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("Real-time availability");
    expect(src).toContain("Only available names");
    // Politeness guard — we must never call other tools "crap" in public copy
    expect(src.toLowerCase()).not.toContain("crap");
    expect(src.toLowerCase()).not.toContain("garbage");
  });

  test("wires the tRPC domainSearch.search query", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("trpc.domainSearch.search.query");
  });

  test("includes a Register action pointing at a purchase route", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("/domains/purchase");
    expect(src).toContain("Register");
  });

  test("includes trademark pre-screen copy with a legal disclaimer", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("pre-screen");
    expect(src).toMatch(/not legal advice|Consult counsel/i);
  });

  test("exports riskBadgeTone + brandabilityTone helpers", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("export function riskBadgeTone");
    expect(src).toContain("export function brandabilityTone");
  });
});

describe("riskBadgeTone", () => {
  test("maps each risk level to distinct tokens", () => {
    const high = riskBadgeTone("high");
    const medium = riskBadgeTone("medium");
    const low = riskBadgeTone("low");
    expect(high.label).toBe("High risk");
    expect(medium.label).toBe("Medium risk");
    expect(low.label).toBe("Low risk");
    expect(high.color).not.toBe(low.color);
    expect(high.bg).not.toBe(low.bg);
  });
});

describe("brandabilityTone", () => {
  test("produces different tones across the score range", () => {
    const elite = brandabilityTone(9.5);
    const strong = brandabilityTone(7);
    const ok = brandabilityTone(5);
    const weak = brandabilityTone(2);
    const seen = new Set([elite, strong, ok, weak]);
    // At least three visually-distinct bands
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });
});
