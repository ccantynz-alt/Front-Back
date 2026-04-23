// ── /docs/guides/* — Guides category smoke tests ─────────────────────
//
// Pins the shape of the Guides category so a future session can't
// silently drop one back to "Coming soon" without turning the suite
// red. Mirrors the pattern established by the Deployment and API
// Reference tests.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const GUIDES_DIR = resolve(import.meta.dir, "guides");

const ARTICLES = [
  { file: "index.tsx", href: "/docs/guides" },
  { file: "build-a-saas.tsx", href: "/docs/guides/build-a-saas" },
  { file: "integrate-stripe.tsx", href: "/docs/guides/integrate-stripe" },
] as const;

describe("docs/guides — three-article series", () => {
  test("every article file exists on disk", () => {
    for (const { file } of ARTICLES) {
      expect(existsSync(resolve(GUIDES_DIR, file))).toBe(true);
    }
  });

  test("every article exports a default component", () => {
    for (const { file } of ARTICLES) {
      const src = readFileSync(resolve(GUIDES_DIR, file), "utf-8");
      expect(src.includes("export default function")).toBe(true);
    }
  });

  test("every article uses the shared DocsArticle shell", () => {
    for (const { file } of ARTICLES) {
      const src = readFileSync(resolve(GUIDES_DIR, file), "utf-8");
      expect(src).toContain("DocsArticle");
    }
  });

  test("every article declares the Guides eyebrow", () => {
    for (const { file } of ARTICLES) {
      const src = readFileSync(resolve(GUIDES_DIR, file), "utf-8");
      expect(src).toContain('eyebrow="Guides"');
    }
  });

  test("every article sets a canonical path via SEOHead matching its route", () => {
    for (const { file, href } of ARTICLES) {
      const src = readFileSync(resolve(GUIDES_DIR, file), "utf-8");
      expect(src).toContain(`path="${href}"`);
    }
  });

  test("polite tone — no competitor names in guides articles", () => {
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
        resolve(GUIDES_DIR, file),
        "utf-8",
      ).toLowerCase();
      for (const name of banned) {
        expect(src).not.toContain(name);
      }
    }
  });

  test("integrate-stripe is honest about the STRIPE_ENABLED flag", () => {
    const src = readFileSync(
      resolve(GUIDES_DIR, "integrate-stripe.tsx"),
      "utf-8",
    );
    // If a future session removes the STRIPE_ENABLED honesty, the
    // suite fails — the article must reflect the real gating in
    // apps/api/src/stripe/client.ts.
    expect(src).toContain("STRIPE_ENABLED");
    expect(src).toContain("STRIPE_WEBHOOK_SECRET");
  });

  test("build-a-saas cross-links to shipped reference articles", () => {
    const src = readFileSync(
      resolve(GUIDES_DIR, "build-a-saas.tsx"),
      "utf-8",
    );
    // The guide must stitch together real articles from other
    // categories. If any of these cross-links are removed, it
    // stops being a guide and starts being a silo.
    expect(src).toContain("/docs/getting-started/install");
    expect(src).toContain("/docs/deployment/how-a-deploy-runs");
    expect(src).toContain("/docs/api-reference/auth");
    expect(src).toContain("/docs/guides/integrate-stripe");
  });
});
