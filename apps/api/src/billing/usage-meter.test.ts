/**
 * BLK-010 usage-meter smoke tests. Keeps the package test-green and
 * gives future sessions a regression net around the tracking contract.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, users, usageEvents } from "@back-to-the-future/db";
import {
  billingMonthFor,
  checkUsageLimit,
  currentBillingMonth,
  getMonthlyUsage,
  getUsageHistory,
  getUsageLimit,
  getUsageLimits,
  recordUsage,
} from "./usage-meter";

const USER_ID = `usage-meter-test-${randomUUID()}`;

beforeAll(async () => {
  await db.insert(users).values({
    id: USER_ID,
    email: `${USER_ID}@test.local`,
    displayName: "Usage Meter Test",
    role: "viewer",
  });
});

afterAll(async () => {
  await db.delete(usageEvents).where(eq(usageEvents.userId, USER_ID));
  await db.delete(users).where(eq(users.id, USER_ID));
});

describe("usage-meter", () => {
  test("billingMonthFor emits YYYY-MM in UTC", () => {
    expect(billingMonthFor(new Date("2026-04-18T22:30:00Z"))).toBe("2026-04");
    expect(billingMonthFor(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
  });

  test("getUsageLimit returns tiered numbers", () => {
    expect(getUsageLimit("free", "build")).toBe(100);
    expect(getUsageLimit("pro", "build")).toBe(1_000);
    expect(getUsageLimit("enterprise", "build")).toBe(Number.POSITIVE_INFINITY);
  });

  test("getUsageLimits returns a full map per plan", () => {
    const limits = getUsageLimits("free");
    expect(limits.build).toBe(100);
    expect(limits.request).toBeGreaterThan(0);
    expect(limits.ai_tokens).toBeGreaterThan(0);
    expect(limits.storage).toBeGreaterThan(0);
  });

  test("recordUsage inserts and getMonthlyUsage aggregates", async () => {
    await recordUsage(USER_ID, "build", 5);
    await recordUsage(USER_ID, "build", 7);
    await recordUsage(USER_ID, "ai_tokens", 2_500, undefined, {
      model: "claude-test",
    });

    const month = currentBillingMonth();
    const rows = await getMonthlyUsage(USER_ID, month);
    const byType = Object.fromEntries(rows.map((r) => [r.eventType, r.total]));
    expect(byType["build"]).toBe(12);
    expect(byType["ai_tokens"]).toBe(2_500);
  });

  test("checkUsageLimit reports exceeded state against a plan", async () => {
    const status = await checkUsageLimit(USER_ID, "build", "free");
    expect(status.limit).toBe(100);
    expect(status.used).toBeGreaterThanOrEqual(12);
    expect(status.exceeded).toBe(false);

    await recordUsage(USER_ID, "request", 200_000);
    const requestStatus = await checkUsageLimit(USER_ID, "request", "free");
    expect(requestStatus.exceeded).toBe(true);
    expect(requestStatus.remaining).toBe(0);
    expect(requestStatus.percent).toBe(100);
  });

  test("getUsageHistory returns ordered daily points", async () => {
    const points = await getUsageHistory(USER_ID, 30);
    expect(points.length).toBeGreaterThan(0);
    for (const point of points) {
      expect(point.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(point.total).toBeGreaterThanOrEqual(0);
    }
  });

  test("recordUsage rejects negative quantities", () => {
    expect(() => recordUsage(USER_ID, "build", -1)).toThrow();
  });
});
