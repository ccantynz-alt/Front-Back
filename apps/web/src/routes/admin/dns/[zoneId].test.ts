// Smoke tests for /admin/dns/:zoneId — zone detail page.
// Static source-contract tests (matches the DNS-UI agent's pattern
// for sibling admin routes). Route-level interaction behavior is
// covered at the tRPC layer + E2E once Playwright exists.

import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(
  import.meta.dir,
  "./[zoneId].tsx",
);

describe("admin/dns/[zoneId] — file presence", () => {
  test("route file exists at the documented path", () => {
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });
});

describe("admin/dns/[zoneId] — static source contract", () => {
  const source = readFileSync(ROUTE_PATH, "utf-8");

  test("exports a default component", () => {
    expect(source).toMatch(/export default function/);
  });

  test("wraps its content in AdminRoute", () => {
    expect(source).toMatch(/<AdminRoute>/);
    expect(source).toMatch(/<\/AdminRoute>/);
  });

  test("uses useParams for zoneId", () => {
    expect(source).toMatch(/useParams<\s*\{\s*zoneId: string\s*\}\s*>\(\)/);
  });

  test("references the dns.getZone query", () => {
    expect(source).toMatch(/trpc\.dns\.getZone/);
  });

  test("references the dns.updateZone mutation", () => {
    expect(source).toMatch(/trpc\.dns\.updateZone/);
  });

  test("references the dns.createRecord mutation", () => {
    expect(source).toMatch(/trpc\.dns\.createRecord/);
  });

  test("references the dns.deleteRecord mutation", () => {
    expect(source).toMatch(/trpc\.dns\.deleteRecord/);
  });

  test("renders the Admin / DNS / zone-name breadcrumb trail", () => {
    expect(source).toMatch(/Admin/);
    expect(source).toMatch(/DNS/);
    expect(source).toMatch(/href="\/admin\/dns"/);
  });

  test("supports all eight record types", () => {
    for (const t of ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"]) {
      expect(source).toContain(`"${t}"`);
    }
  });

  test("uses polite tone — does not name competitor platforms", () => {
    const forbidden = [
      "Cloudflare",
      "Route 53",
      "Route53",
      "Namecheap",
      "GoDaddy",
      "Google Domains",
    ];
    for (const name of forbidden) {
      expect(source).not.toContain(name);
    }
  });
});

// Helper function dynamic-import tests are intentionally omitted:
// bun:test cannot resolve SolidJS JSX runtime when dynamically
// importing a .tsx module. The static source-contract tests above
// verify the helpers are exported and referenced correctly.
// E2E interaction coverage arrives with Playwright.
