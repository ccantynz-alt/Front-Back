// ── PlatformSiblingsWidget — static source tests ────────────────────
// Mirrors the pattern used by admin/claude.test.ts: the component
// pulls in @solidjs/router transitively, which throws under bun's
// SSR solid-js runtime. Static-source assertions pin down the
// widget's contract without requiring an actual render.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const WIDGET_PATH = resolve(
  import.meta.dir,
  "PlatformSiblingsWidget.tsx",
);
const CROSS_SELL_PATH = resolve(
  import.meta.dir,
  "PlatformCrossSellCard.tsx",
);

describe("PlatformSiblingsWidget — file presence", () => {
  test("widget file exists at the documented path", () => {
    expect(existsSync(WIDGET_PATH)).toBe(true);
  });

  test("cross-sell card file exists at the documented path", () => {
    expect(existsSync(CROSS_SELL_PATH)).toBe(true);
  });
});

describe("PlatformSiblingsWidget — static source contract", () => {
  const src = readFileSync(WIDGET_PATH, "utf-8");

  test("exports the widget component by name", () => {
    expect(src).toContain("export function PlatformSiblingsWidget");
  });

  test("fetches the admin fan-out route", () => {
    expect(src).toContain("/api/admin/platform-siblings");
  });

  test("renders a card per sibling product", () => {
    expect(src).toContain("Crontech");
    expect(src).toContain("Gluecron");
    expect(src).toContain("GateTest");
  });

  test("renders the three required per-card fields", () => {
    expect(src).toContain("Latency");
    expect(src).toContain("Last updated");
    expect(src).toContain("statusLabel");
  });

  test("surfaces the unreachable status with a friendly label", () => {
    expect(src).toContain("unreachable");
  });
});

describe("PlatformCrossSellCard — static source contract", () => {
  const src = readFileSync(CROSS_SELL_PATH, "utf-8");

  test("exports the cross-sell component by name", () => {
    expect(src).toContain("export function PlatformCrossSellCard");
  });

  test("links to both sibling products with outbound-safe attrs", () => {
    expect(src).toContain("https://gluecron.com");
    expect(src).toContain("https://gatetest.io");
    expect(src).toContain('target="_blank"');
    expect(src).toContain('rel="noopener noreferrer"');
  });

  test("keeps the copy short and non-pushy", () => {
    const lowered = src.toLowerCase();
    expect(lowered).toContain("pairs well with");
    // Aggressive CTAs we do NOT want in this card.
    expect(lowered).not.toContain("upgrade now");
    expect(lowered).not.toContain("buy now");
    expect(lowered).not.toContain("sign up today");
  });

  test("names each sibling alongside its one-liner", () => {
    expect(src).toContain("Gluecron");
    expect(src).toContain("GateTest");
    expect(src).toContain("Git hosting");
    expect(src).toContain("Preview environments");
  });
});
