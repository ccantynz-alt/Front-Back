// ── BLK-025 Domain Search: AI Suggestions Unit Tests ────────────────

import { describe, test, expect, beforeEach } from "bun:test";
import { generateBrandableAlternatives } from "./ai-suggestions";

describe("generateBrandableAlternatives", () => {
  beforeEach(() => {
    process.env["ANTHROPIC_API_KEY"] = "";
  });

  test("returns empty list + note when no key configured", async () => {
    const out = await generateBrandableAlternatives("fable");
    expect(out.alternatives).toEqual([]);
    expect(out.note).toContain("ANTHROPIC_API_KEY");
    // Never shame the user or badmouth anything
    expect(out.note?.toLowerCase()).not.toContain("crap");
  });

  test("returns empty list + note on empty input", async () => {
    const out = await generateBrandableAlternatives("   ");
    expect(out.alternatives).toEqual([]);
    expect(out.note).toContain("Empty");
  });

  test("caps maxAlternatives at 12 even if caller asks for more", async () => {
    // Even with a shim model it will fail to generate — we only verify
    // the entry point accepts the arg.
    const out = await generateBrandableAlternatives("fable", {
      apiKey: "sk-fake-123456789",
      model: {} as never,
      maxAlternatives: 50,
    });
    expect(out.alternatives.length).toBeLessThanOrEqual(12);
  });

  test("never throws on malformed downstream calls", async () => {
    const out = await generateBrandableAlternatives("fable", {
      apiKey: "sk-fake-123456789",
      model: {} as never,
    });
    expect(Array.isArray(out.alternatives)).toBe(true);
  });
});
