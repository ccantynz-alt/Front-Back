/**
 * BLK-010 — Usage Meter
 *
 * Tracking infrastructure for Stripe metered billing. Every billable
 * operation in the platform (builds, edge requests, AI tokens, storage)
 * records a row here. A later cron/reporter (not in this file) aggregates
 * rows by (userId, billingMonth, eventType) and pushes totals to Stripe's
 * usage record API.
 *
 * We deliberately do NOT hit Stripe from the hot path. If Stripe is down,
 * we still record usage. The aggregator is eventually-consistent and
 * resume-safe.
 */

import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db, usageEvents } from "@back-to-the-future/db";

// ── Types ──────────────────────────────────────────────────────────

export type UsageEventType = "build" | "request" | "ai_tokens" | "storage";
export type PlanTier = "free" | "pro" | "enterprise";

export interface RecordUsageOptions {
  projectId?: string;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
}

export interface MonthlyUsageRow {
  eventType: UsageEventType;
  total: number;
  unit: string;
}

export interface UsageLimitStatus {
  used: number;
  limit: number;
  exceeded: boolean;
  remaining: number;
  percent: number;
}

export interface DailyUsagePoint {
  day: string; // YYYY-MM-DD (UTC)
  eventType: UsageEventType;
  total: number;
}

// ── Plan Limits ────────────────────────────────────────────────────
// Soft caps — the aggregator/reporter enforces Stripe-side. These are
// what we expose to the user and what client-side gating checks.
// Enterprise returns Infinity for effectively-unlimited tiers. Storage
// is denominated in bytes so we can track it at the finest resolution.

const UNLIMITED = Number.POSITIVE_INFINITY;

const PLAN_LIMITS: Record<PlanTier, Record<UsageEventType, number>> = {
  free: {
    build: 100, // 100 build minutes / month
    request: 100_000, // 100k edge requests / month
    ai_tokens: 100_000, // 100k AI tokens / month
    storage: 1_073_741_824, // 1 GiB
  },
  pro: {
    build: 1_000,
    request: 10_000_000,
    ai_tokens: 10_000_000,
    storage: 107_374_182_400, // 100 GiB
  },
  enterprise: {
    build: UNLIMITED,
    request: UNLIMITED,
    ai_tokens: UNLIMITED,
    storage: UNLIMITED,
  },
};

const UNIT_BY_TYPE: Record<UsageEventType, string> = {
  build: "minutes",
  request: "requests",
  ai_tokens: "tokens",
  storage: "bytes",
};

// ── Helpers ────────────────────────────────────────────────────────

