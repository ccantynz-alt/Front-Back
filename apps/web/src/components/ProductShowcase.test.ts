import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── ProductShowcase Smoke Test ──────────────────────────────────────
//
// Structural/source-level checks on the ecosystem grid. Bun's test
// runner does not boot a SolidJS render harness in this package, so we
// assert the shape of the file (exports, product list, polite copy,
// live + coming-soon badges, link-checker-safe hrefs) rather than the
// rendered DOM. When a runtime harness lands we will swap these for
// render tests.

const COMPONENT_PATH = resolve(import.meta.dir, "ProductShowcase.tsx");

describe("ProductShowcase — smoke", () => {
  test("component file exists", () => {
    expect(existsSync(COMPONENT_PATH)).toBe(true);
  });

  test("exports the named ProductShowcase component and PRODUCTS list", () => {
    const src = readFileSync(COMPONENT_PATH, "utf-8");
    expect(src).toContain("export function ProductShowcase");
    expect(src).toContain("export default ProductShowcase");
    expect(src).toContain("export const PRODUCTS");
  });

  test("exposes the ProductStatus union with live and coming-soon", () => {
    const src = readFileSync(COMPONENT_PATH, "utf-8");
    expect(src).toContain('export type ProductStatus = "live" | "coming-soon"');
  });

  test("lists all 8 ecosystem products in the expected order", () => {
    const src = readFileSync(COMPONENT_PATH, "utf-8");
    const expectedTitles = [
      "Hosting & Deploy",
      "Edge Database",
      "Authoritative DNS",
      "Domain Registration",
      "AI Runtime",
      "Real-Time",
      "SMS API",
      "eSIM API",
    ];
    let lastIdx = -1;
    for (const title of expectedTitles) {
      const idx = src.indexOf(`title: "${title}"`);
      expect(idx).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  test("every product deep-links to a real route", () => {
    const src = readFileSync(COMPONENT_PATH, "utf-8");
    // All eight product routes now exist on the web app; coming-soon
    // products still carry a soon badge but resolve to a page so the
    // link-checker stays at zero dead.
    for (const route of [
      "/deployments",
      "/database",
      "/dns",
      "/domains",
      "/chat",
      "/sms",
      "/esim",
    ]) {
      expect(src).toContain(`href: "${route}"`);
    }
    // No fallback anchors should remain in source.
    expect(src).not.toContain('href: "#sms');
    expect(src).not.toContain('href: "#dns');
  });

  test("each product declares an explicit live or coming-soon status", () => {
    const src = readFileSync(COMPONENT_PATH, "utf-8");
    const liveCount = (src.match(/status: "live"/g) ?? []).length;
    const soonCount = (src.match(/status: "coming-soon"/g) ?? []).length;
    expect(liveCount).toBe(6);
    expect(soonCount).toBe(2);
  });

  test("copy is polite and names no competitors", () => {
    const src = readFileSync(COMPONENT_PATH, "utf-8").toLowerCase();
    const fromCodes = (...codes: number[]): string =>
      String.fromCharCode(...codes);
    // Banned competitor names are assembled from char codes so this
    // guard itself does not ship the names in source.
    const bannedNames = [
      fromCodes(118, 101, 114, 99, 101, 108), // vercel
      fromCodes(99, 108, 111, 117, 100, 102, 108, 97, 114, 101), // cloudflare
      fromCodes(115, 117, 112, 97, 98, 97, 115, 101), // supabase
      fromCodes(99, 111, 110, 118, 101, 120), // convex
      fromCodes(110, 101, 116, 108, 105, 102, 121), // netlify
      fromCodes(114, 101, 110, 100, 101, 114), // render
    ];
    for (const name of bannedNames) {
      expect(src).not.toContain(name);
    }
    expect(src).not.toContain("crap");
    expect(src).not.toContain("garbage");
  });

  test("section title uses the locked polite headline", () => {
    const src = readFileSync(COMPONENT_PATH, "utf-8");
    expect(src).toContain("Everything one platform can be");
  });

  test("renders Coming soon and Live badges", () => {
    const src = readFileSync(COMPONENT_PATH, "utf-8");
    expect(src).toContain("Coming soon");
    // Live badge is rendered as a short label in a span.
    expect(src).toMatch(/>\s*Live\s*</);
  });
});
