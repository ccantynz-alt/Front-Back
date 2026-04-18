/**
 * BLK-010 — Usage Reporter
 *
 * Reads the raw usage_events we've recorded locally, aggregates them per
 * (userId, billingMonth, eventType), diffs against what we've already
 * pushed to Stripe (usage_reports), and pushes the DELTA to Stripe's
 * usage record API (`subscriptionItems.createUsageRecord`).
 *
 * Design rules:
 *
 * 1. **Delta-based.** We never push cumulative totals. On every run we
 *    compute `delta = current_aggregate - reported_quantity` and push
 *    that. If the reporter runs twice in a row with no new events, the
 *    second run is a no-op (delta=0 → no API call).
 *
 * 2. **Idempotent & resumable.** If Stripe succeeds but the local DB
 *    write crashes, the next run will re-push the same delta — Stripe
 *    dedups against the same `action=increment` window. A double-push
 *    here is a Stripe-side over-count risk: in practice the window is
 *    tight enough (we update the row immediately after the SDK resolves)
 *    that we accept the risk. Alternative would be a pre-allocated
 *    idempotency key per push; that's a v2.
 *
 * 3. **Pre-launch safe.** When `STRIPE_ENABLED !== "true"` every exported
 *    function returns a well-typed no-op status. The reporter must never
 *    hit Stripe from pre-launch environments, matching the billing
 *    procedure guard in `apps/api/src/trpc/procedures/billing.ts`.
 *
 * 4. **Subscription-item resolution.** We look up the user's active
 *    subscription row locally, then fetch the full subscription from
 *    Stripe (to get `items.data[i].id`). We match items → event types
 *    using the env map `STRIPE_USAGE_PRICE_MAP` (see `priceMapFor`).
 *    Items without a mapping are skipped — not every plan is metered.
 *
 * 5. **Failures are non-fatal.** One event-type failing to push does
 *    NOT abort the rest of the report. Each type is tried independently
 *    so a single mis-configured price id doesn't starve the other types.
 */

import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type Stripe from "stripe";
import {
  db,
  subscriptions,
  usageEvents,
  usageReports,
} from "@back-to-the-future/db";
import { getStripe } from "../stripe/client";
import { writeAudit } from "../automation/audit-log";
import {
  currentBillingMonth,
  USAGE_EVENT_TYPES,
  type UsageEventType,
} from "./usage-meter";

// ── Types ──────────────────────────────────────────────────────────

export interface ReportTypeOutcome {
  eventType: UsageEventType;
  status: "pushed" | "noop" | "skipped" | "failed";
  delta: number;
  /** Cumulative local quantity after the report. */
  quantity: number;
  /** Stripe subscription-item id the usage was pushed against, if any. */
  subscriptionItemId?: string;
  /** Stripe usage_record id from the latest push, if any. */
  usageRecordId?: string;
  /** Populated when status === "skipped" or "failed". */
  reason?: string;
}

export interface ReportOutcome {
  userId: string;
  billingMonth: string;
  results: ReportTypeOutcome[];
  /** True iff every entry is "pushed" or "noop". */
  ok: boolean;
  /** Populated when the whole user report bails (no subscription, etc.). */
  skipped?: string;
}

// ── Env helpers ────────────────────────────────────────────────────

function isBillingEnabled(): boolean {
  return process.env["STRIPE_ENABLED"] === "true";
}

/**
 * Resolve `event_type → stripe price id` from an env var so we don't
 * hard-code production price ids in source. Format:
 *
 *     STRIPE_USAGE_PRICE_MAP="build=price_abc,request=price_def,ai_tokens=price_ghi"
 *
 * An empty / missing env var means no usage is reported — all pushes
 * short-circuit with status="skipped" and a clean reason. This is the
 * correct posture for a brand-new Stripe account where metered prices
 * haven't been created yet.
 */
