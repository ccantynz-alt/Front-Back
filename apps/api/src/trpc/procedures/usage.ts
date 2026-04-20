/**
 * BLK-010 — Usage tRPC procedures.
 *
 * Exposes per-caller views onto the usage-meter:
 *   - `usage.getMonthly()` — totals per event type for a billing month
 *   - `usage.getLimits()`  — limits + current usage + percent for each type
 *   - `usage.history()`    — daily totals for the last N days
 *
 * All queries are filtered by the caller's userId — no cross-tenant reads.
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import { subscriptions, plans } from "@back-to-the-future/db";
import { router, protectedProcedure } from "../init";
import {
  USAGE_EVENT_TYPES,
  checkUsageLimit,
  currentBillingMonth,
  getMonthlyUsage,
  getUsageHistory,
  getUsageLimits,
  type PlanTier,
  type UsageEventType,
} from "../../billing/usage-meter";

const BillingMonth = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "month must be in YYYY-MM format");

/**
 * Best-effort plan resolution. Reads the user's newest active subscription
 * and maps the plan name back to our internal tier. Falls back to "free"
 * for unsubscribed users — billing hasn't launched yet, so most users will
 * land here by design.
 */
async function resolvePlan(
  ctx: { db: typeof import("@back-to-the-future/db").db },
  userId: string,
): Promise<PlanTier> {
  try {
    const sub = await ctx.db.query.subscriptions.findFirst({
      where: eq(subscriptions.userId, userId),
      orderBy: (subs, { desc }) => [desc(subs.createdAt)],
    });

    if (!sub || (sub.status !== "active" && sub.status !== "trialing")) {
      return "free";
    }

    const plan = await ctx.db.query.plans.findFirst({
      where: eq(plans.stripePriceId, sub.stripePriceId),
    });

    const name = plan?.name?.toLowerCase() ?? "";
    if (name.includes("enterprise")) return "enterprise";
    if (name.includes("pro")) return "pro";
    return "free";
  } catch {
    // Plan lookup is never allowed to fail the request — fall back
    // to the safest tier.
    return "free";
  }
}

export const usageRouter = router({
  /** Aggregate monthly usage for the caller. Defaults to the current month. */
  getMonthly: protectedProcedure
    .input(
      z
        .object({
          month: BillingMonth.optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const month = input?.month ?? currentBillingMonth();
      const rows = await getMonthlyUsage(ctx.userId, month);

      // Ensure every event type appears in the result, even with zero usage.
      const byType = new Map(rows.map((r) => [r.eventType, r]));
      const filled = USAGE_EVENT_TYPES.map((eventType) => {
        const existing = byType.get(eventType);
        return (
          existing ?? {
            eventType,
            total: 0,
            unit: unitFor(eventType),
          }
        );
      });

      return { month, usage: filled };
    }),

  /** Caller's plan limits with current usage + percent consumed. */
  getLimits: protectedProcedure.query(async ({ ctx }) => {
    const plan = await resolvePlan(ctx, ctx.userId);
    const limits = getUsageLimits(plan);

    const statuses = await Promise.all(
      USAGE_EVENT_TYPES.map(async (eventType) => {
        const status = await checkUsageLimit(ctx.userId, eventType, plan);
        return {
          eventType,
          unit: unitFor(eventType),
          used: status.used,
          limit: serializeLimit(limits[eventType]),
          remaining: serializeLimit(status.remaining),
          percent: Number(status.percent.toFixed(2)),
          exceeded: status.exceeded,
        };
      }),
    );

    return { plan, month: currentBillingMonth(), limits: statuses };
  }),

  /** Last N days (default 30) of daily usage, grouped by event type. */
  history: protectedProcedure
    .input(
      z
        .object({
          days: z.number().int().min(1).max(365).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 30;
      const points = await getUsageHistory(ctx.userId, days);
      return { days, points };
    }),
});

// ── Local helpers ──────────────────────────────────────────────────

const UNIT_BY_TYPE: Record<UsageEventType, string> = {
  build: "minutes",
  request: "requests",
  ai_tokens: "tokens",
  storage: "bytes",
};

function unitFor(eventType: UsageEventType): string {
  return UNIT_BY_TYPE[eventType];
}

/**
 * JSON cannot represent `Infinity`. We use `null` to signal "unlimited"
 * so the frontend can render a proper badge without parsing magic numbers.
 */
function serializeLimit(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}
