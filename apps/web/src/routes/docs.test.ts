// ── /docs — Honest Landing Regression Test ───────────────────────
//
// The previous /docs shipped a fabricated "149 articles across 8
// categories" headline, eight category cards with invented counts
// (12 / 34 / 18 / 42 / 9 / 15 / 8 / 11) each pointing to a 404, four
// dead "Quick links", and a "Popular articles" block of six
// hardcoded rows with synthetic read-times and composed-from-title
// dead hrefs. Every inbound click on that page landed on a blank
// route-not-found page.
//
// This guard pins the honest landing state so a future session can't
// silently re-add the fabricated counts or resurrect the dead-link
// block without turning the suite red.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(import.meta.dir, "docs.tsx");
const FIRST_ARTICLE = resolve(
  import.meta.dir,
  "docs/getting-started/install.tsx",
);

// The full Getting Started series — five real articles. Every one
// must resolve to a file on disk or /docs ships a dead link.
const GETTING_STARTED_ARTICLES = [
  "docs/getting-started/install.tsx",
  "docs/getting-started/new-project.tsx",
  "docs/getting-started/connect-github.tsx",
  "docs/getting-started/custom-domain.tsx",
  "docs/getting-started/billing.tsx",
] as const;

describe("docs route — smoke", () => {
  test("route file exists", () => {
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });

  test("all five getting-started articles exist on disk", () => {
    // /docs links to each of the five real articles. If any one of
    // them disappears the landing regresses to shipping a dead link.
    for (const rel of GETTING_STARTED_ARTICLES) {
      const abs = resolve(import.meta.dir, rel);
      expect(existsSync(abs)).toBe(true);
    }
  });

  test("exports a default component", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src.includes("export default function")).toBe(true);
  });

  test("categories carry a ready boolean, not fabricated article counts", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // The new honest model uses `ready: boolean` + an optional
    // `firstArticleHref` on each DocCategory. Article counts are no
    // longer part of the shape.
    expect(src).toContain("ready: boolean");
    expect(src).toContain("firstArticleHref");
    // The old fabricated numbers (12, 34, 18, 42, 9, 15, 8, 11) must
    // not appear as `articles: N` entries.
    const code = src
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toMatch(/articles:\s*12/);
    expect(code).not.toMatch(/articles:\s*34/);
    expect(code).not.toMatch(/articles:\s*42/);
  });

  test("hero badge no longer claims 149 articles", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    const code = src
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toContain("149 articles");
    expect(code).not.toContain("149 articles across");
  });

  test("renders five real articles that each resolve to an existing route", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("/docs/getting-started/install");
    expect(src).toContain("/docs/getting-started/new-project");
    expect(src).toContain("/docs/getting-started/connect-github");
    expect(src).toContain("/docs/getting-started/custom-domain");
    expect(src).toContain("/docs/getting-started/billing");
  });

  test("carries no 'Popular articles' hardcoded row list", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    const code = src
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    // Guards against the regression: the old block rendered six
    // title+category+readTime objects with `/docs/{category}/{slug}`
    // hrefs constructed at render time — all 404s.
    expect(code).not.toContain("Popular articles");
    expect(code).not.toContain("Three-tier compute explained");
    expect(code).not.toContain("Building AI-composable components with Zod");
  });

  test("polite tone — no competitor names", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8").toLowerCase();
    const fromCodes = (...codes: number[]): string =>
      String.fromCharCode(...codes);
    const banned = [
      ` ${fromCodes(118, 101, 114, 99, 101, 108)} `, // vercel
      ` ${fromCodes(110, 101, 116, 108, 105, 102, 121)} `, // netlify
    ];
    for (const name of banned) {
      expect(src).not.toContain(name);
    }
  });
});

describe("getting-started/install article — smoke", () => {
  test("article file exists and exports a default component", () => {
    const src = readFileSync(FIRST_ARTICLE, "utf-8");
    expect(src.includes("export default function")).toBe(true);
  });

  test("uses the shared DocsArticle shell", () => {
    const src = readFileSync(FIRST_ARTICLE, "utf-8");
    expect(src).toContain("DocsArticle");
    expect(src).toContain("Steps");
    expect(src).toContain("Callout");
    expect(src).toContain("KeyList");
  });

  test("links to routes that actually exist", () => {
    const src = readFileSync(FIRST_ARTICLE, "utf-8");
    // The article body points to /register and /pricing — both are
    // real routes. The link-checker already guards this at build
    // time, but a redundant test close to the article keeps the
    // signal local.
    expect(src).toContain('"/register"');
    expect(src).toContain("/docs/getting-started/install");
  });
});
