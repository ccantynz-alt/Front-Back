import type { Context } from "hono";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@cronix/db";
import { subscriptions, paymentEvents } from "@cronix/db";
import { constructWebhookEvent } from "./stripe";
import { planFromStripePriceId } from "./plans";

// ---------------------------------------------------------------------------
// Event persistence (idempotent)
// ---------------------------------------------------------------------------

async function logEvent(event: Stripe.Event): Promise<boolean> {
  try {
    await db.insert(paymentEvents).values({
      id: crypto.randomUUID(),
      stripeEventId: event.id,
      type: event.type,
      data: JSON.stringify(event.data),
      processedAt: new Date(),
      createdAt: new Date(),
    });
    return true;
  } catch (err: unknown) {
    // UNIQUE constraint = already processed → skip (idempotent)
    if (
      err instanceof Error &&
      err.message.includes("UNIQUE constraint failed")
    ) {
      return false;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Individual event handlers
// ---------------------------------------------------------------------------

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  if (session.mode !== "subscription" || !session.subscription) return;

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription.id;

  if (!customerId || !subscriptionId) return;

  // Check if we already have a subscription row for this customer
  const existing = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, customerId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(subscriptions)
      .set({
        stripeSubscriptionId: subscriptionId,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.stripeCustomerId, customerId));
  }
}

async function handleSubscriptionUpsert(
  subscription: Stripe.Subscription,
): Promise<void> {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const priceId = subscription.items.data[0]?.price.id ?? null;

  const resolvedPlan = priceId ? planFromStripePriceId(priceId) : undefined;
  const plan = resolvedPlan?.id ?? "free";

  const values = {
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceId,
    status: subscription.status as
      | "active"
      | "canceled"
      | "past_due"
      | "trialing"
      | "incomplete"
      | "incomplete_expired"
      | "unpaid"
      | "paused",
    plan: plan as "free" | "pro" | "team" | "enterprise",
    currentPeriodStart: new Date(subscription.current_period_start * 1000),
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    updatedAt: new Date(),
  };

  // Try to update by stripeCustomerId first
  const result = await db
    .update(subscriptions)
    .set(values)
    .where(eq(subscriptions.stripeCustomerId, customerId));

  // If no row was updated, the customer might not have been created via our
  // checkout flow — create a placeholder row. The userId will need to be
  // resolved separately (e.g., via customer metadata).
  if (result.rowsAffected === 0) {
    const userId =
      (subscription.metadata?.["cronixUserId"] as string | undefined) ?? "";
    if (userId) {
      await db.insert(subscriptions).values({
        id: crypto.randomUUID(),
        userId,
        stripeCustomerId: customerId,
        ...values,
        createdAt: new Date(),
      });
    }
  }
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
): Promise<void> {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  await db
    .update(subscriptions)
    .set({
      status: "canceled",
      cancelAtPeriodEnd: false,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.stripeCustomerId, customerId));
}

async function handleInvoicePaymentSucceeded(
  invoice: Stripe.Invoice,
): Promise<void> {
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;

  if (!customerId) return;

  // Ensure subscription is marked active on successful payment
  await db
    .update(subscriptions)
    .set({
      status: "active",
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.stripeCustomerId, customerId));
}

async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
): Promise<void> {
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;

  if (!customerId) return;

  await db
    .update(subscriptions)
    .set({
      status: "past_due",
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.stripeCustomerId, customerId));
}

// ---------------------------------------------------------------------------
// Main webhook handler (Hono route handler)
// ---------------------------------------------------------------------------

export async function handleStripeWebhook(c: Context): Promise<Response> {
  const rawBody = await c.req.text();
  const signature = c.req.header("stripe-signature");

  if (!signature) {
    return c.json({ error: "Missing stripe-signature header" }, 400);
  }

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(rawBody, signature);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: `Webhook verification failed: ${message}` }, 400);
  }

  // Idempotent event logging — if already processed, return 200 immediately
  const isNew = await logEvent(event);
  if (!isNew) {
    return c.json({ received: true, duplicate: true });
  }

  // Dispatch to handler
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(
        event.data.object as Stripe.Checkout.Session,
      );
      break;

    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscriptionUpsert(
        event.data.object as Stripe.Subscription,
      );
      break;

    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(
        event.data.object as Stripe.Subscription,
      );
      break;

    case "invoice.payment_succeeded":
      await handleInvoicePaymentSucceeded(
        event.data.object as Stripe.Invoice,
      );
      break;

    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(
        event.data.object as Stripe.Invoice,
      );
      break;

    default:
      // Unhandled event type — logged but no action taken
      break;
  }

  return c.json({ received: true });
}
