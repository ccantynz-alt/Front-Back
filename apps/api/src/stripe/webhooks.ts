import Stripe from "stripe";
import { log } from "../log";
import { eq } from "drizzle-orm";
import { db } from "@back-to-the-future/db";
import {
  subscriptions,
  payments,
  billingAccounts,
  billingEvents,
} from "@back-to-the-future/db/schema";
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

// ---------------------------------------------------------------------------
// BLK-010: Idempotency via billing_events table.
// ---------------------------------------------------------------------------

/**
 * Try to record the webhook event in `billing_events`. Returns `true` when the
 * row was newly inserted (caller should proceed with side-effects). Returns
 * `false` when the stripe_event_id is already present — the UNIQUE constraint
 * rejects replays at the DB layer, so we must never double-process.
 */
async function recordBillingEvent(
  event: Stripe.Event,
  userId?: string | null,
): Promise<boolean> {
  try {
    const result = await db
      .insert(billingEvents)
      .values({
        id: crypto.randomUUID(),
        userId: userId ?? null,
        stripeEventId: event.id,
        eventType: event.type,
        payloadJson: JSON.stringify(event),
        receivedAt: new Date(),
        processedAt: null,
      })
      .onConflictDoNothing({ target: billingEvents.stripeEventId })
      .returning({ id: billingEvents.id });
    return result.length > 0;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[stripe] Failed to record billing_event ${event.id}: ${msg}`);
    // If the conflict branch didn't fire (e.g. sqlite driver diff), assume
    // we already have this event and skip the side-effect.
    return false;
  }
}

async function markEventProcessed(stripeEventId: string): Promise<void> {
  await db
    .update(billingEvents)
    .set({ processedAt: new Date() })
    .where(eq(billingEvents.stripeEventId, stripeEventId));
}

/**
 * Ensure a billing_accounts row exists for (userId, stripeCustomerId).
 * Called from customer.created and from any handler that learns the mapping.
 */
async function upsertBillingAccount(
  userId: string,
  stripeCustomerId: string,
): Promise<void> {
  if (!userId || !stripeCustomerId) return;
  const existing = await db.query.billingAccounts.findFirst({
    where: eq(billingAccounts.stripeCustomerId, stripeCustomerId),
  });
  const now = new Date();
  if (existing) {
    if (existing.userId !== userId) {
      await db
        .update(billingAccounts)
        .set({ userId, updatedAt: now })
        .where(eq(billingAccounts.id, existing.id));
    }
    return;
  }
  await db.insert(billingAccounts).values({
    id: crypto.randomUUID(),
    userId,
    stripeCustomerId,
    createdAt: now,
    updatedAt: now,
  });
}

// ---------------------------------------------------------------------------
// Event handlers. Each is idempotent — safe to replay if upstream misbehaves.
// ---------------------------------------------------------------------------

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  log.info(`[stripe] Checkout completed: ${session.id}`);

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  if (!subscriptionId) {
    console.warn("[stripe] No subscription ID on checkout session");
    return;
  }

  const stripeSub = await getStripe().subscriptions.retrieve(subscriptionId);

  const customerId =
    typeof stripeSub.customer === "string"
      ? stripeSub.customer
      : stripeSub.customer.id;

  const userId =
    session.client_reference_id ??
    (session.metadata?.["userId"] as string | undefined) ??
    "";

  if (!userId) {
    console.error(
      "[stripe] No userId found on checkout session metadata or client_reference_id",
    );
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

  await upsertBillingAccount(userId, customerId);

  log.info(
    `[stripe] Subscription ${stripeSub.id} created for user ${userId}`,
  );

  const planName = session.metadata?.["plan"] as string | undefined;
  if (planName === "pro" || planName === "enterprise") {
    try {
      await provisionTenantDB(userId, planName);
      log.info(
        `[stripe] Tenant DB provisioned for user ${userId} (${planName})`,
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(
        `[stripe] Failed to provision tenant DB for user ${userId}: ${errMsg}`,
      );
    }
  }
}

async function handleSubscriptionCreated(
  sub: Stripe.Subscription,
): Promise<void> {
  log.info(`[stripe] Subscription created: ${sub.id}`);
  // Upsert via same path as "updated". The checkout handler is the primary
  // source of the first write; this case is for subscriptions created outside
  // the checkout flow (e.g. dashboard, portal).
  await handleSubscriptionUpdated(sub);
}

async function handleSubscriptionUpdated(
  sub: Stripe.Subscription,
): Promise<void> {
  log.info(`[stripe] Subscription updated: ${sub.id} -> ${sub.status}`);

  const priceId = sub.items.data[0]?.price?.id ?? "";
  const now = new Date();

  const customerId =
    typeof sub.customer === "string"
      ? sub.customer
      : (sub.customer?.id ?? null);

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

  // If we happen to know the user via an existing billing_accounts row,
  // touch the updatedAt so analytics sees recent activity.
  if (customerId) {
    const account = await db.query.billingAccounts.findFirst({
      where: eq(billingAccounts.stripeCustomerId, customerId),
    });
    if (account) {
      await db
        .update(billingAccounts)
        .set({ updatedAt: now })
        .where(eq(billingAccounts.id, account.id));
    }
  }
}

async function handleSubscriptionDeleted(
  sub: Stripe.Subscription,
): Promise<void> {
  log.info(`[stripe] Subscription deleted: ${sub.id}`);

  await db
    .update(subscriptions)
    .set({
      status: "canceled",
      cancelAtPeriodEnd: false,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.stripeSubscriptionId, sub.id));
}

async function handleCustomerCreated(
  customer: Stripe.Customer,
): Promise<void> {
  log.info(`[stripe] Customer created: ${customer.id}`);
  const userId = (customer.metadata?.["userId"] as string | undefined) ?? "";
  if (!userId) {
    console.warn(
      "[stripe] customer.created without userId metadata — skipping billing_accounts row",
    );
    return;
  }
  await upsertBillingAccount(userId, customer.id);
}

async function handleInvoicePaymentSucceeded(
  invoice: Stripe.Invoice,
): Promise<void> {
  log.info(`[stripe] Payment succeeded: ${invoice.id}`);

  const paymentIntentId =
    typeof invoice.payment_intent === "string"
      ? invoice.payment_intent
      : invoice.payment_intent?.id;

  if (!paymentIntentId) {
    console.warn("[stripe] No payment_intent on invoice");
    return;
  }

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

  if (subscriptionId) {
    await db
      .update(subscriptions)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));
  }
}

async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
): Promise<void> {
  log.info(`[stripe] Payment failed: ${invoice.id}`);

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

async function handlePaymentIntentEvent(
  pi: Stripe.PaymentIntent,
  eventType: string,
): Promise<void> {
  // Plumbing only — we record the event in billing_events but don't mirror
  // the PI state into any other table yet. Craig will decide downstream logic
  // once pricing is set.
  log.info(`[stripe] ${eventType}: ${pi.id} (${pi.status})`);
}

// ---------------------------------------------------------------------------
// Dispatch.
// ---------------------------------------------------------------------------

/**
 * Extract a user id from an event payload when possible, best-effort. Used to
 * populate billing_events.user_id. Null when unknowable (e.g. test.* events).
 */
function extractUserIdFromEvent(event: Stripe.Event): string | null {
  const obj = event.data.object as unknown as Record<string, unknown>;
  const meta = obj?.["metadata"] as Record<string, string> | undefined;
  if (meta?.["userId"]) return meta["userId"];
  const clientRef = obj?.["client_reference_id"] as string | undefined;
  if (clientRef) return clientRef;
  return null;
}

export async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  // Idempotency gate. If the event is already in billing_events we skip
  // every side-effect and return immediately.
  const maybeUserId = extractUserIdFromEvent(event);
  const fresh = await recordBillingEvent(event, maybeUserId);
  if (!fresh) {
    log.info(`[stripe] Replay ignored for event ${event.id}`);
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }
      case "customer.created": {
        const customer = event.data.object as Stripe.Customer;
        await handleCustomerCreated(customer);
        break;
      }
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionCreated(sub);
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
      case "invoice.payment_succeeded":
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentSucceeded(invoice);
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentFailed(invoice);
        break;
      }
      case "invoice.created":
      case "invoice.finalized":
      case "invoice.updated": {
        // Plumbing: logged in billing_events, no additional side-effect.
        log.info(`[stripe] ${event.type}: ${(event.data.object as Stripe.Invoice).id}`);
        break;
      }
      case "payment_intent.succeeded":
      case "payment_intent.payment_failed":
      case "payment_intent.canceled": {
        const pi = event.data.object as Stripe.PaymentIntent;
        await handlePaymentIntentEvent(pi, event.type);
        break;
      }
      default:
        log.info(`[stripe] Unhandled event: ${event.type}`);
    }

    await markEventProcessed(event.id);

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

    writeAudit({
      actorId: "stripe-webhook",
      action: "CREATE",
      resourceType: `stripe.${event.type}`,
      resourceId: event.id,
      result: "failure",
      detail: message,
    }).catch(() => {
      /* audit is best-effort */
    });

    throw err;
  }
}
