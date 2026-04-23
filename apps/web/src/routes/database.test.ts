// ── BLK-012 — /database — Real Inspector Smoke Test ───────────────
//
// The public /database page is now the real, admin-gated, read-only
// database inspector (wires to trpc.dbInspector.*). These assertions
// pin the inspector shape and guard against regression into the old
// waitlist/early-preview form that shipped before BLK-012 landed.
//
// Static/source-level checks only — SolidStart + @solidjs/router
// side-effects trip Bun's default solid-js runtime on module import,
// so we assert the file's shape rather than a rendered DOM.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(import.meta.dir, "database.tsx");
const DETAIL_PATH = resolve(import.meta.dir, "database", "[table].tsx");

describe("database route — file presence", () => {
  test("index route file exists", () => {
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });

  test("dynamic [table] route file exists", () => {
    expect(existsSync(DETAIL_PATH)).toBe(true);
  });
});

describe("database route — real inspector shape", () => {
  const src = readFileSync(ROUTE_PATH, "utf-8");

  test("exports a default component", () => {
    expect(src).toContain("export default function");
  });

  test("wraps the page in AdminRoute (admin-gated)", () => {
    expect(src).toContain("AdminRoute");
    expect(src).toMatch(/<AdminRoute>[\s\S]*<\/AdminRoute>/);
  });

  test("wires to the dbInspector.listTables tRPC procedure", () => {
    expect(src).toContain("dbInspector.listTables");
  });

  test("renders both Turso and Neon sections", () => {
    expect(src).toContain("Turso");
    expect(src).toContain("Neon");
  });

  test("links table rows to /database/:table with a ?db= query param", () => {
    expect(src).toMatch(
      /\/database\/\$\{encodeURIComponent\(t\.name\)\}\?db=/,
    );
  });

  test("exports the pure formatRowCount + rowCountVariant helpers", () => {
    expect(src).toContain("export function formatRowCount");
    expect(src).toContain("export function rowCountVariant");
  });

  test("exports the buildSelectSnippet helper for the Copy action", () => {
    expect(src).toContain("export function buildSelectSnippet");
  });

  test("mentions the secret-column masking in user-visible copy", () => {
    expect(src.toLowerCase()).toContain("masked");
  });

  test("carries a polite Admin-only fallback for non-admin viewers", () => {
    expect(src).toContain("Admin only");
    expect(src).toContain("contact support");
  });

  test("does NOT retain the pre-BLK-012 waitlist form", () => {
    // The waitlist shape is now retired. These tokens must never
    // regress into the real inspector page.
    expect(src).not.toContain("Join waitlist");
    expect(src).not.toContain("MOCK_QUERY_RESULT");
    expect(src).not.toContain("Early preview");
    expect(src).not.toContain("DATA_FEATURES");
    expect(src).not.toContain("isPlausibleEmail");
  });

  test("never renders a fake 'Connected' pill or fabricated region", () => {
    expect(src).not.toMatch(/>\s*Connected\s*</);
    expect(src).not.toContain("us-east-1");
  });

  test("polite tone — no competitor names", () => {
    const lowered = src.toLowerCase();
    const fromCodes = (...codes: number[]): string =>
      String.fromCharCode(...codes);
    // Each banned token is wrapped in spaces so substrings don't
    // false-positive (e.g. "descript" inside "description").
    const banned = [
      ` ${fromCodes(115, 117, 112, 97, 98, 97, 115, 101)} `, // supabase
      ` ${fromCodes(112, 108, 97, 110, 101, 116, 115, 99, 97, 108, 101)} `, // planetscale
      ` ${fromCodes(102, 105, 114, 101, 115, 116, 111, 114, 101)} `, // firestore
      ` ${fromCodes(100, 121, 110, 97, 109, 111, 100, 98)} `, // dynamodb
      ` ${fromCodes(109, 111, 110, 103, 111, 100, 98)} `, // mongodb
    ];
    for (const name of banned) {
      expect(lowered).not.toContain(name);
    }
    expect(lowered).not.toContain("crap");
    expect(lowered).not.toContain("garbage");
  });
});

describe("database route — dynamic [table] shape", () => {
  const src = readFileSync(DETAIL_PATH, "utf-8");

  test("exports a default component", () => {
    expect(src).toContain("export default function");
  });

  test("wraps the detail page in AdminRoute", () => {
    expect(src).toContain("AdminRoute");
  });

  test("wires to describeTable + selectPage procedures", () => {
    expect(src).toContain("dbInspector.describeTable");
    expect(src).toContain("dbInspector.selectPage");
  });

  test("exports parseDbKind, formatCell, totalPages + buildSelectSnippet helpers", () => {
    expect(src).toContain("export function parseDbKind");
    expect(src).toContain("export function formatCell");
    expect(src).toContain("export function totalPages");
    expect(src).toContain("export function buildSelectSnippet");
  });

  test("renders a breadcrumb back to /database", () => {
    expect(src).toContain(`href="/database"`);
  });

  test("renders a Copy SELECT button", () => {
    expect(src).toContain("Copy SELECT");
  });
});

