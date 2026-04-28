import { describe, expect, test } from "bun:test";
import {
  aggregateHistory,
  optimiseSendTime,
} from "../src/send-time-optimiser";

function utcAt(dow: number, hour: number, weekOffset = 0): string {
  // 2026-04-12 was a Sunday — ideal anchor for deterministic dow tests.
  const base = Date.UTC(2026, 3, 12, hour, 0, 0); // Sun 12 Apr 2026
  const dayMs = 86_400_000;
  return new Date(base + dow * dayMs + weekOffset * 7 * dayMs).toISOString();
}

describe("aggregateHistory", () => {
  test("counts opens per (dow, hour) cell", () => {
    const { cells, totalSent, totalOpened } = aggregateHistory(
      [
        { sentAt: utcAt(2, 9), opened: true },
        { sentAt: utcAt(2, 9), opened: true },
        { sentAt: utcAt(2, 9), opened: false },
        { sentAt: utcAt(4, 17), opened: false },
      ],
      "UTC",
    );
    expect(totalSent).toBe(4);
    expect(totalOpened).toBe(2);
    const tuesNine = cells.get(2 * 24 + 9);
    expect(tuesNine).toBeDefined();
    expect(tuesNine?.sent).toBe(3);
    expect(tuesNine?.opened).toBe(2);
  });

  test("malformed timestamps are skipped, not thrown", () => {
    const { totalSent } = aggregateHistory(
      [
        { sentAt: "not-a-date", opened: true },
        { sentAt: utcAt(1, 10), opened: true },
      ],
      "UTC",
    );
    expect(totalSent).toBe(1);
  });
});

describe("optimiseSendTime", () => {
  test("prefers the slot with highest open rate", () => {
    const history: Array<{ sentAt: string; opened: boolean }> = [];
    // Tuesday 9am: 8/10 opens.
    for (let i = 0; i < 10; i++) {
      history.push({ sentAt: utcAt(2, 9, -i), opened: i < 8 });
    }
    // Friday 5pm: 1/10 opens.
    for (let i = 0; i < 10; i++) {
      history.push({ sentAt: utcAt(5, 17, -i), opened: i < 1 });
    }
    const { candidates } = optimiseSendTime(
      {
        recipientHistory: history,
        recipientTimezone: "UTC",
        nowIso: utcAt(0, 12),
      },
      { topN: 3 },
    );
    expect(candidates.length).toBe(3);
    const best = candidates.reduce((a, b) =>
      a.predictedOpenProbability >= b.predictedOpenProbability ? a : b,
    );
    expect(best.localHour).toBe(9);
    expect(best.localDayOfWeek).toBe(2);
  });

  test("empty history still returns topN candidates using baseline", () => {
    const { candidates } = optimiseSendTime(
      {
        recipientHistory: [],
        recipientTimezone: "UTC",
        nowIso: utcAt(0, 12),
      },
      { topN: 3, baselineOpenRate: 0.21 },
    );
    expect(candidates.length).toBe(3);
    for (const c of candidates) {
      expect(c.predictedOpenProbability).toBeCloseTo(0.21, 1);
      expect(c.observationCount).toBe(0);
    }
  });

  test("send times all fall in the next 7 days from `now`", () => {
    const nowIso = utcAt(0, 12);
    const nowMs = Date.parse(nowIso);
    const { candidates } = optimiseSendTime(
      {
        recipientHistory: [{ sentAt: utcAt(3, 14), opened: true }],
        recipientTimezone: "UTC",
        nowIso,
      },
      { topN: 3 },
    );
    for (const c of candidates) {
      const t = Date.parse(c.sendAt);
      expect(t).toBeGreaterThan(nowMs);
      expect(t).toBeLessThanOrEqual(nowMs + 8 * 86_400_000);
    }
  });

  test("topN clamps to at least 1", () => {
    const { candidates } = optimiseSendTime(
      {
        recipientHistory: [],
        recipientTimezone: "UTC",
        nowIso: utcAt(0, 12),
      },
      { topN: 0 },
    );
    expect(candidates.length).toBe(1);
  });
});
