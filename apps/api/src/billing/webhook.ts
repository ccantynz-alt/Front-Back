// ── Stripe Webhook Handler ──────────────────────────────────────────
// POST /webhook — receives Stripe webhook events, verifies signature,
// and updates subscription/invoice records in the database.

import { Hono } from "hono";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db, subscriptions, invoices } from "@back-to-the-future/db";
import { verifyWebhookSignature } from "./stripe";

export const webhookRoutes = new Hono();

// ── Structured Logger ───────────────────────────────────────────────

function log(
  level: "info" | "warn" | "error",
  message: string,
  data?: Record<string, unknown>,
): void {
  const entry = {
    level,
    service: "billing-webhook",
    message,
    timestamp: new Date().toISOString(),
    ...data,
  };
  if (level === "error") {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

// ── POST /webhook ───────────────────────────────────────────────────

webhookRoutes.post("/webhook", async (c) => {
  // Read raw body for HMAC verification — must NOT parse as JSON first
  const rawBody = await c.req.text();
  const signature = c.req.header("stripe-signature");

  if (!signature) {
    log("warn", "Missing stripe-signature header");
    return c.json({ error: "Missing stripe-signature header" }, 400);
  }

  let event: Stripe.Event;
  try {
    event = verifyWebhookSignature(rawBody, signature);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Signature verification failed";
    log("error", "Webhook signature verification failed", { error: message });
    return c.json({ error: "Invalid signature" }, 400);
  }

  log("info", "Webhook event received", {
    eventId: event.id,
    eventType: event.type,
  });

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "customer.subscription.created":
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        log("info", "Unhandled event type", { eventType: event.type });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log("error", "Error processing webhook event", {
      eventId: event.id,
      eventType: event.type,
      error: message,
    });
    // Return 200 to prevent Stripe retries for processing errors
    // (the event was authentic; we just failed to process it)
    return c.json({ received: true, error: "Processing error" }, 200);
  }

  return c.json({ received: true }, 200);
});

// ── Event Handlers ──────────────────────────────────────────────────

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const customerId = typeof session.customer === "string"
    ? session.customer
    : session.customer?.id;
  const subscriptionId = typeof session.subscription === "string"
    ? session.subscription
    : session.subscription?.id;

  if (!customerId || !subscriptionId) {
    log("warn", "checkout.session.completed missing customer or subscription", {
      sessionId: session.id,
    });
    return;
  }

  const userId = session.client_reference_id ?? session.metadata?.userId;
  if (!userId) {
    log("warn", "checkout.session.completed missing userId in client_reference_id or metadata", {
      sessionId: session.id,
    });
    return;
  }

  // Upsert subscription: update if exists, insert if not
  const existing = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, subscriptionId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(subscriptions)
      .set({
        stripeCustomerId: customerId,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));
  } else {
    await db.insert(subscriptions).values({
      id: crypto.randomUUID(),
      userId,
      planId: session.metadata?.planId ?? "default",
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  log("info", "checkout.session.completed processed", {
    sessionId: session.id,
    customerId,
    subscriptionId,
  });
}

async function handleSubscriptionCreated(
  subscription: Stripe.Subscription,
): Promise<void> {
  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;

  const existing = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, subscription.id))
    .limit(1);

  if (existing.length > 0) {
    // Already exists (likely created by checkout.session.completed)
    await db
      .update(subscriptions)
      .set({
        status: mapSubscriptionStatus(subscription.status),
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.stripeSubscriptionId, subscription.id));
  } else {
    const userId = subscription.metadata?.userId;
    if (!userId) {
      log("warn", "customer.subscription.created missing userId in metadata", {
        subscriptionId: subscription.id,
      });
      return;
    }

    await db.insert(subscriptions).values({
      id: crypto.randomUUID(),
      userId,
      planId: subscription.metadata?.planId ?? "default",
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      status: mapSubscriptionStatus(subscription.status),
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  log("info", "customer.subscription.created processed", {
    subscriptionId: subscription.id,
    status: subscription.status,
  });
}

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
): Promise<void> {
  await db
    .update(subscriptions)
    .set({
      status: mapSubscriptionStatus(subscription.status),
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.stripeSubscriptionId, subscription.id));

  log("info", "customer.subscription.updated processed", {
    subscriptionId: subscription.id,
    status: subscription.status,
  });
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
): Promise<void> {
  await db
    .update(subscriptions)
    .set({
      status: "canceled",
      cancelAtPeriodEnd: false,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.stripeSubscriptionId, subscription.id));

  log("info", "customer.subscription.deleted processed", {
    subscriptionId: subscription.id,
  });
}

async function handleInvoicePaymentSucceeded(
  invoice: Stripe.Invoice,
): Promise<void> {
  const customerId = typeof invoice.customer === "string"
    ? invoice.customer
    : invoice.customer?.id ?? "";
  const subscriptionId = typeof invoice.subscription === "string"
    ? invoice.subscription
    : invoice.subscription?.id;

  // Find the user from the subscription
  let userId: string | null = null;
  if (subscriptionId) {
    const sub = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, subscriptionId))
      .limit(1);
    if (sub.length > 0) {
      userId = sub[0].userId;
    }
  }

  // Upsert invoice record
  const existing = await db
    .select()
    .from(invoices)
    .where(eq(invoices.stripeInvoiceId, invoice.id))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(invoices)
      .set({
        status: "paid",
        amount: invoice.amount_paid ?? 0,
        paidAt: new Date(),
      })
      .where(eq(invoices.stripeInvoiceId, invoice.id));
  } else {
    await db.insert(invoices).values({
      id: crypto.randomUUID(),
      userId: userId ?? "unknown",
      subscriptionId: subscriptionId ?? null,
      stripeInvoiceId: invoice.id,
      amount: invoice.amount_paid ?? 0,
      currency: invoice.currency ?? "usd",
      status: "paid",
      paidAt: new Date(),
      createdAt: new Date(),
    });
  }

  // Update subscription status to active on successful payment
  if (subscriptionId) {
    await db
      .update(subscriptions)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));
  }

  log("info", "invoice.payment_succeeded processed", {
    invoiceId: invoice.id,
    customerId,
    amountPaid: invoice.amount_paid,
  });
}

