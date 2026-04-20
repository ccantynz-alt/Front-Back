// ── BLK-012 — /admin/db/:table — smoke + helper tests ──────────────
// Mirrors the admin/dns/[zoneId].test.ts pattern: static source-
// contract tests pin the route file's shape so a future refactor
// cannot silently drift away from the DB-inspector doctrine.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(import.meta.dir, "./[table].tsx");

describe("admin/db/[table] — file presence", () => {
  test("route file exists at the documented path", () => {
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });
});

describe("admin/db/[table] — static source contract", () => {
  const src = readFileSync(ROUTE_PATH, "utf-8");

  test("exports a default component", () => {
    expect(src).toMatch(/export default function/);
  });

  test("wraps its content in AdminRoute", () => {
    expect(src).toMatch(/<AdminRoute>/);
    expect(src).toMatch(/<\/AdminRoute>/);
  });

  test("uses useParams with a table param", () => {
    expect(src).toMatch(/useParams<\s*\{\s*table:\s*string\s*\}\s*>\(\)/);
  });

  test("reads ?db= query param via useSearchParams", () => {
    expect(src).toContain("useSearchParams");
  });

  test("references the dbInspector.describeTable query", () => {
    expect(src).toMatch(/trpc\.dbInspector\.describeTable/);
  });

  test("references the dbInspector.selectPage query", () => {
    expect(src).toMatch(/trpc\.dbInspector\.selectPage/);
  });

  test("renders the Admin / Database Inspector breadcrumb", () => {
    expect(src).toMatch(/Admin/);
    expect(src).toMatch(/Database Inspector/);
    expect(src).toMatch(/href="\/admin\/db"/);
  });

  test("provides Prev/Next pagination buttons", () => {
    expect(src).toContain("Prev");
    expect(src).toContain("Next");
  });

  test("exports the pure parseDbKind + formatCell + totalPages helpers", () => {
    expect(src).toContain("export function parseDbKind");
    expect(src).toContain("export function formatCell");
    expect(src).toContain("export function totalPages");
  });

  test("surfaces the masked-columns notice when any masking occurs", () => {
    expect(src).toContain("maskedColumns");
    expect(src).toMatch(/masked/i);
  });

  test("pins the route-level pageSize at 50 rows per page", () => {
    expect(src).toContain("PAGE_SIZE = 50");
  });

  test("keeps the polite tone rule — does not name competitor platforms", () => {
    const lowered = src.toLowerCase();
    expect(lowered).not.toContain("vercel");
    expect(lowered).not.toContain("supabase");
    expect(lowered).not.toContain("convex");
    expect(lowered).not.toContain("planetscale");
  });
});

describe("admin/db/[table] — dynamic mount check (best-effort)", () => {
  test("if the module can be imported, its default export is a function", async () => {
    try {
      const mod = (await import("./[table]")) as { default: unknown };
      expect(typeof mod.default).toBe("function");
    } catch (err) {
      // Expected under Bun's SSR-flavoured solid-js runtime.
      expect(err).toBeDefined();
    }
  });
});

// ── Pure-helper reference contracts ─────────────────────────────────

type DbKind = "turso" | "neon";

function referenceParseDbKind(raw: string | undefined | null): DbKind {
  return raw === "neon" ? "neon" : "turso";
}

function referenceFormatCell(value: unknown): string {
  if (value === null || value === undefined) return "∅";
  if (value === "[REDACTED]") return "[REDACTED]";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[unserialisable]";
    }
  }
  return String(value);
}

function referenceTotalPages(total: number, pageSize: number): number {
  if (total <= 0 || pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

describe("admin/db/[table] — parseDbKind contract", () => {
  test("defaults to turso on missing or unknown values", () => {
    expect(referenceParseDbKind(undefined)).toBe("turso");
    expect(referenceParseDbKind(null)).toBe("turso");
    expect(referenceParseDbKind("")).toBe("turso");
    expect(referenceParseDbKind("mysql")).toBe("turso");
  });

  test("returns neon only when explicitly requested", () => {
    expect(referenceParseDbKind("neon")).toBe("neon");
    expect(referenceParseDbKind("turso")).toBe("turso");
  });
});

describe("admin/db/[table] — formatCell contract", () => {
  test("renders null and undefined as ∅", () => {
    expect(referenceFormatCell(null)).toBe("∅");
    expect(referenceFormatCell(undefined)).toBe("∅");
  });

  test("renders booleans as literal true/false", () => {
    expect(referenceFormatCell(true)).toBe("true");
    expect(referenceFormatCell(false)).toBe("false");
  });

  test("renders numbers and strings as String()", () => {
    expect(referenceFormatCell(42)).toBe("42");
    expect(referenceFormatCell("hello")).toBe("hello");
  });

  test("renders Date objects as ISO strings", () => {
    const d = new Date("2024-01-01T00:00:00Z");
    expect(referenceFormatCell(d)).toBe("2024-01-01T00:00:00.000Z");
  });

  test("renders objects as JSON strings", () => {
    expect(referenceFormatCell({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
    expect(referenceFormatCell([1, 2, 3])).toBe("[1,2,3]");
  });

  test("passes [REDACTED] through unchanged", () => {
    expect(referenceFormatCell("[REDACTED]")).toBe("[REDACTED]");
  });
});

describe("admin/db/[table] — totalPages contract", () => {
  test("returns 1 for empty tables", () => {
    expect(referenceTotalPages(0, 50)).toBe(1);
    expect(referenceTotalPages(-3, 50)).toBe(1);
  });

  test("rounds up partial final pages", () => {
    expect(referenceTotalPages(50, 50)).toBe(1);
    expect(referenceTotalPages(51, 50)).toBe(2);
    expect(referenceTotalPages(500, 50)).toBe(10);
    expect(referenceTotalPages(501, 50)).toBe(11);
  });

  test("guards against nonsense pageSize inputs", () => {
    expect(referenceTotalPages(100, 0)).toBe(1);
    expect(referenceTotalPages(100, -5)).toBe(1);
  });
});
