import { describe, expect, test } from "bun:test";
import { CronParseError, nextFire, nextFires, parseCron } from "./parser";

describe("parseCron", () => {
  test("parses canonical 5-field expressions", () => {
    const c = parseCron("*/15 * * * *");
    expect([...c.minutes].sort((a, b) => a - b)).toEqual([0, 15, 30, 45]);
    expect(c.hours.size).toBe(24);
    expect(c.doms.size).toBe(31);
    expect(c.months.size).toBe(12);
    expect(c.dows.size).toBe(7);
  });

  test("expands @hourly / @daily / @weekly / @monthly shortcuts", () => {
    const hourly = parseCron("@hourly");
    expect([...hourly.minutes]).toEqual([0]);
    expect(hourly.hours.size).toBe(24);

    const daily = parseCron("@daily");
    expect([...daily.minutes]).toEqual([0]);
    expect([...daily.hours]).toEqual([0]);

    const weekly = parseCron("@weekly");
    expect([...weekly.dows]).toEqual([0]);

    const monthly = parseCron("@monthly");
    expect([...monthly.doms]).toEqual([1]);
  });

  test("supports lists and ranges", () => {
    const c = parseCron("0 9-17 * * MON-FRI");
    expect([...c.hours].sort((a, b) => a - b)).toEqual([
      9, 10, 11, 12, 13, 14, 15, 16, 17,
    ]);
    expect([...c.dows].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  test("supports steps inside ranges", () => {
    const c = parseCron("0 0-12/2 * * *");
    expect([...c.hours].sort((a, b) => a - b)).toEqual([
      0, 2, 4, 6, 8, 10, 12,
    ]);
  });

  test("treats DOW 7 as Sunday", () => {
    const c = parseCron("0 0 * * 7");
    expect([...c.dows]).toEqual([0]);
  });

  test("rejects fewer or more than 5 fields", () => {
    expect(() => parseCron("* * * *")).toThrow(CronParseError);
    expect(() => parseCron("* * * * * *")).toThrow(CronParseError);
  });

  test("rejects out-of-range field values", () => {
    expect(() => parseCron("60 * * * *")).toThrow(CronParseError);
    expect(() => parseCron("* 24 * * *")).toThrow(CronParseError);
    expect(() => parseCron("* * 32 * *")).toThrow(CronParseError);
    expect(() => parseCron("* * * 13 *")).toThrow(CronParseError);
    expect(() => parseCron("* * * * 8")).toThrow(CronParseError);
  });

  test("rejects unknown shortcuts", () => {
    expect(() => parseCron("@never")).toThrow(CronParseError);
  });

  test("flags vixie-cron OR semantics on DOM+DOW", () => {
    expect(parseCron("0 0 1 * 1").domDowRestricted).toBe(true);
    expect(parseCron("0 0 1 * *").domDowRestricted).toBe(false);
    expect(parseCron("0 0 * * 1").domDowRestricted).toBe(false);
  });
});

describe("nextFire", () => {
  test("returns the next minute matching every-minute expression", () => {
    const cron = parseCron("* * * * *");
    const after = Date.UTC(2026, 0, 1, 12, 30, 15); // 12:30:15 UTC
    const next = nextFire(cron, { after, timezone: "UTC" });
    expect(next).toBe(Date.UTC(2026, 0, 1, 12, 31, 0));
  });

  test("@hourly fires on the next hour boundary", () => {
    const cron = parseCron("@hourly");
    const after = Date.UTC(2026, 0, 1, 12, 30);
    const next = nextFire(cron, { after, timezone: "UTC" });
    expect(next).toBe(Date.UTC(2026, 0, 1, 13, 0));
  });

  test("@daily fires at next midnight UTC", () => {
    const cron = parseCron("@daily");
    const after = Date.UTC(2026, 0, 1, 23, 30);
    const next = nextFire(cron, { after, timezone: "UTC" });
    expect(next).toBe(Date.UTC(2026, 0, 2, 0, 0));
  });

  test("respects a per-job timezone (Sydney is UTC+11 in January)", () => {
    // Fire at midnight Sydney local time on 2 Jan 2026.
    const cron = parseCron("0 0 * * *");
    // 2026-01-01 12:00 UTC == 2026-01-01 23:00 AEDT
    const after = Date.UTC(2026, 0, 1, 12, 0);
    const next = nextFire(cron, { after, timezone: "Australia/Sydney" });
    // Expected: 2026-01-01 13:00 UTC == 2026-01-02 00:00 AEDT
    expect(next).toBe(Date.UTC(2026, 0, 1, 13, 0));
  });

  test("DST forward-jump skips the missing local hour", () => {
    // US/Eastern: 2026-03-08 02:00 local does not exist — clocks jump
    // 01:59 -> 03:00. A "0 2 8 3 *" rule should fire at the next valid
    // 02:00 instead of 03:00 the same day.
    const cron = parseCron("0 2 8 3 *");
    // Anchor BEFORE the spring-forward instant.
    const after = Date.UTC(2026, 2, 8, 5, 0); // 01:00 EST
    const next = nextFire(cron, { after, timezone: "America/New_York" });
    expect(next).not.toBeNull();
    // Next valid 02:00 New York wall-clock is one year later. In 2027,
    // DST starts on the 2nd Sunday of March (2027-03-14), so 2027-03-08
    // 02:00 is still EST (UTC-5) — i.e. 2027-03-08 07:00 UTC.
    expect(next).toBe(Date.UTC(2027, 2, 8, 7, 0));
  });

  test("DST fall-back fires only once on the first matching UTC instant", () => {
    // US/Eastern: 2026-11-01 01:00 local occurs twice (EDT then EST).
    // We assert the function returns the FIRST occurrence.
    const cron = parseCron("0 1 1 11 *");
    const after = Date.UTC(2026, 10, 1, 4, 0); // 00:00 EDT
    const next = nextFire(cron, { after, timezone: "America/New_York" });
    // First 01:00 New York (still EDT) == 05:00 UTC.
    expect(next).toBe(Date.UTC(2026, 10, 1, 5, 0));
  });

  test("nextFires returns N consecutive matches", () => {
    const cron = parseCron("0 * * * *");
    const after = Date.UTC(2026, 0, 1, 0, 30);
    const fires = nextFires(cron, { after, timezone: "UTC" }, 3);
    expect(fires).toEqual([
      Date.UTC(2026, 0, 1, 1, 0),
      Date.UTC(2026, 0, 1, 2, 0),
      Date.UTC(2026, 0, 1, 3, 0),
    ]);
  });

  test("returns null when no match within horizon", () => {
    // Feb 31st never exists.
    const cron = parseCron("0 0 31 2 *");
    const after = Date.UTC(2026, 0, 1);
    const next = nextFire(cron, { after, timezone: "UTC" });
    expect(next).toBeNull();
  });
});
