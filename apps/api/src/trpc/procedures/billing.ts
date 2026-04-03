import { z } from "zod";
import { eq, and, gte, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../init";
import {
  users,
  subscriptions,
  usageRecords,
} from "@cronix/db";
import {
  createCustomer,
  createCheckoutSession,
  createPortalSession,
  cancelSubscription as stripeCancelSubscription,
  listInvoices,
} from "../../billing/stripe";
import { PLANS, PlanId, BillingInterval, getStripePriceId } from "../../billing/plans";

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const CreateCheckoutInput = z.object({
  planId: PlanId.exclude(["free", "enterprise"]),
  interval: BillingInterval,
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  quantity: z.number().int().positive().optional(),
});

const CreatePortalInput = z.object({
  returnUrl: z.string().url(),
});

const CancelSubscriptionInput = z.object({
  cancelImmediately: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Billing router
// ---------------------------------------------------------------------------

export const billingRouter = router({
  /**
   * Get the current user's subscription (or null for free tier).
   */
  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    const result = await ctx.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, ctx.userId))
      .limit(1);

    const sub = result[0] ?? null;

    // Resolve the full plan definition alongside the DB record
    const planId = (sub?.plan ?? "free") as z.infer<typeof PlanId>;
    const plan = PLANS[planId];

    return {
      subscription: sub,
      plan,
    };
  }),

  /**
   * Create a Stripe Checkout session to subscribe / upgrade.
   */
  createCheckoutSession: protectedProcedure
    .input(CreateCheckoutInput)
    .mutation(async ({ ctx, input }) => {
      const { planId, interval, successUrl, cancelUrl, quantity } = input;

      const priceId = getStripePriceId(planId, interval);
      if (!priceId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `No Stripe price configured for plan "${planId}" (${interval}).`,
        });
      }

      // Get or create stripe customer
      const existingSub = await ctx.db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, ctx.userId))
        .limit(1);

      let customerId: string;

      if (existingSub[0]?.stripeCustomerId) {
        customerId = existingSub[0].stripeCustomerId;
      } else {
        // Look up the user to get email + name
        const userResult = await ctx.db
          .select()
          .from(users)
          .where(eq(users.id, ctx.userId))
          .limit(1);

        const user = userResult[0];
        if (!user) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found.",
          });
        }

        const customer = await createCustomer({
          email: user.email,
          name: user.displayName,
          userId: ctx.userId,
        });

        customerId = customer.id;

        // Persist the subscription row with customer ID (free tier placeholder)
        await ctx.db.insert(subscriptions).values({
          id: crypto.randomUUID(),
          userId: ctx.userId,
          stripeCustomerId: customerId,
          status: "incomplete",
          plan: "free",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      const session = await createCheckoutSession({
        customerId,
        priceId,
        successUrl,
        cancelUrl,
        ...(quantity !== undefined ? { quantity } : {}),
      });

      return { url: session.url };
    }),

  /**
   * Create a Stripe Customer Portal session (manage subscription, invoices, payment methods).
   */
  createPortalSession: protectedProcedure
    .input(CreatePortalInput)
    .mutation(async ({ ctx, input }) => {
      const existingSub = await ctx.db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, ctx.userId))
        .limit(1);

      const sub = existingSub[0];
      if (!sub?.stripeCustomerId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No billing account found. Subscribe to a plan first.",
        });
      }

      const session = await createPortalSession({
        customerId: sub.stripeCustomerId,
        returnUrl: input.returnUrl,
      });

      return { url: session.url };
    }),

  /**
   * Cancel the current subscription.
   */
  cancelSubscription: protectedProcedure
    .input(CancelSubscriptionInput)
    .mutation(async ({ ctx, input }) => {
      const existingSub = await ctx.db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, ctx.userId))
        .limit(1);

      const sub = existingSub[0];
      if (!sub?.stripeSubscriptionId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No active subscription to cancel.",
        });
      }

      const updated = await stripeCancelSubscription(
        sub.stripeSubscriptionId,
        input.cancelImmediately,
      );

      // Update local DB immediately (webhook will also fire)
      await ctx.db
        .update(subscriptions)
        .set({
          cancelAtPeriodEnd: !input.cancelImmediately,
          status: input.cancelImmediately ? "canceled" : sub.status,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.userId, ctx.userId));

      return {
        cancelAtPeriodEnd: updated.cancel_at_period_end,
        currentPeriodEnd: new Date(updated.current_period_end * 1000),
      };
    }),

  /**
   * Get usage for the current billing period.
   */
  getUsage: protectedProcedure.query(async ({ ctx }) => {
    // Determine the current billing period start
    const subResult = await ctx.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, ctx.userId))
      .limit(1);

    const sub = subResult[0];
    const periodStart = sub?.currentPeriodStart ?? new Date(0);

    // Aggregate usage by type for the current period
    const usageRows = await ctx.db
      .select({
        type: usageRecords.type,
        total: sql<number>`sum(${usageRecords.quantity})`,
      })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.userId, ctx.userId),
          gte(usageRecords.recordedAt, periodStart),
        ),
      )
      .groupBy(usageRecords.type);

    const usage: Record<string, number> = {
      ai_tokens: 0,
      video_minutes: 0,
      storage_bytes: 0,
    };

    for (const row of usageRows) {
      usage[row.type] = row.total;
    }

    // Get plan limits for context
    const planId = (sub?.plan ?? "free") as z.infer<typeof PlanId>;
    const plan = PLANS[planId];

    return {
      usage,
      limits: plan.limits,
      periodStart,
      periodEnd: sub?.currentPeriodEnd ?? null,
    };
  }),

  /**
   * List past invoices from Stripe.
   */
  getInvoices: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(12),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const subResult = await ctx.db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, ctx.userId))
        .limit(1);

      const sub = subResult[0];
      if (!sub?.stripeCustomerId) {
        return { invoices: [] };
      }

      const invoices = await listInvoices(
        sub.stripeCustomerId,
        input?.limit ?? 12,
      );

      return {
        invoices: invoices.map((inv) => ({
          id: inv.id,
          number: inv.number,
          status: inv.status,
          amountDue: inv.amount_due,
          amountPaid: inv.amount_paid,
          currency: inv.currency,
          periodStart: inv.period_start
            ? new Date(inv.period_start * 1000)
            : null,
          periodEnd: inv.period_end
            ? new Date(inv.period_end * 1000)
            : null,
          invoicePdf: inv.invoice_pdf,
          hostedInvoiceUrl: inv.hosted_invoice_url,
          createdAt: inv.created ? new Date(inv.created * 1000) : null,
        })),
      };
    }),

  /**
   * Get available plans.
   */
  getPlans: protectedProcedure.query(() => {
    return { plans: Object.values(PLANS) };
  }),
});
