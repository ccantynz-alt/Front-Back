// ── Authoritative DNS: Product Page Smoke Test ──────────────────────
//
// Structural smoke test for the public /dns marketing page. Verifies
// the file exists, exports a default component, renders the promise
// line, wires the "Open DNS admin" CTA to /admin/dns, and includes
// the Cloudflare-import and code-snippet copy — all without booting
// a SolidStart runtime.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(import.meta.dir, "dns.tsx");

describe("dns route — smoke", () => {
  test("route file exists", () => {
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });

  test("exports a default component", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src.includes("export default function")).toBe(true);
  });

  test("renders the 'replace third-party DNS' promise", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("Replace third-party DNS with your own, in minutes.");
  });

  test("wires the Open DNS admin CTA to /admin/dns", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain('href="/admin/dns"');
    expect(src).toContain("Open DNS admin");
  });

  test("mentions the Cloudflare-import migration tool", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("Cloudflare");
    expect(src.toLowerCase()).toContain("import");
  });

  test("includes a tRPC + dig code snippet block", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("trpc.dns.createZone.mutate");
    expect(src).toContain("dig @ns1.crontech.net");
  });

  test("polite tone — no competitor names, no hostile words", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    const lower = src.toLowerCase();
    expect(lower).not.toContain("crap");
    expect(lower).not.toContain("garbage");
    expect(lower).not.toContain("suck");
    // Cloudflare is allowed — it's our import source, not a jab.
    // But no rival DNS services should be named adversarially.
    expect(lower).not.toContain("route53");
    expect(lower).not.toContain("godaddy");
  });
});
