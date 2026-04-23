// ── /docs/components/** — article smoke tests ────────────────────────
//
// Pins the shape of the four Components articles so a future session
// can't silently drop one back to "Coming soon" without turning the
// suite red. Mirrors the pattern established by the API Reference and
// Deployment categories.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMPONENTS_DIR = resolve(import.meta.dir, "components");

const ARTICLES = [
  { file: "index.tsx", href: "/docs/components" },
  { file: "catalog.tsx", href: "/docs/components/catalog" },
  { file: "ai-composable.tsx", href: "/docs/components/ai-composable" },
  { file: "customization.tsx", href: "/docs/components/customization" },
] as const;

describe("docs/components — four-article series", () => {
  test("every article file exists on disk", () => {
    for (const { file } of ARTICLES) {
      const abs = resolve(COMPONENTS_DIR, file);
      expect(existsSync(abs)).toBe(true);
    }
  });

  test("every article exports a default component", () => {
    for (const { file } of ARTICLES) {
      const src = readFileSync(resolve(COMPONENTS_DIR, file), "utf-8");
      expect(src.includes("export default function")).toBe(true);
    }
  });

  test("every article uses the shared DocsArticle shell", () => {
    for (const { file } of ARTICLES) {
      const src = readFileSync(resolve(COMPONENTS_DIR, file), "utf-8");
      expect(src).toContain("DocsArticle");
    }
  });

  test("every article declares the Components eyebrow", () => {
    for (const { file } of ARTICLES) {
      const src = readFileSync(resolve(COMPONENTS_DIR, file), "utf-8");
      expect(src).toContain('eyebrow="Components"');
    }
  });

  test("every article sets a canonical path via SEOHead matching its route", () => {
    for (const { file, href } of ARTICLES) {
      const src = readFileSync(resolve(COMPONENTS_DIR, file), "utf-8");
      expect(src).toContain(`path="${href}"`);
    }
  });

  test("every article is stamped Updated April 2026", () => {
    for (const { file } of ARTICLES) {
      const src = readFileSync(resolve(COMPONENTS_DIR, file), "utf-8");
      expect(src).toContain('updated="April 2026"');
    }
  });

  test("catalog references the real @back-to-the-future/ui import path", () => {
    const src = readFileSync(
      resolve(COMPONENTS_DIR, "catalog.tsx"),
      "utf-8",
    );
    expect(src).toContain("@back-to-the-future/ui");
    // Spot-check that the catalog names components that actually ship.
    for (const name of [
      "Button",
      "Input",
      "Card",
      "Stack",
      "Text",
      "Modal",
      "Badge",
      "Alert",
      "Avatar",
      "Tabs",
      "Select",
      "Textarea",
      "Spinner",
      "Tooltip",
      "Separator",
    ]) {
      expect(src).toContain(name);
    }
  });

  test("ai-composable names the real schema + renderer files", () => {
    const src = readFileSync(
      resolve(COMPONENTS_DIR, "ai-composable.tsx"),
      "utf-8",
    );
    expect(src).toContain("packages/schemas/src/components.ts");
    expect(src).toContain("apps/web/src/components/JsonRenderUI.tsx");
    expect(src).toContain("GenerativeUI.tsx");
  });

  test("customization teaches theme tokens, not component forks", () => {
    const src = readFileSync(
      resolve(COMPONENTS_DIR, "customization.tsx"),
      "utf-8",
    );
    expect(src).toContain("--color-primary");
    expect(src).toContain("--color-bg");
    expect(src).toContain("--color-text");
  });

  test("polite tone — no competitor names in components articles", () => {
    // Matches the regression guard on other docs categories: named
    // competitor brands must never appear in public docs copy. Char
    // codes keep this test's source itself clean.
    const fromCodes = (...codes: number[]): string =>
      String.fromCharCode(...codes);
    const banned = [
      ` ${fromCodes(118, 101, 114, 99, 101, 108)} `, // vercel
      ` ${fromCodes(110, 101, 116, 108, 105, 102, 121)} `, // netlify
      ` ${fromCodes(115, 117, 112, 97, 98, 97, 115, 101)} `, // supabase
      ` ${fromCodes(114, 101, 110, 100, 101, 114)} `, // render
    ];
    for (const { file } of ARTICLES) {
      const src = readFileSync(
        resolve(COMPONENTS_DIR, file),
        "utf-8",
      ).toLowerCase();
      for (const name of banned) {
        expect(src).not.toContain(name);
      }
    }
  });
});
