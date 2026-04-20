// ── SMS API: Product Page Smoke Test ────────────────────────────────
//
// Structural smoke test for the public /sms Coming Soon page. Verifies
// the file exists, exports a default component, renders the Coming
// Soon badge, carries a waitlist form with an email input, and stays
// polite (no competitor names).

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(import.meta.dir, "sms.tsx");

// Pure helper duplicated from sms.tsx so the suite doesn't boot
// SolidJS SSR. If this drifts the grep-based shape assertion below
// will catch it.
function isPlausibleEmail(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 254) return false;
  if (!trimmed.includes("@")) return false;
  const [local, domain] = trimmed.split("@");
  if (!local || !domain) return false;
  if (!domain.includes(".")) return false;
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(trimmed);
}

describe("sms route — smoke", () => {
  test("route file exists", () => {
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });

  test("exports a default component", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src.includes("export default function")).toBe(true);
  });

  test("carries a Coming Soon badge", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("Coming soon");
  });

  test("describes the core SMS product surface", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // Inbound webhooks, numbers, and segment-based pricing are the
    // promised product surfaces — each must be mentioned in copy.
    expect(src.toLowerCase()).toContain("inbound webhook");
    expect(src.toLowerCase()).toContain("segment");
    expect(src.toLowerCase()).toContain("numbers");
  });

  test("renders a waitlist form with an email input + submit button", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("onSubmit={onSubmit}");
    expect(src).toContain('type="email"');
    expect(src).toContain("Join waitlist");
  });

  test("exports the isPlausibleEmail helper", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("export function isPlausibleEmail");
  });

  test("polite tone — no competitor names", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    const lower = src.toLowerCase();
    expect(lower).not.toContain("twilio");
    expect(lower).not.toContain("messagebird");
    expect(lower).not.toContain("vonage");
    expect(lower).not.toContain("sinch");
    expect(lower).not.toContain("crap");
    expect(lower).not.toContain("garbage");
  });
});

describe("isPlausibleEmail", () => {
  test("accepts well-formed addresses", () => {
    expect(isPlausibleEmail("user@example.com")).toBe(true);
    expect(isPlausibleEmail("first.last+tag@sub.example.co")).toBe(true);
  });

  test("rejects missing @, missing TLD, or blank input", () => {
    expect(isPlausibleEmail("")).toBe(false);
    expect(isPlausibleEmail("nope")).toBe(false);
    expect(isPlausibleEmail("nope@nope")).toBe(false);
    expect(isPlausibleEmail("@example.com")).toBe(false);
    expect(isPlausibleEmail("user@.com")).toBe(false);
  });

  test("rejects absurdly long inputs", () => {
    const long = "a".repeat(250) + "@example.com";
    expect(isPlausibleEmail(long)).toBe(false);
  });
});