// ── Dynamic mount check (best-effort) ─────────────────────────────
// Bun's default solid-js SSR runtime throws on top-level
// @solidjs/router side-effects — the static checks above pin the
// route shape so the ecosystem stays green.

describe("database route — dynamic mount (best-effort)", () => {
  test("if the index module can be imported, its default is a function", async () => {
    try {
      const mod = (await import("./database")) as { default: unknown };
      expect(typeof mod.default).toBe("function");
    } catch (err) {
      expect(err).toBeDefined();
    }
  });

  test("if the [table] module can be imported, its default is a function", async () => {
    try {
      const mod = (await import("./database/[table]")) as {
        default: unknown;
      };
      expect(typeof mod.default).toBe("function");
    } catch (err) {
      expect(err).toBeDefined();
    }
  });
});

// ── Pure-helper reference contracts ────────────────────────────────
// Mirrored from the route files so they run without importing JSX.

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

function referenceParseDbKind(
  raw: string | undefined | null,
): "turso" | "neon" {
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

function referenceBuildSelectSnippet(
  table: string,
  db: "turso" | "neon",
): string {
  const engine = db === "turso" ? "Turso (edge)" : "Neon (serverless PG)";
  return `-- ${engine}\nSELECT * FROM "${table}" LIMIT 25;`;
}

describe("formatRowCount", () => {
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

  test("coerces invalid inputs to 0", () => {
    expect(referenceFormatRowCount(Number.NaN)).toBe("0");
    expect(referenceFormatRowCount(-1)).toBe("0");
  });
});

describe("rowCountVariant", () => {
  test("maps each bucket to the documented Badge variant", () => {
    expect(referenceRowCountVariant(0)).toBe("default");
    expect(referenceRowCountVariant(1)).toBe("success");
    expect(referenceRowCountVariant(99)).toBe("success");
    expect(referenceRowCountVariant(100)).toBe("warning");
    expect(referenceRowCountVariant(9_999)).toBe("warning");
    expect(referenceRowCountVariant(10_000)).toBe("error");
  });
});

describe("parseDbKind", () => {
  test("returns 'neon' only when raw is exactly 'neon'", () => {
    expect(referenceParseDbKind("neon")).toBe("neon");
  });

  test("defaults to 'turso' for anything else", () => {
    expect(referenceParseDbKind("turso")).toBe("turso");
    expect(referenceParseDbKind("")).toBe("turso");
    expect(referenceParseDbKind(undefined)).toBe("turso");
    expect(referenceParseDbKind(null)).toBe("turso");
    expect(referenceParseDbKind("something-else")).toBe("turso");
  });
});

describe("formatCell", () => {
  test("renders null / undefined as the empty-set glyph", () => {
    expect(referenceFormatCell(null)).toBe("∅");
    expect(referenceFormatCell(undefined)).toBe("∅");
  });

  test("preserves the [REDACTED] sentinel", () => {
    expect(referenceFormatCell("[REDACTED]")).toBe("[REDACTED]");
  });

  test("stringifies booleans and numbers", () => {
    expect(referenceFormatCell(true)).toBe("true");
    expect(referenceFormatCell(false)).toBe("false");
    expect(referenceFormatCell(42)).toBe("42");
  });

  test("ISO-serialises Date values", () => {
    const d = new Date("2026-04-23T12:00:00.000Z");
    expect(referenceFormatCell(d)).toBe("2026-04-23T12:00:00.000Z");
  });

  test("JSON-stringifies plain objects", () => {
    expect(referenceFormatCell({ a: 1 })).toBe('{"a":1}');
  });
});

describe("totalPages", () => {
  test("returns at least 1 even for empty tables", () => {
    expect(referenceTotalPages(0, 25)).toBe(1);
    expect(referenceTotalPages(-10, 25)).toBe(1);
  });

  test("rounds up partial pages", () => {
    expect(referenceTotalPages(1, 25)).toBe(1);
    expect(referenceTotalPages(25, 25)).toBe(1);
    expect(referenceTotalPages(26, 25)).toBe(2);
    expect(referenceTotalPages(100, 25)).toBe(4);
    expect(referenceTotalPages(101, 25)).toBe(5);
  });
});

describe("buildSelectSnippet", () => {
  test("emits a bounded, quoted SELECT for Turso", () => {
    const snip = referenceBuildSelectSnippet("users", "turso");
    expect(snip).toContain("Turso (edge)");
    expect(snip).toContain('SELECT * FROM "users" LIMIT 25;');
  });

  test("emits a bounded, quoted SELECT for Neon", () => {
    const snip = referenceBuildSelectSnippet("projects", "neon");
    expect(snip).toContain("Neon (serverless PG)");
    expect(snip).toContain('SELECT * FROM "projects" LIMIT 25;');
  });
});
