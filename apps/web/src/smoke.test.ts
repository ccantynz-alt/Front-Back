import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { readdirSync } from "node:fs";

// ── Smoke Tests for Web App ─────────────────────────────────────────
// These verify that the web app structure is correct and buildable.

const WEB_ROOT = resolve(import.meta.dir, "..");
const SRC_ROOT = resolve(import.meta.dir);
const ROUTES_DIR = resolve(SRC_ROOT, "routes");

describe("Smoke: Route files export default components", () => {
  const routeFiles = getAllRouteFiles(ROUTES_DIR);

  for (const routeFile of routeFiles) {
    const relativePath = routeFile.replace(ROUTES_DIR, "");

    test(`${relativePath} exports a valid route shape`, () => {
      const content = readFileSync(routeFile, "utf-8");
      // SolidStart page routes need a default export (the component to render).
      // SolidStart API routes (inside routes/api/**) export HTTP method handlers
      // (GET, POST, PUT, DELETE, PATCH) instead — no default export exists.
      const hasDefaultExport =
        content.includes("export default") ||
        content.includes("export { default }");
      const hasHttpMethodExport = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\b/.test(
        content,
      );
      expect(hasDefaultExport || hasHttpMethodExport).toBe(true);
    });
  }
});

describe("Smoke: CSS file exists and is non-empty", () => {
  test("app.css exists", () => {
    const cssPath = resolve(SRC_ROOT, "app.css");
    expect(existsSync(cssPath)).toBe(true);
  });

  test("app.css is non-empty", () => {
    const cssPath = resolve(SRC_ROOT, "app.css");
    const stat = statSync(cssPath);
    expect(stat.size).toBeGreaterThan(0);
  });

  test("app.css imports tailwindcss", () => {
    const cssPath = resolve(SRC_ROOT, "app.css");
    const content = readFileSync(cssPath, "utf-8");
    expect(content).toContain("tailwindcss");
  });
});

describe("Smoke: Core app files exist", () => {
  test("app.tsx exists", () => {
    expect(existsSync(resolve(SRC_ROOT, "app.tsx"))).toBe(true);
  });

  test("entry-client.tsx exists", () => {
    expect(existsSync(resolve(SRC_ROOT, "entry-client.tsx"))).toBe(true);
  });

  test("entry-server.tsx exists", () => {
    expect(existsSync(resolve(SRC_ROOT, "entry-server.tsx"))).toBe(true);
  });

  test("app.config.ts exists at project root", () => {
    expect(existsSync(resolve(WEB_ROOT, "app.config.ts"))).toBe(true);
  });
});

describe("Smoke: Required route pages exist", () => {
  const requiredRoutes = [
    "index.tsx",
    "login.tsx",
    "register.tsx",
    "dashboard.tsx",
    "settings.tsx",
  ];

  for (const route of requiredRoutes) {
    test(`routes/${route} exists`, () => {
      expect(existsSync(resolve(ROUTES_DIR, route))).toBe(true);
    });
  }
});

// ── Helpers ──────────────────────────────────────────────────────────

function getAllRouteFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllRouteFiles(fullPath));
    } else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) {
      // Skip test files and files that start with underscore (layout files, etc.)
      if (!entry.name.includes(".test.") && !entry.name.startsWith("_")) {
        results.push(fullPath);
      }
    }
  }

  return results;
}
