// ── /docs/security/* — category smoke tests ──────────────────────────
//
// Pins the shape of the Security & Auth category so a future session
// can't silently drop one back to "Coming soon" without turning the
// suite red.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const SECURITY_DIR = resolve(import.meta.dir, "security");

const ARTICLES = [
  { file: "index.tsx", href: "/docs/security" },
  { file: "authentication.tsx", href: "/docs/security/authentication" },
  {
    file: "audit-and-compliance.tsx",
    href: "/docs/security/audit-and-compliance",
  },
] as const;

describe("docs/security — three-article series", () => {
  test("every article file exists on disk", () => {
    for (const { file } of ARTICLES) {
      expect(existsSync(resolve(SECURITY_DIR, file))).toBe(true);
    }
  });

  test("every article exports a default component", () => {
    for (const { file } of ARTICLES) {
      const src = readFileSync(resolve(SECURITY_DIR, file), "utf-8");
      expect(src.includes("export default function")).toBe(true);
    }
  });

  test("every article uses the shared DocsArticle shell", () => {
    for (const { file } of ARTICLES) {
      const src = readFileSync(resolve(SECURITY_DIR, file), "utf-8");
      expect(src).toContain("DocsArticle");
    }
  });

  test("every article declares the Security & Auth eyebrow", () => {
    for (const { file } of ARTICLES) {
      const src = readFileSync(resolve(SECURITY_DIR, file), "utf-8");
      expect(src).toContain('eyebrow="Security & Auth"');
    }
  });

  test("every article sets a canonical path via SEOHead matching its route", () => {
    for (const { file, href } of ARTICLES) {
      const src = readFileSync(resolve(SECURITY_DIR, file), "utf-8");
      expect(src).toContain(`path="${href}"`);
    }
  });

  test("polite tone — no competitor names in security articles", () => {
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
        resolve(SECURITY_DIR, file),
        "utf-8",
      ).toLowerCase();
      for (const name of banned) {
        expect(src).not.toContain(name);
      }
    }
  });

  test("authentication article cites the real apps/api/src/auth implementation", () => {
    const src = readFileSync(
      resolve(SECURITY_DIR, "authentication.tsx"),
      "utf-8",
    );
    // Each of the three providers must be anchored to a real file.
    expect(src).toContain("apps/api/src/auth/webauthn.ts");
    expect(src).toContain("apps/api/src/auth/google-oauth.ts");
    expect(src).toContain("apps/api/src/auth/password.ts");
    expect(src).toContain("apps/api/src/auth/session.ts");
    expect(src).toContain("@simplewebauthn/server");
    expect(src).toContain("argon2id");
  });

  test("audit-and-compliance reflects CLAUDE.md §5A honestly", () => {
    const src = readFileSync(
      resolve(SECURITY_DIR, "audit-and-compliance.tsx"),
      "utf-8",
    );
    // The article must name the compliance primitives from §5A and
    // be honest about the SOC 2 status.
    expect(src).toContain("SHA-256");
    expect(src).toContain("TLS 1.3");
    expect(src).toContain("AES-256");
    expect(src).toContain("SOC 2");
    // "in motion" rather than "certified" is the honest posture.
    expect(src).toContain("in motion");
  });
});
