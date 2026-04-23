// ── /pricing — Locked-Tier Regression Guard ─────────────────────────
//
// Pricing changes are a CLAUDE.md §0.7 HARD GATE — they require
// Craig's explicit in-chat authorization. This guard pins the
// currently-shipped tier structure (Free / Pro / Enterprise), their
// dollar prices, and the "Join waitlist" CTA on the Free tier so an
// agent can't silently rewrite plan pricing through a drive-by edit.
//
// If Craig wants to change pricing, this test will turn red and the
// change will be visible in the PR diff — exactly what the §0.7 gate
// is designed to enforce.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(import.meta.dir, "pricing.tsx");

describe("pricing route — smoke", () => {
  test("route file exists", () => {
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });

  test("exports a default component", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src.includes("export default function")).toBe(true);
  });

  test("ships the three tier names in expected order", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    const freeIdx = src.indexOf('name: "Free"');
    const proIdx = src.indexOf('name: "Pro"');
    const entIdx = src.indexOf('name: "Enterprise"');
    expect(freeIdx).toBeGreaterThan(0);
    expect(proIdx).toBeGreaterThan(freeIdx);
    expect(entIdx).toBeGreaterThan(proIdx);
  });

  test("locks Pro at $29/mo (monthly) and $24/mo (annual)", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // The two numbers live in a single PlanTier object. Any change
    // here is a §0.7 pricing change and needs Craig's auth.
    expect(src).toContain("monthlyPrice: 29");
    expect(src).toContain("annualPrice: 24");
  });

  test("Free tier CTA uses honest 'Join waitlist' language, not 'Start building'", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // We don't open free signups before Stripe goes live — Free CTA
    // joins a waitlist.
    expect(src).toContain('ctaLabel: "Join waitlist"');
  });

  test("registers the free plan CTA to the canonical /register?plan=free link", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("/register?plan=free");
  });

  test("enterprise CTA routes to /support?topic=enterprise (no fake phone / calendar widget)", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("/support?topic=enterprise");
    expect(src).not.toContain("calendly");
    expect(src).not.toContain("tel:+");
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
