// ── Runner unit tests ───────────────────────────────────────────────
// Proves that runCycle() wires collectors → storage → analyzers
// end-to-end without touching the network. A fake collector
// produces synthetic IntelligenceItems; we assert the cycle result
// matches the known fixture shape and that the intelligence store
// actually receives the items.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { runCycle } from "./runner";
import {
  clearStore,
  getAllItems,
  getItemCount,
  setStorePath,
} from "./storage/intelligence-store";
import type {
  Collector,
  CollectorResult,
  IntelligenceItem,
} from "./collectors/types";

// ── Fake collector helpers ──────────────────────────────────────────

function makeFakeItem(
  partial: Partial<IntelligenceItem> & { id: string },
): IntelligenceItem {
  return {
    id: partial.id,
    source: partial.source ?? "fake",
    title: partial.title ?? "Fake item",
    description: partial.description ?? "synthetic",
    url: partial.url ?? "https://example.com/item",
    severity: partial.severity ?? "low",
    tags: partial.tags ?? ["test"],
    metadata: partial.metadata ?? {},
    collectedAt: partial.collectedAt ?? new Date().toISOString(),
  };
}

function fakeCollector(opts: {
  name: string;
  items: IntelligenceItem[];
  throws?: boolean;
  succeed?: boolean;
}): Collector {
  const { name, items, throws = false, succeed = true } = opts;
  return {
    name,
    cronExpression: "*/5 * * * *",
    intervalMs: 5 * 60 * 1000,
    async collect(): Promise<CollectorResult> {
      if (throws) {
        throw new Error(`${name} exploded`);
      }
      return {
        source: name,
        items,
        collectedAt: new Date().toISOString(),
        success: succeed,
        error: succeed ? undefined : `${name} reported failure`,
        durationMs: 1,
      };
    },
  };
}

// ── Isolated store fixture ──────────────────────────────────────────

let tmpDir: string;
let storePath: string;
const silent = {
  log: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "sentinel-runner-"));
  storePath = join(tmpDir, "intelligence.json");
  setStorePath(storePath);
  clearStore();
});

afterEach(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
});

// ── Tests ───────────────────────────────────────────────────────────

describe("runCycle", () => {
  test("runs an empty collector set without errors", async () => {
    const result = await runCycle([], {
      logger: silent,
      reportLiveness: false,
    });
    expect(result.collectorsRun).toBe(0);
    expect(result.collectorsSucceeded).toBe(0);
    expect(result.itemsCollected).toBe(0);
    expect(result.itemsStored).toBe(0);
  });

  test("collects and stores items from a single fake collector", async () => {
    const collector = fakeCollector({
      name: "fake-a",
      items: [
        makeFakeItem({ id: "a-1" }),
        makeFakeItem({ id: "a-2" }),
      ],
    });
    const result = await runCycle([collector], {
      logger: silent,
      reportLiveness: false,
    });
    expect(result.collectorsRun).toBe(1);
    expect(result.collectorsSucceeded).toBe(1);
    expect(result.itemsCollected).toBe(2);
    expect(result.itemsStored).toBe(2);
    expect(getItemCount()).toBe(2);
    const stored = getAllItems().map((e) => e.item.id).sort();
    expect(stored).toEqual(["a-1", "a-2"]);
  });

  test("deduplicates items across cycles", async () => {
    const collector = fakeCollector({
      name: "fake-dedup",
      items: [makeFakeItem({ id: "dup-1" })],
    });
    const first = await runCycle([collector], {
      logger: silent,
      reportLiveness: false,
    });
    expect(first.itemsStored).toBe(1);

    const second = await runCycle([collector], {
      logger: silent,
      reportLiveness: false,
    });
    // Second cycle should not re-store the same id.
    expect(second.itemsCollected).toBe(1);
    expect(second.itemsStored).toBe(0);
    expect(getItemCount()).toBe(1);
  });

  test("runs collectors in parallel and merges results", async () => {
    const a = fakeCollector({
      name: "fake-a",
      items: [makeFakeItem({ id: "a-1" })],
    });
    const b = fakeCollector({
      name: "fake-b",
      items: [
        makeFakeItem({ id: "b-1" }),
        makeFakeItem({ id: "b-2" }),
      ],
    });
    const result = await runCycle([a, b], {
      logger: silent,
      reportLiveness: false,
    });
    expect(result.collectorsRun).toBe(2);
    expect(result.collectorsSucceeded).toBe(2);
    expect(result.itemsCollected).toBe(3);
    expect(result.itemsStored).toBe(3);
  });

  test("captures thrown errors without failing the whole cycle", async () => {
    const good = fakeCollector({
      name: "fake-good",
      items: [makeFakeItem({ id: "good-1" })],
    });
    const bad = fakeCollector({
      name: "fake-bad",
      items: [],
      throws: true,
    });
    const result = await runCycle([good, bad], {
      logger: silent,
      reportLiveness: false,
    });
    expect(result.collectorsRun).toBe(2);
    expect(result.collectorsSucceeded).toBe(1);
    expect(result.itemsCollected).toBe(1);
    expect(result.collectorErrors.some((e) => e.includes("fake-bad"))).toBe(true);
  });

  test("treats success=false collectors as failures but keeps their items", async () => {
    const partial = fakeCollector({
      name: "fake-partial",
      items: [makeFakeItem({ id: "partial-1" })],
      succeed: false,
    });
    const result = await runCycle([partial], {
      logger: silent,
      reportLiveness: false,
    });
    expect(result.collectorsSucceeded).toBe(0);
    expect(result.itemsCollected).toBe(1);
    expect(result.itemsStored).toBe(1);
    expect(result.collectorErrors).toHaveLength(1);
    expect(result.collectorErrors[0]).toContain("fake-partial");
  });

  test("invokes onCollectorResult callback for every collector", async () => {
    const seen: string[] = [];
    const a = fakeCollector({ name: "fake-a", items: [] });
    const b = fakeCollector({ name: "fake-b", items: [] });
    await runCycle([a, b], {
      logger: silent,
      reportLiveness: false,
      onCollectorResult: (result) => {
        seen.push(result.source);
      },
    });
    expect(seen.sort()).toEqual(["fake-a", "fake-b"]);
  });

  test("result timing fields are populated and consistent", async () => {
    const collector = fakeCollector({
      name: "fake-timing",
      items: [makeFakeItem({ id: "t-1" })],
    });
    const result = await runCycle([collector], {
      logger: silent,
      reportLiveness: false,
    });
    expect(typeof result.startedAt).toBe("string");
    expect(typeof result.finishedAt).toBe("string");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(new Date(result.finishedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(result.startedAt).getTime(),
    );
  });
});
