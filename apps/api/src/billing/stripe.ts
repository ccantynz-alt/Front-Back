// ── Stripe Client Singleton ─────────────────────────────────────────
// Provides a shared Stripe instance and webhook signature verification.

import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

/**
 * Returns a singleton Stripe client configured from STRIPE_SECRET_KEY.
 * Throws if the env var is not set.
 */
export function getStripe(): Stripe {
  if (stripeInstance) return stripeInstance;

  const secretKey = process.env["STRIPE_SECRET_KEY"];
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY environment variable is not set");
  }

  stripeInstance = new Stripe(secretKey, {
    apiVersion: "2025-03-31.basil",
    typescript: true,
  });

  return stripeInstance;
}

/**
 * Verifies a Stripe webhook signature and returns the parsed event.
 * Throws Stripe.errors.StripeSignatureVerificationError on failure.
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
): Stripe.Event {
  const webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"];
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET environment variable is not set");
  }

  const stripe = getStripe();
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

/**
 * Reset the singleton (useful for testing).
 */
export function resetStripeInstance(): void {
  stripeInstance = null;
}
