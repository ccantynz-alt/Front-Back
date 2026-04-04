import { z } from "zod";
import { eq, and, desc, gte, count, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../init";
import { plans, subscriptions, invoices, sites, deployments } from "@back-to-the-future/db";
import { getStripe } from "../../billing/stripe";

// ── Router ─────────────────────────────────────────────────────────

export const billingRouter = router({
  /**
   * Get all active plans, ordered by sortOrder.
   */
  plans: publicProcedure.query(async ({ ctx }) => {
    const result = await ctx.db
      .select()
      .from(plans)
      .where(eq(plans.isActive, true))
      .orderBy(plans.sortOrder);

    return result;
  }),

  /**
   * Get current user's subscription with plan details.
   */
  subscription: protectedProcedure.query(async ({ ctx }) => {
    const result = await ctx.db
      .select({
        subscription: subscriptions,
        plan: plans,
      })
      .from(subscriptions)
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .where(eq(subscriptions.userId, ctx.userId))
      .limit(1);

    const row = result[0];
    if (!row) {
      return null;
    }

    return {
      ...row.subscription,
      plan: row.plan,
    };
  }),

  /**
   * Create a Stripe Checkout session for a plan.
   * Returns the session ID and URL for client-side redirect.
   */
  createCheckout: protectedProcedure
    .input(
      z.object({
        planId: z.string(),
        successUrl: z.string().url(),
        cancelUrl: z.string().url(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Fetch the plan and verify it has a stripePriceId
      const planResult = await ctx.db
        .select()
        .from(plans)
        .where(and(eq(plans.id, input.planId), eq(plans.isActive, true)))
        .limit(1);

      const plan = planResult[0];
      if (!plan) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Plan not found: ${input.planId}`,
        });
      }

      if (!plan.stripePriceId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This plan is not available for checkout (missing Stripe price).",
        });
      }

      const stripe = getStripe();

      // 2. Get or create Stripe customer
      let stripeCustomerId: string | undefined;

      const existingSub = await ctx.db
        .select({ stripeCustomerId: subscriptions.stripeCustomerId })
        .from(subscriptions)
        .where(eq(subscriptions.userId, ctx.userId))
        .limit(1);

      if (existingSub[0]?.stripeCustomerId) {
        stripeCustomerId = existingSub[0].stripeCustomerId;
      } else {
        const customer = await stripe.customers.create({
          metadata: { userId: ctx.userId },
        });
        stripeCustomerId = customer.id;
      }

      // 3. Create Stripe checkout session
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: stripeCustomerId,
        line_items: [
          {
            price: plan.stripePriceId,
            quantity: 1,
          },
        ],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        metadata: {
          userId: ctx.userId,
          planId: input.planId,
        },
      });

      return {
        sessionId: session.id,
        url: session.url,
      };
    }),

  /**
   * Create a Stripe billing portal session so users can manage
   * their subscription, payment methods, and invoices.
   */
  billingPortal: protectedProcedure
    .input(
      z.object({
        returnUrl: z.string().url(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const subResult = await ctx.db
        .select({ stripeCustomerId: subscriptions.stripeCustomerId })
        .from(subscriptions)
        .where(eq(subscriptions.userId, ctx.userId))
        .limit(1);

      const stripeCustomerId = subResult[0]?.stripeCustomerId;
      if (!stripeCustomerId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No billing account found. Please subscribe to a plan first.",
        });
      }

      const stripe = getStripe();

      const session = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: input.returnUrl,
      });

      return { url: session.url };
    }),

  /**
   * Cancel the current subscription at the end of the billing period.
   */
  cancelSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    const subResult = await ctx.db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, ctx.userId),
          eq(subscriptions.status, "active"),
        ),
      )
      .limit(1);

    const sub = subResult[0];
    if (!sub) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No active subscription found.",
      });
    }

    if (!sub.stripeSubscriptionId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Subscription has no associated Stripe subscription.",
      });
    }

    const stripe = getStripe();

    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    const updated = await ctx.db
      .update(subscriptions)
      .set({
        cancelAtPeriodEnd: true,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, sub.id))
      .returning();

    const result = updated[0];
    if (!result) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update subscription.",
      });
    }

    return result;
  }),

  /**
   * Resume a subscription that was previously set to cancel at period end.
   */
  resumeSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    const subResult = await ctx.db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, ctx.userId),
          eq(subscriptions.cancelAtPeriodEnd, true),
        ),
      )
      .limit(1);

    const sub = subResult[0];
    if (!sub) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No subscription pending cancellation found.",
      });
    }

    if (!sub.stripeSubscriptionId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Subscription has no associated Stripe subscription.",
      });
    }

    const stripe = getStripe();

    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });

    const updated = await ctx.db
      .update(subscriptions)
      .set({
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, sub.id))
      .returning();

    const result = updated[0];
    if (!result) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to update subscription.",
      });
    }

    return result;
  }),

  /**
   * Get invoices for the current user, ordered by most recent first.
   */
  invoices: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(50).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const result = await ctx.db
        .select()
        .from(invoices)
        .where(eq(invoices.userId, ctx.userId))
        .orderBy(desc(invoices.createdAt))
        .limit(input.limit);

      return result;
    }),

  /**
   * Get usage stats for the current user against their plan limits.
   */
  usage: protectedProcedure.query(async ({ ctx }) => {
    // Free plan defaults
    const FREE_PLAN_DEFAULTS = {
      sitesLimit: 1,
      deploymentsPerMonth: 10,
      aiRequestsPerMonth: 100,
      customDomains: false,
      name: "Free",
    };

    // 1. Get user's subscription + plan
    const subResult = await ctx.db
      .select({
        plan: plans,
      })
      .from(subscriptions)
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .where(
        and(
          eq(subscriptions.userId, ctx.userId),
          eq(subscriptions.status, "active"),
        ),
      )
      .limit(1);

    const plan = subResult[0]?.plan;

    const sitesLimit = plan?.sitesLimit ?? FREE_PLAN_DEFAULTS.sitesLimit;
    const deploymentsLimit = plan?.deploymentsPerMonth ?? FREE_PLAN_DEFAULTS.deploymentsPerMonth;
    const aiRequestsLimit = plan?.aiRequestsPerMonth ?? FREE_PLAN_DEFAULTS.aiRequestsPerMonth;
    const customDomains = plan?.customDomains ?? FREE_PLAN_DEFAULTS.customDomains;
    const planName = plan?.name ?? FREE_PLAN_DEFAULTS.name;

    // 2. Count user's sites
    const sitesResult = await ctx.db
      .select({ value: count() })
      .from(sites)
      .where(eq(sites.userId, ctx.userId));

    const sitesUsed = sitesResult[0]?.value ?? 0;

    // 3. Count deployments this calendar month
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get user's site IDs first
    const userSites = await ctx.db
      .select({ id: sites.id })
      .from(sites)
      .where(eq(sites.userId, ctx.userId));

    const siteIds = userSites.map((s) => s.id);

    let deploymentsUsed = 0;
    if (siteIds.length > 0) {
      const deploymentsResult = await ctx.db
        .select({ value: count() })
        .from(deployments)
        .where(
          and(
            inArray(deployments.siteId, siteIds),
            gte(deployments.createdAt, firstOfMonth),
          ),
        );

      deploymentsUsed = deploymentsResult[0]?.value ?? 0;
    }

    return {
      sites: { used: sitesUsed, limit: sitesLimit },
      deploymentsThisMonth: { used: deploymentsUsed, limit: deploymentsLimit },
      aiRequestsThisMonth: { used: 0, limit: aiRequestsLimit },
      customDomains,
      planName,
    };
  }),
});
