import Stripe from "stripe";

// ---------------------------------------------------------------------------
// Stripe client singleton
// ---------------------------------------------------------------------------

function getStripeKey(): string {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY environment variable is not set");
  }
  return key;
}

let _stripe: Stripe | undefined;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(getStripeKey(), {
      apiVersion: "2025-02-24.acacia",
      typescript: true,
    });
  }
  return _stripe;
}

// ---------------------------------------------------------------------------
// Customer helpers
// ---------------------------------------------------------------------------

export async function createCustomer(params: {
  email: string;
  name: string;
  userId: string;
}): Promise<Stripe.Customer> {
  const stripe = getStripe();
  return stripe.customers.create({
    email: params.email,
    name: params.name,
    metadata: { cronixUserId: params.userId },
  });
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

export async function createCheckoutSession(params: {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  quantity?: number;
  trialDays?: number;
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  return stripe.checkout.sessions.create({
    customer: params.customerId,
    mode: "subscription",
    line_items: [
      {
        price: params.priceId,
        quantity: params.quantity ?? 1,
      },
    ],
    ...(params.trialDays
      ? { subscription_data: { trial_period_days: params.trialDays } }
      : {}),
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    allow_promotion_codes: true,
  });
}

// ---------------------------------------------------------------------------
// Customer portal
// ---------------------------------------------------------------------------

export async function createPortalSession(params: {
  customerId: string;
  returnUrl: string;
}): Promise<Stripe.BillingPortal.Session> {
  const stripe = getStripe();
  return stripe.billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl,
  });
}

// ---------------------------------------------------------------------------
// Subscription management
// ---------------------------------------------------------------------------

export async function getSubscription(
  subscriptionId: string,
): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  return stripe.subscriptions.retrieve(subscriptionId);
}

export async function cancelSubscription(
  subscriptionId: string,
  cancelImmediately = false,
): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  if (cancelImmediately) {
    return stripe.subscriptions.cancel(subscriptionId);
  }
  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
}

// ---------------------------------------------------------------------------
// Usage-based billing
// ---------------------------------------------------------------------------

export async function reportUsage(params: {
  subscriptionItemId: string;
  quantity: number;
  timestamp?: number;
}): Promise<Stripe.Billing.MeterEvent | null> {
  const stripe = getStripe();
  // For metered billing, create a usage record on the subscription item
  const record = await stripe.subscriptionItems.createUsageRecord(
    params.subscriptionItemId,
    {
      quantity: params.quantity,
      timestamp: params.timestamp ?? Math.floor(Date.now() / 1000),
      action: "increment",
    },
  );
  return record as unknown as Stripe.Billing.MeterEvent | null;
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export async function listInvoices(
  customerId: string,
  limit = 12,
): Promise<Stripe.Invoice[]> {
  const stripe = getStripe();
  const result = await stripe.invoices.list({
    customer: customerId,
    limit,
  });
  return result.data;
}

// ---------------------------------------------------------------------------
// Webhook signature verification
// ---------------------------------------------------------------------------

export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string,
): Stripe.Event {
  const secret = process.env["STRIPE_WEBHOOK_SECRET"];
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET environment variable is not set");
  }
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(payload, signature, secret);
}
