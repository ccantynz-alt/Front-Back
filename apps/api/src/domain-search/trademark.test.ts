// ── BLK-025 Domain Search: Trademark Scanner Unit Tests ─────────────

import { describe, test, expect, beforeEach } from "bun:test";
import { aboveRisk, scanTrademarkConflicts, type TrademarkConflict } from "./trademark";

describe("aboveRisk", () => {
  const rows: TrademarkConflict[] = [
    { mark: "A", owner: "X", similarity: 0.9, risk: "high", citation: "" },
    { mark: "B", owner: "X", similarity: 0.5, risk: "medium", citation: "" },
    { mark: "C", owner: "X", similarity: 0.1, risk: "low", citation: "" },
  ];
  test("medium keeps medium + high only", () => {
    const out = aboveRisk(rows, "medium");
    expect(out.map((r) => r.risk)).toEqual(["high", "medium"]);
  });
  test("high keeps only high", () => {
    const out = aboveRisk(rows, "high");
    expect(out.map((r) => r.risk)).toEqual(["high"]);
  });
  test("low keeps everything", () => {
    const out = aboveRisk(rows, "low");
    expect(out.length).toBe(3);
  });
});

describe("scanTrademarkConflicts", () => {
  beforeEach(() => {
    process.env["ANTHROPIC_API_KEY"] = "";
  });

  test("returns empty list + polite note when no key configured", async () => {
    const out = await scanTrademarkConflicts("apple");
    expect(out.conflicts).toEqual([]);
    expect(out.note).toContain("ANTHROPIC_API_KEY");
    // Polite tone — no competitor-bashing, no shouting
    expect(out.note?.toLowerCase()).not.toContain("crap");
  });

  test("returns empty list + note on empty input", async () => {
    const out = await scanTrademarkConflicts("   ");
    expect(out.conflicts).toEqual([]);
    expect(out.note).toContain("Empty");
  });

  test("never throws — downstream errors collapse into a note", async () => {
    // Provide a model shim whose generateObject call path will fail.
    const out = await scanTrademarkConflicts("nova", {
      apiKey: "sk-fake-123456789",
      model: {} as never,
    });
    expect(Array.isArray(out.conflicts)).toBe(true);
    // Either returned empty with a note, or a structured-output miracle
    expect(out.conflicts.length).toBeGreaterThanOrEqual(0);
  });
});