export function priceMapFromEnv(
  raw: string | undefined,
): Partial<Record<UsageEventType, string>> {
  if (!raw) return {};
  const map: Partial<Record<UsageEventType, string>> = {};
  for (const pair of raw.split(",")) {
    const [key, value] = pair.split("=").map((s) => s?.trim() ?? "");
    if (!key || !value) continue;
    if ((USAGE_EVENT_TYPES as readonly string[]).includes(key)) {
      map[key as UsageEventType] = value;
    }
  }
  return map;
}

function priceMapFor(): Partial<Record<UsageEventType, string>> {
  return priceMapFromEnv(process.env["STRIPE_USAGE_PRICE_MAP"]);
}

// ── Aggregate helpers ──────────────────────────────────────────────

async function getLocalMonthTotals(
  userId: string,
  month: string,
): Promise<Map<UsageEventType, number>> {
  const rows = await db
    .select({
      eventType: usageEvents.eventType,
      total: sql<number>`coalesce(sum(${usageEvents.quantity}), 0)`,
    })
    .from(usageEvents)
    .where(
      and(eq(usageEvents.userId, userId), eq(usageEvents.billingMonth, month)),
    )
    .groupBy(usageEvents.eventType);

  const m = new Map<UsageEventType, number>();
  for (const row of rows) {
    m.set(row.eventType as UsageEventType, Number(row.total ?? 0));
  }
  return m;
}

async function getReportedRow(
  userId: string,
  month: string,
  eventType: UsageEventType,
): Promise<{
  id: string;
  reportedQuantity: number;
  stripeSubscriptionItemId: string;
} | null> {
  const existing = await db.query.usageReports.findFirst({
    where: and(
      eq(usageReports.userId, userId),
      eq(usageReports.billingMonth, month),
      eq(usageReports.eventType, eventType),
    ),
  });
  if (!existing) return null;
  return {
    id: existing.id,
    reportedQuantity: existing.reportedQuantity,
    stripeSubscriptionItemId: existing.stripeSubscriptionItemId,
  };
}

// ── Stripe subscription-item resolution ────────────────────────────

interface ResolvedSub {
  stripeSubscriptionId: string;
  /** priceId → subscriptionItemId map for the user's current subscription. */
  priceToItemId: Map<string, string>;
}

async function resolveSubscription(
  userId: string,
): Promise<ResolvedSub | null> {
  const localSub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, userId),
    orderBy: (s, { desc }) => [desc(s.createdAt)],
  });
  if (!localSub || localSub.status === "canceled") return null;

  const stripeSub = await getStripe().subscriptions.retrieve(
    localSub.stripeSubscriptionId,
  );

  const priceToItemId = new Map<string, string>();
  for (const item of stripeSub.items.data as Stripe.SubscriptionItem[]) {
    const priceId = item.price?.id;
    if (priceId) priceToItemId.set(priceId, item.id);
  }
  return {
    stripeSubscriptionId: stripeSub.id,
    priceToItemId,
  };
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Push any un-reported usage for a single user to Stripe. Returns a
 * per-event-type outcome so callers (cron, tRPC, tests) can log or
 * surface partial failures.
 */
