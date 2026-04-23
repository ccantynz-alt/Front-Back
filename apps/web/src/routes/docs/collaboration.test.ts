// ── /docs/collaboration/* — category smoke tests ─────────────────────
//
// Pins the shape of the Collaboration category so a future session
// can't silently drop one back to "Coming soon" without turning the
// suite red.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const COLLAB_DIR = resolve(import.meta.dir, "collaboration");

const ARTICLES = [
  { file: "index.tsx", href: "/docs/collaboration" },
  { file: "yjs-crdts.tsx", href: "/docs/collaboration/yjs-crdts" },
  {
    file: "presence-and-cursors.tsx",
    href: "/docs/collaboration/presence-and-cursors",
  },
] as const;

describe("docs/collaboration — three-article series", () => {
  test("every article file exists on disk", () => {
    for (const { file } of ARTICLES) {
      expect(existsSync(resolve(COLLAB_DIR, file))).toBe(true);
    }
  });

  test("every article exports a default component", () => {
    for (const { file } of ARTICLES) {
      const src = readFileSync(resolve(COLLAB_DIR, file), "utf-8");
      expect(src.includes("export default function")).toBe(true);
    }
  });

  test("every article uses the shared DocsArticle shell", () => {
    for (const { file } of ARTICLES) {
      const src = readFileSync(resolve(COLLAB_DIR, file), "utf-8");
      expect(src).toContain("DocsArticle");
    }
  });

  test("every article declares the Collaboration eyebrow", () => {
    for (const { file } of ARTICLES) {
      const src = readFileSync(resolve(COLLAB_DIR, file), "utf-8");
      expect(src).toContain('eyebrow="Collaboration"');
    }
  });

  test("every article sets a canonical path via SEOHead matching its route", () => {
    for (const { file, href } of ARTICLES) {
      const src = readFileSync(resolve(COLLAB_DIR, file), "utf-8");
      expect(src).toContain(`path="${href}"`);
    }
  });

  test("polite tone — no competitor names in collaboration articles", () => {
    const fromCodes = (...codes: number[]): string =>
      String.fromCharCode(...codes);
    const banned = [
      ` ${fromCodes(118, 101, 114, 99, 101, 108)} `, // vercel
      ` ${fromCodes(110, 101, 116, 108, 105, 102, 121)} `, // netlify
      ` ${fromCodes(115, 117, 112, 97, 98, 97, 115, 101)} `, // supabase
      // Note: "render" is omitted because it collides with common
      // English usage ("cursor rendering", "browser render target"),
      // producing false positives. If the competitor "Render" needs a
      // guard, use "replaces Render" / "beat Render" framing checks.
    ];
    for (const { file } of ARTICLES) {
      const src = readFileSync(
        resolve(COLLAB_DIR, file),
        "utf-8",
      ).toLowerCase();
      for (const name of banned) {
        expect(src).not.toContain(name);
      }
    }
  });

  test("yjs-crdts cites the real apps/api realtime implementation", () => {
    const src = readFileSync(
      resolve(COLLAB_DIR, "yjs-crdts.tsx"),
      "utf-8",
    );
    // Must reference the actual file + Yjs primitives used there.
    // If a future session waters this down to generic prose, the
    // suite catches it.
    expect(src).toContain("yjs-server.ts");
    expect(src).toContain("Y.encodeStateAsUpdate");
    expect(src).toContain("Y.applyUpdate");
    expect(src).toContain("/api/yjs/:roomId");
  });

  test("presence-and-cursors cites the real room manager and message types", () => {
    const src = readFileSync(
      resolve(COLLAB_DIR, "presence-and-cursors.tsx"),
      "utf-8",
    );
    expect(src).toContain("websocket.ts");
    expect(src).toContain("rooms.ts");
    expect(src).toContain("types.ts");
    // The honest bounds the manager enforces.
    expect(src).toContain("100 users per room");
    expect(src).toContain("30-second heartbeat");
  });
});
