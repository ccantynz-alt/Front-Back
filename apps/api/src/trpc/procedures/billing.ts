import { z } from "zod";
import { log } from "../../log";
import { and, eq, gte, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "@back-to-the-future/db";
import {
  plans,
  subscriptions,
  buildMinutesUsage,
  billingAccounts,
  deployments,
} from "@back-to-the-future/db/schema";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../init";
import { createCheckoutSession, createPortalSession } from "../../stripe/checkout";
import { createPortalSession as createPortalSessionUrl } from "../../stripe/client";
import { auditMiddleware } from "../../middleware/audit";
import { sendEmail } from "../../email/client";
import {
  reportUsageForUser,
  reportAllPendingUsage,
} from "../../billing/usage-reporter";
import { currentBillingMonth } from "../../billing/usage-meter";

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
    stripePriceId: process.env["STRIPE_PRICE_PRO_MONTHLY"] ?? "",
    price: 2900,
    interval: "monthly" as const,
    features: JSON.stringify(["Unlimited projects", "Advanced AI builder", "Video editor", "Real-time collaboration", "Priority support"]),
    isActive: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Custom solutions for large organizations",
    stripePriceId: process.env["STRIPE_PRICE_ENTERPRISE_MONTHLY"] ?? "",
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
      log.info(`[billing] waitlist signup: ${input.email}`);
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
      // Real Stripe price IDs never contain "_" after the "price_" prefix.
      // An empty string or "price_pro_monthly" means env vars aren't wired.
      if (!input.priceId || input.priceId.slice(6).includes("_")) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Stripe price "${input.priceId}" is not configured. Set STRIPE_PRICE_PRO_MONTHLY / STRIPE_PRICE_ENTERPRISE_MONTHLY in the server env and restart.`,
        });
      }
      return createCheckoutSession({ priceId: input.priceId });
    }),

  createPortalSession: protectedProcedure
    .input(z.object({ customerId: z.string() }))
    .use(auditMiddleware("billing.portal"))
    .mutation(async ({ input }) => {
      assertBillingEnabled();
      return createPortalSession({ customerId: input.customerId });
    }),

  // ── Usage reporter (admin-only) ──────────────────────────────────
  // Pushes aggregated usage_events → Stripe for a single user OR every
  // active subscription. Intended for:
  //   - nightly cron (reportAllPendingUsage)
  //   - manual triage when Craig wants to flush a specific user's meter
  //
  // Both variants respect the STRIPE_ENABLED pre-launch guard upstream
  // in usage-reporter.ts, so calling this in pre-launch is a clean
  // no-op rather than a thrown error. Admin-only because it touches the
  // revenue path and Stripe API quota.
  reportUsage: adminProcedure
    .input(
      z
        .object({
          userId: z.string().optional(),
          month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
        })
        .default({}),
    )
    .use(auditMiddleware("billing.reportUsage"))
    .mutation(async ({ input }) => {
      assertBillingEnabled();
      const month = input.month ?? currentBillingMonth();
      if (input.userId) {
        const outcome = await reportUsageForUser(input.userId, month);
        return { mode: "single" as const, month, outcome };
      }
      const summary = await reportAllPendingUsage(month);
      return { mode: "all" as const, month, summary };
    }),

  // ── BLK-010: Current month usage summary (protected) ──────────────
  // Returns the build minutes burned this calendar month plus the count
  // of deployments the user has ever shipped. Plumbing only: no dollar
  // amounts, no rate calculations — Craig wires pricing separately.
  getCurrentUsage: protectedProcedure.query(async ({ ctx }) => {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const minutesRows = await db
      .select({
        totalMinutes: sql<number>`COALESCE(SUM(${buildMinutesUsage.minutesUsed}), 0)`,
      })
      .from(buildMinutesUsage)
      .where(
        and(
          eq(buildMinutesUsage.userId, ctx.userId),
          gte(buildMinutesUsage.recordedAt, monthStart),
        ),
      );

    const deploymentRows = await db
      .select({
        count: sql<number>`COUNT(*)`,
      })
      .from(deployments)
      .where(eq(deployments.userId, ctx.userId));

    const buildMinutesThisMonth = Number(
      minutesRows[0]?.totalMinutes ?? 0,
    );
    const deploymentCount = Number(deploymentRows[0]?.count ?? 0);

    return {
      buildMinutesThisMonth,
      deploymentCount,
      // TODO(craig): attach metered-rate conversion once pricing is set.
    };
  }),

  // ── BLK-010: Stripe Billing Portal URL (admin-only) ───────────────
  // Admin-only by design — we don't want a self-serve portal launch to
  // fire before Craig has validated the Stripe configuration. Flip to
  // `protectedProcedure` once pricing is live and user-level portals
  // are wanted.
  getPortalUrl: adminProcedure
    .input(z.object({ returnUrl: z.string().url() }))
    .use(auditMiddleware("billing.getPortalUrl"))
    .mutation(async ({ ctx, input }) => {
      assertBillingEnabled();

      const account = await db.query.billingAccounts.findFirst({
        where: eq(billingAccounts.userId, ctx.userId),
      });

      const stripeCustomerId = account?.stripeCustomerId ?? null;
      if (!stripeCustomerId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "No Stripe Customer on file for this account. Complete checkout first.",
        });
      }

      const url = await createPortalSessionUrl(
        stripeCustomerId,
        input.returnUrl,
      );
      return { url };
    }),
});
