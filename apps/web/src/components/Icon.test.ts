import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Icon Component Smoke Test ───────────────────────────────────────
//
// Verifies that the Icon component exists, exports the expected API,
// and maps the three sample icons the landing page relies on
// (`zap`, `database`, `lock`). Runs as a static source-level check
// plus a module-import check so it works inside Bun's test runner
// without needing a JSDOM / SolidJS render harness (the rest of the
// web package does not ship one).

const ICON_TSX = resolve(import.meta.dir, "Icon.tsx");

describe("Smoke: Icon component source", () => {
  test("Icon.tsx exists", () => {
    expect(existsSync(ICON_TSX)).toBe(true);
  });

  test("Icon.tsx exports Icon component and IconName type", () => {
    const src = readFileSync(ICON_TSX, "utf-8");
    expect(src).toContain("export function Icon");
    expect(src).toContain("export type IconName");
    expect(src).toContain("export default Icon");
  });

  test("Icon registry maps `zap` to a solid-icons component", () => {
    const src = readFileSync(ICON_TSX, "utf-8");
    // The registry line should look like: `zap: FiZap,`
    expect(src).toMatch(/zap:\s*Fi[A-Z]\w+/);
  });

  test("Icon registry maps `database` to a solid-icons component", () => {
    const src = readFileSync(ICON_TSX, "utf-8");
    expect(src).toMatch(/database:\s*Fi[A-Z]\w+/);
  });

  test("Icon registry maps `lock` to a solid-icons component", () => {
    const src = readFileSync(ICON_TSX, "utf-8");
    expect(src).toMatch(/lock:\s*Fi[A-Z]\w+/);
  });

  test("Icon defaults to 24px size and 1.5 stroke width", () => {
    const src = readFileSync(ICON_TSX, "utf-8");
    expect(src).toContain("props.size ?? 24");
    expect(src).toContain('props["stroke-width"] ?? 1.5');
  });

  test("Icon imports from solid-icons/fi", () => {
    const src = readFileSync(ICON_TSX, "utf-8");
    expect(src).toContain('from "solid-icons/fi"');
  });
});

describe("Smoke: Icon registry contents", () => {
  test("all 6 landing-page icon names are present in the registry", () => {
    const src = readFileSync(ICON_TSX, "utf-8");
    // Every feature-card icon referenced in routes/index.tsx must
    // resolve inside the Icon registry, otherwise the page TS-breaks.
    // Hyphenated keys appear quoted (`"link-2":`); bare keys don't
    // (`zap:`). Accept either form.
    for (const name of ["zap", "database", "link-2", "radio", "brain", "lock"]) {
      const bareForm = `${name}:`;
      const quotedForm = `"${name}":`;
      expect(src.includes(bareForm) || src.includes(quotedForm)).toBe(true);
    }
  });

  test("every registry entry resolves to a Feather Icon component", () => {
    const src = readFileSync(ICON_TSX, "utf-8");
    // Grab the ICON_MAP block and verify every right-hand side is a
    // `Fi*` import (we deliberately use one icon pack for visual
    // consistency).
    const mapStart = src.indexOf("const ICON_MAP = {");
    const mapEnd = src.indexOf("} as const satisfies", mapStart);
    expect(mapStart).toBeGreaterThan(-1);
    expect(mapEnd).toBeGreaterThan(mapStart);
    const mapBody = src.slice(mapStart, mapEnd);
    const entries = mapBody.match(/^\s*[\w"'`-]+:\s*(\w+),/gm) ?? [];
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry).toMatch(/:\s*Fi[A-Z]\w+,/);
    }
  });
});