async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
): Promise<void> {
  const subscriptionId = typeof invoice.subscription === "string"
    ? invoice.subscription
    : invoice.subscription?.id;

  if (subscriptionId) {
    await db
      .update(subscriptions)
      .set({ status: "past_due", updatedAt: new Date() })
      .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));
  }

  // Record the failed invoice
  const existing = await db
    .select()
    .from(invoices)
    .where(eq(invoices.stripeInvoiceId, invoice.id))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(invoices)
      .set({ status: "open" })
      .where(eq(invoices.stripeInvoiceId, invoice.id));
  } else {
    let userId: string | null = null;
    if (subscriptionId) {
      const sub = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.stripeSubscriptionId, subscriptionId))
        .limit(1);
      if (sub.length > 0) {
        userId = sub[0].userId;
      }
    }

    await db.insert(invoices).values({
      id: crypto.randomUUID(),
      userId: userId ?? "unknown",
      subscriptionId: subscriptionId ?? null,
      stripeInvoiceId: invoice.id,
      amount: invoice.amount_due ?? 0,
      currency: invoice.currency ?? "usd",
      status: "open",
      createdAt: new Date(),
    });
  }

  log("info", "invoice.payment_failed processed", {
    invoiceId: invoice.id,
    subscriptionId,
  });
}

// ── Helpers ─────────────────────────────────────────────────────────

function mapSubscriptionStatus(
  stripeStatus: string,
): "active" | "past_due" | "canceled" | "trialing" | "unpaid" | "incomplete" {
  const statusMap: Record<string, "active" | "past_due" | "canceled" | "trialing" | "unpaid" | "incomplete"> = {
    active: "active",
    past_due: "past_due",
    canceled: "canceled",
    trialing: "trialing",
    unpaid: "unpaid",
    incomplete: "incomplete",
    incomplete_expired: "incomplete",
    paused: "active",
  };
  return statusMap[stripeStatus] ?? "incomplete";
}