/** UTC YYYY-MM for a given date. */
export function billingMonthFor(date: Date): string {
  const yyyy = date.getUTCFullYear().toString().padStart(4, "0");
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${yyyy}-${mm}`;
}

/** UTC YYYY-MM-DD for a given date. */
function utcDay(date: Date): string {
  const yyyy = date.getUTCFullYear().toString().padStart(4, "0");
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = date.getUTCDate().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Current billing month, for callers that don't need a custom date. */
export function currentBillingMonth(): string {
  return billingMonthFor(new Date());
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Record a single usage event. Non-blocking insert. Never throws on
 * billing-side concerns — if we can't insert, we log and move on rather
 * than take down the request that generated the event.
 */
export async function recordUsage(
  userId: string,
  eventType: UsageEventType,
  quantity: number,
  optionsOrProjectId?: string | RecordUsageOptions,
  metadata?: Record<string, unknown>,
): Promise<{ id: string }> {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error(
      `recordUsage: quantity must be a finite non-negative number (got ${quantity})`,
    );
  }

  // Overloaded signature — accept either (projectId, metadata) or options.
  const options: RecordUsageOptions =
    typeof optionsOrProjectId === "string"
      ? {
          projectId: optionsOrProjectId,
          ...(metadata !== undefined ? { metadata } : {}),
        }
      : (optionsOrProjectId ?? {});

  const occurredAt = options.occurredAt ?? new Date();
  const id = randomUUID();

  await db.insert(usageEvents).values({
    id,
    userId,
    projectId: options.projectId ?? null,
    eventType,
    quantity: Math.trunc(quantity),
    unit: UNIT_BY_TYPE[eventType],
    metadata: options.metadata ? JSON.stringify(options.metadata) : null,
    occurredAt,
    billingMonth: billingMonthFor(occurredAt),
  });

  return { id };
}

/**
 * Aggregate one user's usage for a given billing month, grouped by
 * event type. Month format: "YYYY-MM" (UTC).
 */
export async function getMonthlyUsage(
  userId: string,
  month: string,
): Promise<MonthlyUsageRow[]> {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error(`getMonthlyUsage: month must be YYYY-MM (got ${month})`);
  }

  const rows = await db
    .select({
      eventType: usageEvents.eventType,
      total: sql<number>`coalesce(sum(${usageEvents.quantity}), 0)`,
      unit: sql<string>`coalesce(max(${usageEvents.unit}), '')`,
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.userId, userId),
        eq(usageEvents.billingMonth, month),
      ),
    )
    .groupBy(usageEvents.eventType);

  return rows.map((r) => ({
    eventType: r.eventType as UsageEventType,
    total: Number(r.total ?? 0),
    unit: r.unit || UNIT_BY_TYPE[r.eventType as UsageEventType],
  }));
}

/** Plan limit for a single (plan, eventType). */
export function getUsageLimit(plan: PlanTier, eventType: UsageEventType): number {
  return PLAN_LIMITS[plan][eventType];
}

/** All limits for a plan — useful for the limits view. */
export function getUsageLimits(
  plan: PlanTier,
): Record<UsageEventType, number> {
  return { ...PLAN_LIMITS[plan] };
}

/**
 * Check one user's current-month usage against their plan limit for a
 * given event type. Plan defaults to "free" — callers that know the
 * real plan should pass it.
 */
export async function checkUsageLimit(
  userId: string,
  eventType: UsageEventType,
  plan: PlanTier = "free",
): Promise<UsageLimitStatus> {
  const month = currentBillingMonth();
  const rows = await db
    .select({
      total: sql<number>`coalesce(sum(${usageEvents.quantity}), 0)`,
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.userId, userId),
        eq(usageEvents.billingMonth, month),
        eq(usageEvents.eventType, eventType),
      ),
    );

  const used = Number(rows[0]?.total ?? 0);
  const limit = getUsageLimit(plan, eventType);
  const exceeded = used >= limit;
  const remaining = Number.isFinite(limit)
    ? Math.max(0, limit - used)
    : UNLIMITED;
  const percent = Number.isFinite(limit) && limit > 0
    ? Math.min(100, (used / limit) * 100)
    : 0;

  return { used, limit, exceeded, remaining, percent };
}

/**
 * Return daily totals for the last N days, grouped by (day, eventType).
 * Used by the usage history view. Defaults to 30 days.
 */
export async function getUsageHistory(
  userId: string,
  days = 30,
): Promise<DailyUsagePoint[]> {
  const safeDays = Math.max(1, Math.min(365, Math.trunc(days)));
  const now = new Date();
  const from = new Date(now.getTime() - safeDays * 24 * 60 * 60 * 1000);
  // Inclusive upper bound so events written in the same ms as the call
  // still land in the window. Prevents flaky tests on very fast inserts.
  const to = now;

  const rows = await db
    .select({
      occurredAt: usageEvents.occurredAt,
      eventType: usageEvents.eventType,
      quantity: usageEvents.quantity,
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.userId, userId),
        gte(usageEvents.occurredAt, from),
        lte(usageEvents.occurredAt, to),
      ),
    )
    .orderBy(desc(usageEvents.occurredAt));

  // Bucket in JS so we don't fight SQLite's date-format semantics.
  const buckets = new Map<string, DailyUsagePoint>();
  for (const row of rows) {
    const day = utcDay(row.occurredAt);
    const key = `${day}::${row.eventType}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.total += row.quantity;
    } else {
      buckets.set(key, {
        day,
        eventType: row.eventType as UsageEventType,
        total: row.quantity,
      });
    }
  }

  return [...buckets.values()].sort((a, b) =>
    a.day === b.day
      ? a.eventType.localeCompare(b.eventType)
      : a.day.localeCompare(b.day),
  );
}

// ── Constants exported for the tRPC layer ──────────────────────────

export const USAGE_EVENT_TYPES: readonly UsageEventType[] = [
  "build",
  "request",
  "ai_tokens",
  "storage",
] as const;
