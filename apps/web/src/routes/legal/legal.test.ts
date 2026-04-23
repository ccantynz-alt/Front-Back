// ── /legal/* — Legal Pages Regression Guard ────────────────────────
//
// Eight legal pages live under apps/web/src/routes/legal/. They're
// reviewed by Craig's counsel (see docs/legal/attorney-package.md and
// docs/legal/pre-launch-audit.md). We don't need deep assertions on
// their prose — that's attorney territory — but we DO need a guard
// that every one exists, exports a default component, and doesn't
// silently become an empty shell after a bad merge.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DIR = import.meta.dir;

// Every legal page that has shipped. If you add a new one, add it here.
const LEGAL_PAGES = [
  "acceptable-use.tsx",
  "ai-disclosure.tsx",
  "beta-disclaimer.tsx",
  "cookies.tsx",
  "dmca.tsx",
  "privacy.tsx",
  "sla.tsx",
  "terms.tsx",
] as const;

describe("legal routes — smoke", () => {
  for (const page of LEGAL_PAGES) {
    describe(page, () => {
      const path = resolve(DIR, page);

      test("file exists", () => {
        expect(existsSync(path)).toBe(true);
      });

      test("exports a default component", () => {
        const src = readFileSync(path, "utf-8");
        expect(src.includes("export default function")).toBe(true);
      });

      test("renders substantive prose (not an empty shell)", () => {
        const src = readFileSync(path, "utf-8");
        // Guard against a legal page becoming an empty placeholder:
        // the source must be at least 1KB of actual content.
        expect(src.length).toBeGreaterThan(1024);
      });

      test("has a page-level title / header", () => {
        const src = readFileSync(path, "utf-8");
        // Every legal page must carry an h1 or a document title.
        // This catches the regression where a legal page loses its
        // header during a refactor.
        const hasTitle =
          /<h1[\s>]/.test(src) ||
          /<Title>/.test(src) ||
          /SEOHead[\s\S]*title=/.test(src);
        expect(hasTitle).toBe(true);
      });
    });
  }

  test("no legal page silently names competitors (POSITIONING.md §2)", () => {
    // Legal pages talk about platforms generically. Competitor names
    // in legal copy is worse than marketing copy — it creates
    // defamation risk and attorney objection.
    for (const page of LEGAL_PAGES) {
      const src = readFileSync(resolve(DIR, page), "utf-8").toLowerCase();
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
    }
  });
});
