// Unit tests for LaunchChecklist counts logic.
//
// Rendering-side behaviour (HUD visibility, styles, localStorage) is
// covered by component tests elsewhere; this file pins down the pure
// accounting function so the "% live" badge cannot regress silently.

import { describe, expect, test } from "bun:test";
import {
  LAUNCH_PHASES,
  computeCounts,
  deriveAutoDone,
  type ChecklistPhase,
  type LaunchStatusResponse,
} from "./LaunchChecklist";

describe("computeCounts", () => {
  test("returns zero when no items are done", () => {
    const c = computeCounts(LAUNCH_PHASES, new Set());
    expect(c.doneCount).toBe(0);
    expect(c.total).toBeGreaterThan(0);
    expect(c.pct).toBe(0);
  });

  test("returns 100% when every item is done", () => {
    const all = new Set<string>();
    for (const p of LAUNCH_PHASES) for (const it of p.items) all.add(it.id);
    const c = computeCounts(LAUNCH_PHASES, all);
    expect(c.doneCount).toBe(c.total);
    expect(c.pct).toBe(100);
  });

  test("rounds partial percentages correctly", () => {
    const phases: readonly ChecklistPhase[] = [
      {
        id: "T",
        title: "T",
        subtitle: "test",
        items: [
          { id: "t1", label: "one" },
          { id: "t2", label: "two" },
          { id: "t3", label: "three" },
        ],
      },
    ];
    expect(computeCounts(phases, new Set(["t1"])).pct).toBe(33);
    expect(computeCounts(phases, new Set(["t1", "t2"])).pct).toBe(67);
  });

  test("ignores ids that aren't in the phase list", () => {
    const c = computeCounts(LAUNCH_PHASES, new Set(["nonexistent"]));
    expect(c.doneCount).toBe(0);
  });

  test("empty phases return 0% without division by zero", () => {
    const c = computeCounts([], new Set());
    expect(c.total).toBe(0);
    expect(c.pct).toBe(0);
  });

  test("Phase A is fully enumerated (6 items)", () => {
    const phaseA = LAUNCH_PHASES.find((p) => p.id === "A");
    expect(phaseA).toBeDefined();
    expect(phaseA?.items.length).toBe(6);
  });
});

describe("deriveAutoDone", () => {
  test("returns empty set when status is null", () => {
    const out = deriveAutoDone(LAUNCH_PHASES, null);
    expect(out.size).toBe(0);
  });

  test("adds Phase B item ids for secrets that are true", () => {
    const status: LaunchStatusResponse = {
      secrets: {
        DATABASE_URL: true,
        DATABASE_AUTH_TOKEN: true,
        SESSION_SECRET: false,
        JWT_SECRET: false,
        GOOGLE_CLIENT_ID: false,
        GOOGLE_CLIENT_SECRET: false,
        STRIPE_SECRET_KEY: false,
        STRIPE_WEBHOOK_SECRET: false,
        STRIPE_PRO_PRICE_ID: false,
        STRIPE_ENTERPRISE_PRICE_ID: false,
        OPENAI_API_KEY: true,
        ANTHROPIC_API_KEY: false,
      },
      probes: { api_version: false, db_connected: false },
    };
    const out = deriveAutoDone(LAUNCH_PHASES, status);
    expect(out.has("B1")).toBe(true); // DATABASE_URL
    expect(out.has("B2")).toBe(true); // DATABASE_AUTH_TOKEN
    expect(out.has("B11")).toBe(true); // OPENAI_API_KEY
    expect(out.has("B3")).toBe(false); // SESSION_SECRET=false
    expect(out.has("B12")).toBe(false); // ANTHROPIC_API_KEY=false
  });

  test("adds D1 when api_version probe is true", () => {
    const status: LaunchStatusResponse = {
      secrets: {
        DATABASE_URL: false,
        DATABASE_AUTH_TOKEN: false,
        SESSION_SECRET: false,
        JWT_SECRET: false,
        GOOGLE_CLIENT_ID: false,
        GOOGLE_CLIENT_SECRET: false,
        STRIPE_SECRET_KEY: false,
        STRIPE_WEBHOOK_SECRET: false,
        STRIPE_PRO_PRICE_ID: false,
        STRIPE_ENTERPRISE_PRICE_ID: false,
        OPENAI_API_KEY: false,
        ANTHROPIC_API_KEY: false,
      },
      probes: { api_version: true, db_connected: true },
    };
    const out = deriveAutoDone(LAUNCH_PHASES, status);
    expect(out.has("D1")).toBe(true);
  });
});
