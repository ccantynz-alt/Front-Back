import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@back-to-the-future/db";
import { subscriptions, payments } from "@back-to-the-future/db/schema";
import { getStripe } from "./client";
import { provisionTenantDB } from "@back-to-the-future/db/tenant-manager";
import { writeAudit } from "../automation/audit-log";

export function constructWebhookEvent(
  rawBody: string,
  signature: string,
): Stripe.Event {
  const secret = process.env["STRIPE_WEBHOOK_SECRET"];
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  return getStripe().webhooks.constructEvent(rawBody, signature, secret);
}

function mapStripeStatus(
  status: Stripe.Subscription.Status,
): "active" | "canceled" | "past_due" | "trialing" {
  switch (status) {
    case "active":
      return "active";
    case "canceled":
      return "canceled";
    case "past_due":
      return "past_due";
    case "trialing":
      return "trialing";
    default:
      return "active";
  }
}

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  console.log(`[stripe] Checkout completed: ${session.id}`);

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  if (!subscriptionId) {
    console.warn("[stripe] No subscription ID on checkout session");
    return;
  }

  // Retrieve the full subscription from Stripe
  const stripeSub = await getStripe().subscriptions.retrieve(subscriptionId);

  const customerId =
    typeof stripeSub.customer === "string"
      ? stripeSub.customer
      : stripeSub.customer.id;

  // session.client_reference_id or metadata should carry the user ID
  const userId =
    session.client_reference_id ??
    (session.metadata?.["userId"] as string | undefined) ??
    "";

  if (!userId) {
    console.error("[stripe] No userId found on checkout session metadata or client_reference_id");
    return;
  }

  const priceId = stripeSub.items.data[0]?.price?.id ?? "";
  const now = new Date();

  await db
    .insert(subscriptions)
    .values({
      id: crypto.randomUUID(),
      userId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: stripeSub.id,
      stripePriceId: priceId,
      status: mapStripeStatus(stripeSub.status),
      currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: subscriptions.stripeSubscriptionId,
      set: {
        status: mapStripeStatus(stripeSub.status),
        stripePriceId: priceId,
        currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
        updatedAt: now,
      },
    });

  console.log(`[stripe] Subscription ${stripeSub.id} created for user ${userId}`);

  // Auto-provision tenant database for Pro and Enterprise plans
  const planName = session.metadata?.["plan"] as string | undefined;
  if (planName === "pro" || planName === "enterprise") {
    try {
      await provisionTenantDB(userId, planName);
      console.log(`[stripe] Tenant DB provisioned for user ${userId} (${planName})`);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[stripe] Failed to provision tenant DB for user ${userId}: ${errMsg}`);
      // Non-blocking: the user can manually provision later
    }
  }
}

async function handleSubscriptionUpdated(
  sub: Stripe.Subscription,
): Promise<void> {
  console.log(`[stripe] Subscription updated: ${sub.id} -> ${sub.status}`);

  const priceId = sub.items.data[0]?.price?.id ?? "";
  const now = new Date();

  await db
    .update(subscriptions)
    .set({
      status: mapStripeStatus(sub.status),
      stripePriceId: priceId,
      currentPeriodStart: new Date(sub.current_period_start * 1000),
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      updatedAt: now,
    })
    .where(eq(subscriptions.stripeSubscriptionId, sub.id));
}

async function handleSubscriptionDeleted(
  sub: Stripe.Subscription,
): Promise<void> {
  console.log(`[stripe] Subscription deleted: ${sub.id}`);

  await db
    .update(subscriptions)
    .set({
      status: "canceled",
      cancelAtPeriodEnd: false,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.stripeSubscriptionId, sub.id));
}

async function handlePaymentSucceeded(
  invoice: Stripe.Invoice,
): Promise<void> {
  console.log(`[stripe] Payment succeeded: ${invoice.id}`);

  const paymentIntentId =
    typeof invoice.payment_intent === "string"
      ? invoice.payment_intent
      : invoice.payment_intent?.id;

  if (!paymentIntentId) {
    console.warn("[stripe] No payment_intent on invoice");
    return;
  }

  // Find the subscription to get the userId
  const subscriptionId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription?.id;

  let userId = "";
  if (subscriptionId) {
    const existingSub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.stripeSubscriptionId, subscriptionId),
    });
    userId = existingSub?.userId ?? "";
  }

  if (!userId) {
    console.warn("[stripe] Could not resolve userId for payment record");
    return;
  }

  await db
    .insert(payments)
    .values({
      id: crypto.randomUUID(),
      userId,
      stripePaymentIntentId: paymentIntentId,
      amount: invoice.amount_paid ?? 0,
      currency: invoice.currency ?? "usd",
      status: "succeeded",
      createdAt: new Date(),
    })
    .onConflictDoNothing();

  // Also ensure subscription status is active
  if (subscriptionId) {
    await db
      .update(subscriptions)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));
  }
}

async function handlePaymentFailed(
  invoice: Stripe.Invoice,
): Promise<void> {
  console.log(`[stripe] Payment failed: ${invoice.id}`);

  const subscriptionId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription?.id;

  if (!subscriptionId) {
    console.warn("[stripe] No subscription on failed invoice");
    return;
  }

  await db
    .update(subscriptions)
    .set({ status: "past_due", updatedAt: new Date() })
    .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));
}

export async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(sub);
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentSucceeded(invoice);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }
      default:
        console.log(`[stripe] Unhandled event: ${event.type}`);
    }

    // Audit log for every stripe webhook event
    await writeAudit({
      actorId: "stripe-webhook",
      action: "CREATE",
      resourceType: `stripe.${event.type}`,
      resourceId: event.id,
      result: "success",
      detail: JSON.stringify({ eventType: event.type }),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[stripe] Error handling ${event.type}: ${message}`);

    // Audit the failure too
    writeAudit({
      actorId: "stripe-webhook",
      action: "CREATE",
      resourceType: `stripe.${event.type}`,
      resourceId: event.id,
      result: "failure",
      detail: message,
    }).catch(() => { /* audit is best-effort */ });

    throw err;
  }
}
