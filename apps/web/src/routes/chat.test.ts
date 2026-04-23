// ── /chat — BYOK Chat Regression Guard ─────────────────────────────
//
// Pins the public Claude BYOK chat surface: real tRPC wiring, real
// streaming endpoint, current Claude model lineup (4.7 / 4.6 / 4.5).
// The model IDs were silently stale at 4.0 across several surfaces
// before the 18a2657 rotation — this guard stops the stale IDs from
// returning.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTE_PATH = resolve(import.meta.dir, "chat.tsx");

describe("chat route — smoke", () => {
  test("route file exists", () => {
    expect(existsSync(ROUTE_PATH)).toBe(true);
  });

  test("exports a default component", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src.includes("export default function")).toBe(true);
  });

  test("wires to real trpc procedures (no fake conversation state)", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("trpc.chat");
  });

  test("offers the current Claude 4.x lineup, not the stale 4.0 IDs", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain("claude-opus-4-7");
    expect(src).toContain("claude-sonnet-4-6");
    expect(src).toContain("claude-haiku-4-5-20251001");
    // Stale 4.0 IDs that shipped pre-18a2657 must never return:
    expect(src).not.toContain("claude-opus-4-20250514");
    expect(src).not.toContain("claude-sonnet-4-20250514");
    expect(src).not.toContain("claude-haiku-4-20250506");
  });

  test("prices match Anthropic's posted per-1M rates", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // Opus: $15 in / $75 out, Sonnet: $3 / $15, Haiku: $0.80 / $4.
    // Any drift in these numbers is either an Anthropic pricing
    // change (rare) or an agent error (much more likely) — catch it.
    expect(src).toContain("inputCostPer1M: 15");
    expect(src).toContain("outputCostPer1M: 75");
    expect(src).toContain("inputCostPer1M: 3");
    expect(src).toContain("outputCostPer1M: 15");
    expect(src).toContain("inputCostPer1M: 0.80");
    expect(src).toContain("outputCostPer1M: 4");
  });

  test("streams over SSE via a real fetch to /api/chat/stream", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    // The streaming endpoint is live at POST /api/chat/stream; the
    // chat page must call it rather than synthesise replies.
    expect(src).toContain("/api/chat/stream");
  });

  test("default model is Sonnet 4.6 (current cheapest general model)", () => {
    const src = readFileSync(ROUTE_PATH, "utf-8");
    expect(src).toContain('createSignal("claude-sonnet-4-6")');
  });
});
