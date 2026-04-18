import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "@back-to-the-future/db";
import { plans, subscriptions } from "@back-to-the-future/db/schema";
import { router, publicProcedure, protectedProcedure } from "../init";
import { createCheckoutSession, createPortalSession } from "../../stripe/checkout";
import { auditMiddleware } from "../../middleware/audit";
import { sendEmail } from "../../email/client";

// ── Pre-launch guard ────────────────────────────────────────────────
// Authorised by Craig on 16 Apr 2026. Stripe activation is ENV-DRIVEN.
// Default (unset / "false") is SAFE — the platform stays in pre-launch
// and every payment-creating procedure (checkout, portal, subscription
// start, payment-intent) short-circuits with a clean SERVICE_UNAVAILABLE
// response. The UI detects this via `billing.getStatus` and renders the
// PreLaunchBilling surface instead of raw error bubbles.
//
// Flip to "true" ONLY when billing goes live post-launch. Webhook
// HANDLERS are intentionally left untouched — they must still parse any
// late-firing Stripe webhook defensively, independent of this flag.
function isBillingEnabled(): boolean {
  return process.env["STRIPE_ENABLED"] === "true";
}

function assertBillingEnabled(): void {
  if (!isBillingEnabled()) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Billing is not yet operational. Crontech is in pre-launch.",
    });
  }
}

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
  // ── Public status probe for the UI ─────────────────────────────────
  // The frontend calls this BEFORE it decides whether to render the
  // full checkout UI or the PreLaunchBilling waitlist surface. Never
  // throws — always returns a plain boolean so the UI can render a
  // graceful pre-launch experience instead of an error bubble.
  getStatus: publicProcedure.query(() => {
    return { enabled: isBillingEnabled() };
  }),

  // ── Pre-launch waitlist sign-up ────────────────────────────────────
  // Public endpoint so visitors can register interest while billing is
  // off. Best-effort: never fails the request if the notification email
  // can't be dispatched — we still want the acknowledgement to feel
  // instant, and the console log below keeps a local trail.
  joinWaitlist: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      const supportEmail = process.env["SUPPORT_EMAIL"] ?? "support@crontech.ai";
      try {
        await sendEmail(
          supportEmail,
          "[Crontech] New billing waitlist signup",
          `<p>A visitor joined the billing waitlist:</p><p><strong>${input.email}</strong></p><p>Source: <code>/billing</code> pre-launch surface.</p>`,
        );
      } catch (err: unknown) {
        console.warn(
          "[billing] waitlist notify failed:",
          err instanceof Error ? err.message : String(err),
        );
      }
      console.info(`[billing] waitlist signup: ${input.email}`);
      return { ok: true as const };
    }),

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
      assertBillingEnabled();
      return createCheckoutSession({ priceId: input.priceId });
    }),

  createPortalSession: protectedProcedure
    .input(z.object({ customerId: z.string() }))
    .use(auditMiddleware("billing.portal"))
    .mutation(async ({ input }) => {
      assertBillingEnabled();
      return createPortalSession({ customerId: input.customerId });
    }),
});
