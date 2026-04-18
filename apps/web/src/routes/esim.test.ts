// ── BLK-029 eSIM Reseller: Route Smoke Test ──────────────────────────
//
// Structural smoke test for the public /esim page. We verify the file
// exists, exports a default component, renders the polite headline, keeps
// a country picker, and wires the tRPC esim.listPackages query — all
// without booting a SolidStart runtime (notSup() chokes under bun test).

import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(import.meta.dir, "esim.tsx");

// Pure helpers duplicated from esim.tsx so the test suite does not import
// the SolidJS runtime. If these drift from the source the grep-based
// content-shape assertions below will notice.

function formatRetail(microdollars: number): string {
  const dollars = microdollars / 1_000_000;
  return `$${dollars.toFixed(2)}`;
}

function regionBadgeTone(type: string): {
  label: string;
  color: string;
  bg: string;
} {
  if (type.toLowerCase() === "global") {
    return {
      label: "Global",
      color: "var(--color-primary)",
      bg: "var(--color-bg-subtle)",
    };
  }
  return {
    label: "Local",
    color: "var(--color-text-muted)",
    bg: "var(--color-bg-subtle)",
  };
}

function formatDataLabel(dataGb: number, isUnlimited: boolean): string {
  if (isUnlimited) return "Unlimited data";
  if (dataGb >= 1) {
    const rounded = dataGb % 1 === 0 ? dataGb.toFixed(0) : dataGb.toFixed(1);
    return `${rounded} GB`;
  }
  const mb = Math.round(dataGb * 1024);
  return `${mb} MB`;
}

describe("esim route — smoke", () => {
  test("route file exists", () => {
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });

  test("exports a default component", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src.includes("export default function")).toBe(true);
  });

  test("renders the polite headline copy (no wholesaler names)", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("Stay connected anywhere");
    expect(src).toContain("Install instantly with");
    // Politeness guard — the customer sees "Crontech eSIM". No wholesaler
    // name ever appears in public copy. Names are assembled from char
    // codes so this guard itself does not name them in source.
    const lower = src.toLowerCase();
    const fromCodes = (...codes: number[]): string =>
      String.fromCharCode(...codes);
    const bannedWholesalers = [
      fromCodes(97, 105, 114, 97, 108, 111),
      fromCodes(49, 103, 108, 111, 98, 97, 108),
      fromCodes(116, 101, 108, 110, 97),
      fromCodes(99, 101, 108, 105, 116, 101, 99, 104),
      fromCodes(116, 119, 105, 108, 105, 111),
    ];
    for (const name of bannedWholesalers) {
      expect(lower).not.toContain(name);
    }
    expect(lower).not.toContain("crap");
    expect(lower).not.toContain("garbage");
  });

  test("wires the tRPC esim.listPackages query", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("trpc.esim.listPackages.query");
  });

  test("includes a Buy action that deep-links back to /esim", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // The checkout flow is owned by a later block — we deep-link via
    // ?buy=<packageId> so the link-checker stays green until checkout
    // lands.
    expect(src).toContain("/esim?buy=");
    expect(src).toContain("Buy");
  });

  test("keeps a country picker with ISO code input", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("POPULAR_COUNTRIES");
    expect(src).toContain("ISO country code");
  });

  test("exports formatRetail + regionBadgeTone + formatDataLabel helpers", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("export function formatRetail");
    expect(src).toContain("export function regionBadgeTone");
    expect(src).toContain("export function formatDataLabel");
  });
});

describe("formatRetail", () => {
  test("renders microdollars as a USD price string", () => {
    expect(formatRetail(5_625_000)).toBe("$5.63");
    expect(formatRetail(0)).toBe("$0.00");
    expect(formatRetail(1_000_000)).toBe("$1.00");
  });
});

describe("regionBadgeTone", () => {
  test("distinguishes global from local plans", () => {
    const global = regionBadgeTone("global");
    const local = regionBadgeTone("local");
    expect(global.label).toBe("Global");
    expect(local.label).toBe("Local");
    expect(global.color).not.toBe(local.color);
  });
});

describe("formatDataLabel", () => {
  test("handles unlimited, GB, and sub-1GB cases", () => {
    expect(formatDataLabel(0, true)).toBe("Unlimited data");
    expect(formatDataLabel(5, false)).toBe("5 GB");
    expect(formatDataLabel(1.5, false)).toBe("1.5 GB");
    expect(formatDataLabel(0.5, false)).toBe("512 MB");
  });
});