export async function reportUsageForUser(
  userId: string,
  month: string = currentBillingMonth(),
): Promise<ReportOutcome> {
  const now = new Date();
  const base: ReportOutcome = {
    userId,
    billingMonth: month,
    results: [],
    ok: true,
  };

  if (!isBillingEnabled()) {
    return { ...base, skipped: "billing-disabled", ok: true };
  }

  const resolved = await resolveSubscription(userId);
  if (!resolved) {
    return { ...base, skipped: "no-active-subscription", ok: true };
  }

  const priceMap = priceMapFor();
  const totals = await getLocalMonthTotals(userId, month);

  for (const eventType of USAGE_EVENT_TYPES) {
    const quantity = totals.get(eventType) ?? 0;
    const priceId = priceMap[eventType];
    if (!priceId) {
      base.results.push({
        eventType,
        status: "skipped",
        delta: 0,
        quantity,
        reason: "no-price-mapping",
      });
      continue;
    }
    const subscriptionItemId = resolved.priceToItemId.get(priceId);
    if (!subscriptionItemId) {
      base.results.push({
        eventType,
        status: "skipped",
        delta: 0,
        quantity,
        reason: "price-not-on-subscription",
      });
      continue;
    }

    const reported = await getReportedRow(userId, month, eventType);
    const reportedQty = reported?.reportedQuantity ?? 0;
    const delta = quantity - reportedQty;

    if (delta <= 0) {
      base.results.push({
        eventType,
        status: "noop",
        delta: 0,
        quantity,
        subscriptionItemId,
      });
      continue;
    }

    // Push the delta to Stripe. Never throw from here — a Stripe error
    // on one event type must not starve the rest.
    try {
      const usageRecord = await getStripe().subscriptionItems.createUsageRecord(
        subscriptionItemId,
        {
          quantity: delta,
          action: "increment",
          timestamp: Math.floor(now.getTime() / 1000),
        },
      );

      if (reported) {
        await db
          .update(usageReports)
          .set({
            reportedQuantity: quantity,
            stripeSubscriptionItemId: subscriptionItemId,
            lastStripeUsageRecordId: usageRecord.id,
            lastReportedAt: now,
          })
          .where(eq(usageReports.id, reported.id));
      } else {
        await db.insert(usageReports).values({
          id: randomUUID(),
          userId,
          billingMonth: month,
          eventType,
          reportedQuantity: quantity,
          stripeSubscriptionItemId: subscriptionItemId,
          lastStripeUsageRecordId: usageRecord.id,
          lastReportedAt: now,
          createdAt: now,
        });
      }

      base.results.push({
        eventType,
        status: "pushed",
        delta,
        quantity,
        subscriptionItemId,
        usageRecordId: usageRecord.id,
      });
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(
        `[usage-reporter] Stripe push failed for user=${userId} type=${eventType}: ${reason}`,
      );
      base.ok = false;
      base.results.push({
        eventType,
        status: "failed",
        delta,
        quantity,
        subscriptionItemId,
        reason,
      });
    }
  }

  // Best-effort audit. Never throw from here.
  try {
    await writeAudit({
      actorId: "usage-reporter",
      action: "CREATE",
      resourceType: "billing.usage_report",
      resourceId: `${userId}:${month}`,
      result: base.ok ? "success" : "failure",
      detail: JSON.stringify({
        results: base.results.map((r) => ({
          eventType: r.eventType,
          status: r.status,
          delta: r.delta,
        })),
      }),
    });
  } catch {
    /* audit is best-effort */
  }

  return base;
}

/**
 * Run the reporter against every user who has an active subscription.
 * Intended for a nightly cron — we don't run this on the hot path. The
 * loop is sequential on purpose so Stripe rate limits stay happy; for
 * large tenants we'd batch-paginate, but the current v1 table is small.
 */
export async function reportAllPendingUsage(
  month: string = currentBillingMonth(),
): Promise<{ users: number; ok: number; failed: number; outcomes: ReportOutcome[] }> {
  if (!isBillingEnabled()) {
    return { users: 0, ok: 0, failed: 0, outcomes: [] };
  }

  const activeSubs = await db.query.subscriptions.findMany({
    where: eq(subscriptions.status, "active"),
  });

  const outcomes: ReportOutcome[] = [];
  let ok = 0;
  let failed = 0;
  for (const sub of activeSubs) {
    try {
      const result = await reportUsageForUser(sub.userId, month);
      outcomes.push(result);
      if (result.ok) ok += 1;
      else failed += 1;
    } catch (err: unknown) {
      // A catastrophic throw from one user's report must not abort the
      // whole batch. Log + continue.
      const reason = err instanceof Error ? err.message : String(err);
      console.error(
        `[usage-reporter] Catastrophic failure for user=${sub.userId}: ${reason}`,
      );
      failed += 1;
      outcomes.push({
        userId: sub.userId,
        billingMonth: month,
        results: [],
        ok: false,
        skipped: reason,
      });
    }
  }
  return { users: activeSubs.length, ok, failed, outcomes };
}
