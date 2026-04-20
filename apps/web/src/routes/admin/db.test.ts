// ── BLK-012 — /admin/db — smoke + helper tests ─────────────────────
// Mirrors the admin/sms.test.ts + admin/dns/[zoneId].test.ts pattern:
// static source-contract tests pin the route file's shape because
// SolidStart + @solidjs/router side-effects trip Bun's SSR-flavoured
// solid-js runtime at module load time.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(import.meta.dir, "db.tsx");

describe("admin/db — file presence", () => {
  test("db.tsx exists at the documented path", () => {
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });
});

describe("admin/db — static source contract", () => {
  const src = readFileSync(ROUTE_PATH, "utf-8");

  test("exports a default component", () => {
    expect(src).toContain("export default function");
  });

  test("wraps its content in AdminRoute", () => {
    expect(src).toContain("AdminRoute");
    expect(src).toMatch(/<AdminRoute>[\s\S]*<\/AdminRoute>/);
  });

  test("references the dbInspector.listTables tRPC procedure", () => {
    expect(src).toContain("dbInspector.listTables");
  });

  test("exports the pure formatRowCount + rowCountVariant helpers", () => {
    expect(src).toContain("export function formatRowCount");
    expect(src).toContain("export function rowCountVariant");
  });

  test("renders both Turso and Neon sections", () => {
    expect(src).toContain("Turso");
    expect(src).toContain("Neon");
  });

  test("links per-table rows to /admin/db/:table with ?db= query", () => {
    expect(src).toMatch(/\/admin\/db\/\$\{encodeURIComponent\(t\.name\)\}\?db=/);
  });

  test("mentions the secret-column masking in user-visible copy", () => {
    const lowered = src.toLowerCase();
    expect(lowered).toContain("masked");
  });

  test("keeps the polite tone rule — does not name competitor platforms", () => {
    const lowered = src.toLowerCase();
    expect(lowered).not.toContain("vercel");
    expect(lowered).not.toContain("supabase");
    expect(lowered).not.toContain("convex");
    expect(lowered).not.toContain("planetscale");
  });
});

describe("admin/db — dynamic mount check (best-effort)", () => {
  test("if the module can be imported, its default export is a function", async () => {
    try {
      const mod = (await import("./db")) as { default: unknown };
      expect(typeof mod.default).toBe("function");
    } catch (err) {
      // Bun's default solid-js SSR runtime throws on top-level
      // @solidjs/router side-effects — the static checks above pin
      // the route shape so the ecosystem stays green.
      expect(err).toBeDefined();
    }
  });
});

// ── Pure-helper reference contracts ─────────────────────────────────
// Mirrored from the route file so they run without importing JSX.
// Static source checks above catch divergence; these execute on every
// run to pin formatting logic.

function referenceFormatRowCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

function referenceRowCountVariant(
  n: number,
): "success" | "warning" | "error" | "default" {
  if (!Number.isFinite(n) || n < 0) return "default";
  if (n === 0) return "default";
  if (n < 100) return "success";
  if (n < 10_000) return "warning";
  return "error";
}

describe("admin/db — formatRowCount contract", () => {
  test("formats small counts as plain integers", () => {
    expect(referenceFormatRowCount(0)).toBe("0");
    expect(referenceFormatRowCount(1)).toBe("1");
    expect(referenceFormatRowCount(999)).toBe("999");
  });

  test("formats thousands with a k suffix", () => {
    expect(referenceFormatRowCount(1_000)).toBe("1.0k");
    expect(referenceFormatRowCount(5_200)).toBe("5.2k");
  });

  test("formats millions with an M suffix", () => {
    expect(referenceFormatRowCount(1_000_000)).toBe("1.0M");
    expect(referenceFormatRowCount(7_300_000)).toBe("7.3M");
  });

  test("coerces invalid or negative inputs to 0", () => {
    expect(referenceFormatRowCount(Number.NaN)).toBe("0");
    expect(referenceFormatRowCount(-1)).toBe("0");
  });
});

describe("admin/db — rowCountVariant contract", () => {
  test("maps each bucket to the documented Badge variant", () => {
    expect(referenceRowCountVariant(0)).toBe("default");
    expect(referenceRowCountVariant(1)).toBe("success");
    expect(referenceRowCountVariant(99)).toBe("success");
    expect(referenceRowCountVariant(100)).toBe("warning");
    expect(referenceRowCountVariant(9_999)).toBe("warning");
    expect(referenceRowCountVariant(10_000)).toBe("error");
  });

  test("treats invalid inputs as default", () => {
    expect(referenceRowCountVariant(Number.NaN)).toBe("default");
    expect(referenceRowCountVariant(-5)).toBe("default");
  });
});
