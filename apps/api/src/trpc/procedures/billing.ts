import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@back-to-the-future/db";
import { plans, subscriptions } from "@back-to-the-future/db/schema";
import { router, publicProcedure, protectedProcedure } from "../init";
import { createCheckoutSession, createPortalSession } from "../../stripe/checkout";
import { auditMiddleware } from "../../middleware/audit";

const hardcodedPlans = [
  {
    id: "free",
    name: "Free",
    description: "Get started with the basics",
    stripePriceId: "",
    price: 0,
    interval: "monthly" as const,
    features: JSON.stringify(["1 project", "Basic AI builder", "Community support"]),
    isActive: true,
  },
  {
    id: "pro",
    name: "Pro",
    description: "For professionals and teams",
    stripePriceId: "price_pro_monthly",
    price: 2900,
    interval: "monthly" as const,
    features: JSON.stringify(["Unlimited projects", "Advanced AI builder", "Video editor", "Real-time collaboration", "Priority support"]),
    isActive: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Custom solutions for large organizations",
    stripePriceId: "price_enterprise_monthly",
    price: 9900,
    interval: "monthly" as const,
    features: JSON.stringify(["Everything in Pro", "Custom AI agents", "Sentinel intelligence", "SSO / SAML", "Dedicated support", "SLA guarantee"]),
    isActive: true,
  },
];

export const billingRouter = router({
  getPlans: publicProcedure.query(async () => {
    try {
      const dbPlans = await db.query.plans.findMany({
        where: eq(plans.isActive, true),
      });
      if (dbPlans.length > 0) {
        return dbPlans;
      }
    } catch (err: unknown) {
      console.warn("[billing] Failed to query plans from DB, using fallback:", err instanceof Error ? err.message : String(err));
    }
    // Fallback to hardcoded plans if DB is empty or unavailable
    return hardcodedPlans.filter((p) => p.isActive);
  }),

  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    try {
      const sub = await db.query.subscriptions.findFirst({
        where: eq(subscriptions.userId, ctx.userId),
        orderBy: (subs, { desc }) => [desc(subs.createdAt)],
      });

      if (sub) {
        // Look up the plan name from the price ID
        const plan = await db.query.plans.findFirst({
          where: eq(plans.stripePriceId, sub.stripePriceId),
        });

        return {
          status: sub.status,
          plan: plan?.name ?? "Unknown",
          userId: ctx.userId,
          stripeSubscriptionId: sub.stripeSubscriptionId,
          stripeCustomerId: sub.stripeCustomerId,
          currentPeriodEnd: sub.currentPeriodEnd,
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        };
      }
    } catch (err: unknown) {
      console.warn("[billing] Failed to query subscription from DB:", err instanceof Error ? err.message : String(err));
    }

    // No subscription found -- user is on the free plan
    return {
      status: "free" as const,
      plan: "Free",
      userId: ctx.userId,
      stripeSubscriptionId: null as string | null,
      stripeCustomerId: null as string | null,
      currentPeriodEnd: null as number | null,
      cancelAtPeriodEnd: false,
    };
  }),

  createCheckoutSession: protectedProcedure
    .input(z.object({ priceId: z.string() }))
    .use(auditMiddleware("billing.checkout"))
    .mutation(async ({ input }) => {
      return createCheckoutSession({ priceId: input.priceId });
    }),

  createPortalSession: protectedProcedure
    .input(z.object({ customerId: z.string() }))
    .use(auditMiddleware("billing.portal"))
    .mutation(async ({ input }) => {
      return createPortalSession({ customerId: input.customerId });
    }),
});
